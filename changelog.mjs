#!/usr/bin/env node

/**
 * 📝 AI Changelog Generator
 *
 * Minimal setup - just drop this file in your repo and run:
 *
 * 1. Get Gemini API key: https://makersuite.google.com/app/apikey
 * 2. export GEMINI_API_KEY="your-key-here"
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
    output: '.changelog-next.md',

    // Block pushes with breaking changes
    blockBreaking: true
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

    // Auto-detect range
    const remote = exec('git rev-parse --abbrev-ref @{upstream}') ||
        exec('git rev-parse --abbrev-ref origin/main') ||
        exec('git rev-parse --abbrev-ref origin/master');

    return remote ? `${remote}..HEAD` : 'HEAD~10..HEAD';
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
    const diff = exec(`git diff ${range} -- "${file}"`);
    return diff.split('\n')
        .filter(line => line.startsWith('@@'))
        .slice(0, 3) // Max 3 hunks per file
        .join('\n');
}

async function callGemini(changes) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ Set GEMINI_API_KEY environment variable');
        console.error('   Get one at: https://makersuite.google.com/app/apikey');
        process.exit(1);
    }

    const prompt = `Analyze these code changes and generate changelog entries.

Return ONLY valid JSON with this structure:
{
  "entries": [
    {
      "type": "feat|fix|refactor|docs|chore|breaking",
      "scope": "string", 
      "text": "concise user-facing description",
      "evidence": ["code snippet 1", "code snippet 2"]
    }
  ]
}

Rules:
- Focus on user-visible changes
- Use active voice, be concise
- Include 1-2 evidence snippets per entry
- Skip internal refactors unless significant

Changes:
${changes}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error('No response from Gemini');

    try {
        return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
    } catch (e) {
        throw new Error(`Invalid JSON response: ${e.message}\nResponse: ${text}`);
    }
}

function renderMarkdown(entries) {
    if (!entries.length) return '';

    const emojis = { feat: '✨', fix: '🐛', refactor: '♻️', docs: '📚', chore: '🔧', breaking: '💥' };
    const grouped = entries.reduce((acc, entry) => {
        (acc[entry.type] = acc[entry.type] || []).push(entry);
        return acc;
    }, {});

    let output = '## What\'s Changed\n\n';

    for (const type of ['breaking', 'feat', 'fix', 'refactor', 'docs', 'chore']) {
        if (grouped[type]) {
            for (const entry of grouped[type]) {
                const emoji = emojis[type] || '📝';
                output += `- ${emoji} (**${entry.scope}**) — ${entry.text}\n`;
            }
        }
    }

    // Add evidence
    output += '\n<details>\n<summary>🔍 Evidence</summary>\n\n';
    entries.forEach(entry => {
        output += `**${entry.scope}**: \`${entry.evidence.join('`, `')}\`\n\n`;
    });
    output += '</details>\n';

    return output;
}

function writeOutput(content) {
    const now = new Date().toISOString().split('T')[0];
    const fullContent = `# Changelog Preview\n\n${content}\n\n*Generated on ${now}*\n`;

    if (CONFIG.output.includes('CHANGELOG.md')) {
        // Append mode
        let existing = existsSync(CONFIG.output) ? readFileSync(CONFIG.output, 'utf8') : '';
        const unreleasedHeader = `\n## [Unreleased] - ${now}\n\n`;

        if (existing.includes('## [Unreleased]')) {
            // Insert after existing unreleased
            existing = existing.replace(/(## \[Unreleased\][^\n]*\n)/, `$1\n${content}\n`);
        } else {
            // Add new unreleased section
            existing = existing.replace(/^(# [^\n]*\n\n?)/, `$1${unreleasedHeader}${content}\n\n`);
        }
        writeFileSync(CONFIG.output, existing);
    } else {
        // Next file mode
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

if [ -z "$GEMINI_API_KEY" ]; then
  echo "⚠️  GEMINI_API_KEY not set, skipping changelog"
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

    // Handle flags
    if (args.includes('--install-hook')) {
        return installHook();
    }

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🤖 AI Changelog Generator

Setup:
  1. Get API key: https://makersuite.google.com/app/apikey
  2. export GEMINI_API_KEY="your-key"

Usage:
  node changelog.mjs                    Generate changelog
  node changelog.mjs --dry-run          Preview only
  node changelog.mjs --range A..B       Specific git range
  node changelog.mjs --install-hook     Install git hook

Config: Edit CONFIG object at top of this file
Output: ${CONFIG.output}
`);
        return;
    }

    const isDryRun = args.includes('--dry-run');

    try {
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

        // Build change summary
        const changes = relevantFiles.map(file => {
            const scope = getScope(file);
            const diff = getDiff(range, file);
            return `FILE: ${file}\nSCOPE: ${scope}\nCHANGES:\n${diff}`;
        }).join('\n\n---\n\n');

        // Generate changelog
        console.log('🤖 Calling AI...');
        const result = await callGemini(changes);

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
            console.log('\n❌ Push blocked. Override with: BREAKING_OK=1');
            process.exit(1);
        }

        // Render and output
        const markdown = renderMarkdown(result.entries);

        console.log('\n📋 PREVIEW:');
        console.log('='.repeat(50));
        console.log(markdown);
        console.log('='.repeat(50));

        if (isDryRun) {
            console.log('\n🏃 DRY RUN - no files written');
        } else {
            writeOutput(markdown);
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