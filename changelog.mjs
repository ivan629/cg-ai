#!/usr/bin/env node

/**
 * 📝 AI Changelog Generator
 *
 * Minimal setup - just drop this file in your repo and run:
 *
 * 1. Get Claude API key: https://console.anthropic.com/settings/keys
 * 2. export ANTHROPIC_API_KEY="your-key-here"
 * 3. node changelog.mjs --dry-run
 *
 * Usage:
 *   node changelog.mjs                           # Generate for recent changes
 *   node changelog.mjs --dry-run                 # Preview only
 *   node changelog.mjs --range HEAD~5..HEAD     # Specific range
 *   node changelog.mjs --install-hook           # Install git pre-push hook
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// =============================================================================
// 🔧 MINIMAL CONFIGURATION (edit as needed)
// =============================================================================

const CONFIG = {
    // Files to ignore (common noise)
    ignore: [
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        '*.map', '*.min.js', '*.min.css',
        '*.png', '*.jpg', '*.gif', '*.webp', '*.mp4',
        '*.env*', '*.pem', '*.key',
        'dist/', 'build/', 'node_modules/', '.git/'
    ],

    // Scope mapping: file pattern -> scope name
    scopes: {
        'src/components/**': 'ui',
        'src/features/**': 'features',
        'src/utils/**': 'utils',
        'src/api/**': 'api',
        'docs/**': 'docs',
        'tests/**': 'tests',
        '*.config.*': 'config'
    },

    // Output file (set to 'CHANGELOG.md' to append directly)
    output: 'CHANGELOG.md',

    // Block pushes with breaking changes
    blockBreaking: false,

    // Claude model to use
    model: 'claude-3-5-sonnet-20241022',

    // Base branch to compare against (auto-detected if not set)
    baseBranch: null  // e.g., 'origin/main', 'origin/develop'
};

// =============================================================================
// 🛠️ CORE FUNCTIONS
// =============================================================================

function exec(cmd, silent = true) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' }).trim();
    } catch (e) {
        if (silent) return '';
        throw e;
    }
}

function getRange(args) {
    const rangeFlag = args.indexOf('--range');
    if (rangeFlag !== -1) return args[rangeFlag + 1];

    // Use configured base branch if set
    let baseBranch = CONFIG.baseBranch;

    // If not configured, find the main branch
    if (!baseBranch) {
        // Check common main branch names
        const possibleBases = ['origin/main', 'origin/master', 'origin/develop', 'upstream/main', 'upstream/master'];
        for (const base of possibleBases) {
            if (exec(`git rev-parse --verify ${base} 2>/dev/null`)) {
                baseBranch = base;
                break;
            }
        }
    }

    if (!baseBranch) {
        console.error('❌ Could not find main branch. Please specify with --base flag');
        console.error('   Example: node changelog.mjs --base origin/main');
        process.exit(1);
    }

    // Always fetch latest from remote
    const remote = baseBranch.split('/')[0];
    console.log(`📡 Fetching latest from ${remote}...`);
    exec(`git fetch ${remote} 2>/dev/null`, true);

    // Simply compare current branch against the base branch
    const commitCount = exec(`git rev-list --count ${baseBranch}..HEAD`);
    console.log(`🔀 Comparing current branch against ${baseBranch} (${commitCount} commits)`);

    return `${baseBranch}..HEAD`;
}

function getChangedFiles(range) {
    return exec(`git diff --name-only ${range}`).split('\n').filter(Boolean);
}

function shouldIgnore(file) {
    return CONFIG.ignore.some(pattern => {
        if (pattern.endsWith('/')) return file.startsWith(pattern);
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(file);
        }
        return file.includes(pattern) || file.endsWith(pattern);
    });
}

function getScope(file) {
    for (const [pattern, scope] of Object.entries(CONFIG.scopes)) {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        if (regex.test(file)) return scope;
    }

    // Auto-scope from path
    const parts = file.split('/');
    return parts.length > 1 ? parts[0] : 'core';
}

function getDiff(range, file) {
    // Get the full diff for the file across all commits in the range
    const diff = exec(`git diff ${range} -- "${file}"`);

    // Instead of just getting @@ lines, get actual diff content
    const lines = diff.split('\n');
    const relevantLines = [];
    let inHunk = false;
    let hunkCount = 0;

    for (const line of lines) {
        if (line.startsWith('@@')) {
            if (hunkCount >= 3) break; // Max 3 hunks per file
            hunkCount++;
            inHunk = true;
            relevantLines.push(line);
        } else if (inHunk && (line.startsWith('+') || line.startsWith('-'))) {
            // Include actual changes (additions and deletions)
            relevantLines.push(line);
        } else if (inHunk && line === '') {
            // Keep empty lines in hunks
            relevantLines.push(line);
        } else if (!line.startsWith(' ')) {
            // Reset when we hit something that's not part of the diff
            inHunk = false;
        }
    }

    return relevantLines.join('\n');
}

async function callClaude(changes) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('❌ Set ANTHROPIC_API_KEY environment variable');
        console.error('   Get one at: https://console.anthropic.com/settings/keys');
        process.exit(1);
    }

    const prompt = `Analyze these code changes and generate changelog entries in the style of a professional changelog.

Return ONLY valid JSON with this structure:
{
  "entries": [
    {
      "type": "feat|fix|breaking|improve|refactor|docs|test",
      "category": "string (e.g., 'Component Enhancements', 'New Components', 'Bug Fixes', 'Performance Optimizations')",
      "scope": "string (component or area name)", 
      "description": "clear user-facing description",
      "prNumber": "PR number if found in commits",
      "ticketId": "ticket ID if found (e.g., PV2-123)",
      "details": ["optional array of sub-points for complex changes"]
    }
  ]
}

Rules:
- Focus on user-visible changes and impacts
- Group related changes under appropriate categories
- Use professional, clear language
- Extract PR numbers from commit messages (e.g., #123)
- Extract ticket IDs from commit messages (e.g., PV2-123, JIRA-456)
- For breaking changes, include migration instructions in details
- Prioritize features and breaking changes over minor fixes
- Skip internal-only refactors unless they improve performance

Changes:
${changes}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: CONFIG.model,
            max_tokens: 4096,
            temperature: 0.2,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) throw new Error('No response from Claude');

    try {
        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');

        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        throw new Error(`Invalid JSON response: ${e.message}\nResponse: ${text}`);
    }
}

function renderMarkdown(entries, baseBranch) {
    if (!entries.length) return '';

    const now = new Date().toISOString().split('T')[0];
    const version = getNextVersion();

    // Group entries by category
    const grouped = entries.reduce((acc, entry) => {
        const category = entry.category || getDefaultCategory(entry.type);
        if (!acc[category]) acc[category] = [];
        acc[category].push(entry);
        return acc;
    }, {});

    // Start with version header
    let output = `## [${version}] – ${now}\n\n`;

    // Add breaking changes first if any
    const breakingChanges = entries.filter(e => e.type === 'breaking');
    if (breakingChanges.length > 0) {
        output += `### ⚠️ BREAKING CHANGES\n\n`;
        breakingChanges.forEach(entry => {
            const pr = entry.prNumber ? ` ([#${entry.prNumber}](https://github.com/securityscorecard/component-library/pull/${entry.prNumber}))` : '';
            const ticket = entry.ticketId ? ` (${entry.ticketId})` : '';
            output += `#### ${entry.scope}\n`;
            output += `- **${entry.description}**${pr}${ticket}\n`;
            if (entry.details && entry.details.length > 0) {
                entry.details.forEach(detail => {
                    output += `  - ${detail}\n`;
                });
            }
            output += '\n';
        });
    }

    // Define category order
    const categoryOrder = [
        'New Features', '🚀 Features', 'Features',
        'Component Enhancements', 'New Components',
        'Improvements', '🔧 Improvements',
        'Bug Fixes', '🐛 Bug Fixes',
        'Performance Optimizations',
        'Refactoring', '🔄 Refactoring',
        'Documentation', '📝 Documentation',
        'Testing', 'Test Improvements'
    ];

    // Add other categories in order
    categoryOrder.forEach(category => {
        if (grouped[category] && !isBreakingCategory(category)) {
            const categoryEntries = grouped[category].filter(e => e.type !== 'breaking');
            if (categoryEntries.length > 0) {
                output += `### ${category}\n\n`;

                // Sub-group by scope if many entries
                const scopeGroups = categoryEntries.reduce((acc, entry) => {
                    const scope = entry.scope || 'General';
                    if (!acc[scope]) acc[scope] = [];
                    acc[scope].push(entry);
                    return acc;
                }, {});

                // Output by scope
                Object.entries(scopeGroups).forEach(([scope, scopeEntries]) => {
                    if (Object.keys(scopeGroups).length > 1 && scope !== 'General') {
                        output += `#### ${scope}\n`;
                    }

                    scopeEntries.forEach(entry => {
                        const pr = entry.prNumber ? ` ([#${entry.prNumber}](https://github.com/securityscorecard/component-library/pull/${entry.prNumber}))` : '';
                        const ticket = entry.ticketId ? ` (${entry.ticketId})` : '';

                        if (Object.keys(scopeGroups).length === 1) {
                            output += `- **${entry.scope}**${pr}${ticket} – ${entry.description}\n`;
                        } else {
                            output += `- ${entry.description}${pr}${ticket}\n`;
                        }

                        if (entry.details && entry.details.length > 0) {
                            entry.details.forEach(detail => {
                                output += `  - ${detail}\n`;
                            });
                        }
                    });

                    if (Object.keys(scopeGroups).length > 1) {
                        output += '\n';
                    }
                });
                output += '\n';
            }
        }
    });

    // Add any uncategorized entries
    Object.entries(grouped).forEach(([category, categoryEntries]) => {
        if (!categoryOrder.includes(category)) {
            output += `### ${category}\n\n`;
            categoryEntries.forEach(entry => {
                const pr = entry.prNumber ? ` ([#${entry.prNumber}](https://github.com/securityscorecard/component-library/pull/${entry.prNumber}))` : '';
                const ticket = entry.ticketId ? ` (${entry.ticketId})` : '';
                output += `- **${entry.scope}**${pr}${ticket} – ${entry.description}\n`;
                if (entry.details && entry.details.length > 0) {
                    entry.details.forEach(detail => {
                        output += `  - ${detail}\n`;
                    });
                }
            });
            output += '\n';
        }
    });

    return output;
}

function getDefaultCategory(type) {
    const categoryMap = {
        'feat': '🚀 Features',
        'fix': '🐛 Bug Fixes',
        'improve': '🔧 Improvements',
        'refactor': '🔄 Refactoring',
        'docs': '📝 Documentation',
        'test': 'Test Improvements',
        'breaking': '⚠️ BREAKING CHANGES'
    };
    return categoryMap[type] || 'Other Changes';
}

function isBreakingCategory(category) {
    return category.includes('BREAKING');
}

function getNextVersion() {
    // Try to read current version from CHANGELOG.md
    if (existsSync('CHANGELOG.md')) {
        const changelog = readFileSync('CHANGELOG.md', 'utf8');
        const versionMatch = changelog.match(/## \[(\d+\.\d+\.\d+)\]/);
        if (versionMatch) {
            const [major, minor, patch] = versionMatch[1].split('.').map(Number);
            // Increment patch version by default
            return `${major}.${minor}.${patch + 1}`;
        }
    }
    return '0.0.1';
}

function writeOutput(content, baseBranch) {
    const now = new Date().toISOString().split('T')[0];

    if (CONFIG.output === 'CHANGELOG.md') {
        // Read existing changelog
        let existing = '';
        if (existsSync(CONFIG.output)) {
            existing = readFileSync(CONFIG.output, 'utf8');
        } else {
            // Create new changelog with header
            existing = '# Changelog\n\n';
        }

        // Find the position after the main header
        const headerMatch = existing.match(/^# Changelog\n+/);
        if (headerMatch) {
            const insertPosition = headerMatch.index + headerMatch[0].length;
            // Insert new content after header
            existing = existing.slice(0, insertPosition) + content + '\n' + existing.slice(insertPosition);
        } else {
            // No header found, prepend everything
            existing = '# Changelog\n\n' + content + '\n' + existing;
        }

        writeFileSync(CONFIG.output, existing);
    } else {
        // Write to separate file
        const fullContent = `# Changelog Preview\n\n${content}\n\n---\n\n**Full Changelog**: Compare at [${baseBranch}...HEAD](https://github.com/securityscorecard/component-library/compare/${baseBranch.replace('origin/', '')}...HEAD)\n\n*Generated on ${now}*\n`;
        const dir = dirname(CONFIG.output);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(CONFIG.output, fullContent);
    }
}

function installHook() {
    const hookPath = '.git/hooks/pre-push';
    const hookContent = `#!/bin/bash
# Auto-changelog pre-push hook
set -e

if [ ! -f "changelog.mjs" ]; then
  echo "⚠️  changelog.mjs not found, skipping"
  exit 0
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  ANTHROPIC_API_KEY not set, skipping changelog"
  exit 0
fi

echo "🤖 Generating changelog..."
if node changelog.mjs; then
  echo "✅ Changelog updated"
else
  echo "❌ Changelog generation failed - push blocked"
  echo "   Use 'git push --no-verify' to skip"
  exit 1
fi
`;

    writeFileSync(hookPath, hookContent);
    exec('chmod +x .git/hooks/pre-push');
    console.log('✅ Git pre-push hook installed');
    console.log('   Will run automatically on git push');
    console.log('   Bypass with: git push --no-verify');
}

// =============================================================================
// 🚀 MAIN
// =============================================================================

async function main() {
    const args = process.argv.slice(2);

    // Handle base branch flag
    const baseFlag = args.indexOf('--base');
    if (baseFlag !== -1) {
        CONFIG.baseBranch = args[baseFlag + 1];
    }

    // Handle flags
    if (args.includes('--install-hook')) {
        return installHook();
    }

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🤖 AI Changelog Generator (Claude Edition)

Setup:
  1. Get API key: https://console.anthropic.com/settings/keys
  2. export ANTHROPIC_API_KEY="your-key"

Usage:
  node changelog.mjs                    Generate changelog (compare to main)
  node changelog.mjs --dry-run          Preview only
  node changelog.mjs --base origin/dev  Compare against specific branch
  node changelog.mjs --range A..B       Specific git range
  node changelog.mjs --install-hook     Install git hook

Examples:
  node changelog.mjs --base origin/develop     # Compare to develop branch
  node changelog.mjs --base origin/staging     # Compare to staging branch
  node changelog.mjs --base feature/other      # Compare to another feature
  
Breaking Changes:
  If breaking changes are detected, push will be blocked.
  Override with: BREAKING_OK=1 node changelog.mjs
  Or for git push: BREAKING_OK=1 git push

Config: Edit CONFIG object at top of this file
Output: ${CONFIG.output}
Model: ${CONFIG.model}
`);
        return;
    }

    const isDryRun = args.includes('--dry-run');

    try {
        const currentBranch = exec('git rev-parse --abbrev-ref HEAD');
        const baseBranch = CONFIG.baseBranch || 'origin/main';

        console.log(`🌳 Current branch: ${currentBranch}`);
        console.log(`🎯 Comparing against: ${baseBranch}`);
        console.log('🔍 Analyzing changes...');

        // Get changes
        const range = getRange(args);
        const allFiles = getChangedFiles(range);
        const relevantFiles = allFiles.filter(f => !shouldIgnore(f));

        console.log(`📊 Range: ${range}`);
        console.log(`📁 Files: ${allFiles.length} total, ${relevantFiles.length} relevant`);

        if (!relevantFiles.length) {
            console.log('✅ No relevant changes found');
            return;
        }

        // Build change summary with more context
        const changes = relevantFiles.map(file => {
            const scope = getScope(file);
            const diff = getDiff(range, file);

            // Get commit messages for this file in the range
            const commits = exec(`git log --oneline ${range} -- "${file}"`);

            return `FILE: ${file}\nSCOPE: ${scope}\nCOMMITS:\n${commits}\nCHANGES:\n${diff}`;
        }).join('\n\n---\n\n');

        // Add summary of all commits in range
        const allCommits = exec(`git log --oneline ${range}`);
        const prTitle = exec('git log -1 --pretty=%B') || 'PR Changes';
        const fullChanges = `PR/BRANCH: ${prTitle.split('\n')[0]}\nCOMMIT RANGE: ${range}\nALL COMMITS:\n${allCommits}\n\n---\n\n${changes}`;

        // Generate changelog
        console.log('🤖 Calling Claude...');
        const result = await callClaude(fullChanges);

        if (!result.entries?.length) {
            console.log('ℹ️  No user-facing changes detected');
            return;
        }

        console.log(`📝 Generated ${result.entries.length} entries`);

        // Check for breaking changes
        const breaking = result.entries.filter(e => e.type === 'breaking');
        if (breaking.length && CONFIG.blockBreaking && !process.env.BREAKING_OK) {
            console.log('\n💥 BREAKING CHANGES DETECTED:');
            breaking.forEach(e => console.log(`   - ${e.scope}: ${e.text}`));
            console.log('\n❌ Push blocked due to breaking changes.');
            console.log('\n📝 To override and continue:');
            console.log('   • For this run: BREAKING_OK=1 node changelog.mjs');
            console.log('   • For git push: BREAKING_OK=1 git push');
            console.log('   • Disable permanently: set blockBreaking: false in CONFIG');
            process.exit(1);
        }

        // Render and output
        const markdown = renderMarkdown(result.entries, baseBranch);

        console.log('\n📋 PREVIEW:');
        console.log('='.repeat(50));
        console.log(markdown);
        console.log('='.repeat(50));

        if (isDryRun) {
            console.log('\n🏃 DRY RUN - no files written');
        } else {
            writeOutput(markdown, baseBranch);
            console.log(`\n✅ Written to: ${CONFIG.output}`);
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
