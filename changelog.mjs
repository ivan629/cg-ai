

/**
 * 🚀 AI-Powered Changelog Generator
 *
 * A professional tool that leverages Claude AI to automatically generate
 * high-quality, user-focused changelog entries from git commits.
 *
 * Features:
 * - Interactive branch selection with fuzzy search
 * - Intelligent commit analysis and categorization
 * - Professional markdown formatting
 * - Breaking change detection and management
 * - Customizable scopes and categories
 *
 * @author Your Team
 * @version 2.0.0
 * @license MIT
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import readline from 'readline';

// =============================================================================
// 📋 CONFIGURATION
// =============================================================================

/**
 * Main configuration object for the changelog generator
 * Most settings are auto-detected - only override if needed
 */
const CONFIG = {
    // Files to ignore - auto-detected from .gitignore
    ignorePatterns: [],  // Will be populated from .gitignore

    // Scope mapping - completely automatic from file paths
    scopeMapping: {},  // Empty = full auto-detection

    // Output configuration
    output: {
        file: 'CHANGELOG.md',  // Standard name
        appendToExisting: true,
        shouldIncureaseVersion: false
    },

    // Safety features
    safety: {
        blockBreakingChanges: false,
        requireApprovalForBreaking: true
    },

    // AI configuration
    ai: {
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.2,
        maxTokens: 4096
    },

    // Git configuration - all auto-detected
    git: {
        defaultBaseBranch: null,  // Auto-detected
        platform: null,           // Auto-detected from remote URL
        prUrlPattern: null,       // Auto-generated based on platform
        ticketUrlPattern: null    // Auto-detected from commit patterns
    },

    // UI configuration
    ui: {
        maxBranchesDisplay: 10,
        colors: {
            selected: '\x1b[36m',
            warning: '\x1b[33m',
            success: '\x1b[32m',
            error: '\x1b[31m',
            reset: '\x1b[0m'
        }
    }
};

// =============================================================================
// 🛠️ UTILITY FUNCTIONS
// =============================================================================

/**
 * Execute a shell command and return the output
 * @param {string} command - The command to execute
 * @param {boolean} silent - Whether to suppress output
 * @returns {string} Command output
 */
function executeCommand(command, silent = true) {
    try {
        const options = {
            encoding: 'utf8',
            stdio: silent ? 'pipe' : 'inherit'
        };
        return execSync(command, options).trim();
    } catch (error) {
        if (silent) return '';
        throw error;
    }
}

/**
 * Log a message with a specific style
 * @param {string} message - The message to log
 * @param {string} prefix - Emoji or symbol prefix
 * @param {string} color - Color code
 */
function log(message, prefix = '', color = '') {
    const resetColor = CONFIG.ui.colors.reset;
    console.log(`${prefix} ${color}${message}${resetColor}`);
}

/**
 * Log an error message
 * @param {string} message - The error message
 */
function logError(message) {
    log(message, '❌', CONFIG.ui.colors.error);
}

/**
 * Log a success message
 * @param {string} message - The success message
 */
function logSuccess(message) {
    log(message, '✅', CONFIG.ui.colors.success);
}

/**
 * Log an info message
 * @param {string} message - The info message
 */
function logInfo(message) {
    log(message, 'ℹ️ ', CONFIG.ui.colors.reset);
}

/**
 * Log a warning message
 * @param {string} message - The warning message
 */
function logWarning(message) {
    log(message, '⚠️ ', CONFIG.ui.colors.warning);
}

// =============================================================================
// 🔍 AUTO-CONFIGURATION DETECTION
// =============================================================================

/**
 * Auto-detect project configuration
 */
class ConfigAutoDetector {
    /**
     * Load ignore patterns from .gitignore
     * @returns {string[]} Ignore patterns
     */
    static loadGitignorePatterns() {
        try {
            if (existsSync('.gitignore')) {
                const gitignore = readFileSync('.gitignore', 'utf8');
                return gitignore
                    .split('\n')
                    .filter(line => line.trim() && !line.startsWith('#'))
                    .map(line => line.trim());
            }
        } catch (error) {
            // Fallback to sensible defaults
        }

        // Default patterns if no .gitignore
        return [
            'node_modules/', 'dist/', 'build/', '.next/', '.nuxt/',
            '*.log', '*.map', '*.min.js', '*.min.css',
            '.env*', '*.pem', '*.key'
        ];
    }

    /**
     * Detect git platform from remote URL
     * @returns {string} Platform name
     */
    static detectGitPlatform() {
        try {
            const remoteUrl = executeCommand('git config --get remote.origin.url');

            if (remoteUrl.includes('github.com')) return 'github';
            if (remoteUrl.includes('gitlab.com')) return 'gitlab';
            if (remoteUrl.includes('bitbucket.org')) return 'bitbucket';
            if (remoteUrl.includes('dev.azure.com')) return 'azure';

            // Check for self-hosted instances
            if (remoteUrl.includes('gitlab')) return 'gitlab';
            if (remoteUrl.includes('bitbucket')) return 'bitbucket';

            return 'github'; // Default
        } catch {
            return 'github';
        }
    }

    /**
     * Detect main branch
     * @returns {string|null} Main branch name
     */
    static detectMainBranch() {
        //TODO: no autodetection, we select branch
        return null;
    }

    /**
     * Detect ticket pattern from commit history
     * @returns {string|null} Ticket URL pattern
     */
    static detectTicketPattern() {
        try {
            // Get recent commits to analyze patterns
            const commits = executeCommand('git log --oneline -100');

            // Common ticket patterns
            const patterns = [
                { regex: /JIRA-\d+/gi, url: 'https://jira.company.com/browse/${ticketId}' },
                { regex: /GH-\d+/gi, url: null }, // GitHub issues, handled by PR links
                { regex: /\[#\d+\]/gi, url: null }, // PR references
                { regex: /[A-Z]{2,}-\d+/g, url: null } // Generic pattern
            ];

            // Count occurrences
            const counts = {};
            patterns.forEach(({ regex }) => {
                const matches = commits.match(regex) || [];
                if (matches.length > 0) {
                    const pattern = regex.source;
                    counts[pattern] = matches.length;
                }
            });

            // If we found ticket patterns, we might have a ticket system
            // But we can't know the URL without configuration
            if (Object.keys(counts).length > 0) {
                logInfo('Detected ticket references in commits. Add ticketUrlPattern to CONFIG if you want clickable links.');
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Initialize auto-detected configuration
     */
    static initialize() {
        // Auto-detect ignore patterns
        CONFIG.ignorePatterns = this.loadGitignorePatterns();

        // Auto-detect git platform
        CONFIG.git.platform = this.detectGitPlatform();

        // Auto-detect main branch
        CONFIG.git.defaultBaseBranch = this.detectMainBranch();

        // Auto-detect ticket patterns
        CONFIG.git.ticketUrlPattern = this.detectTicketPattern();

        log(`Auto-detected configuration:`, '🔍');
        log(`Platform: ${CONFIG.git.platform}`, '  ');
        log(`Main branch: ${CONFIG.git.defaultBaseBranch || 'will select interactively'}`, '  ');
        log(`Ignore patterns: ${CONFIG.ignorePatterns.length} patterns from .gitignore`, '  ');
    }
}

// =============================================================================
// 🌿 GIT OPERATIONS
// =============================================================================

/**
 * Git utility functions for repository operations
 */
class GitOperations {
    /**
     * Get the current branch name
     * @returns {string} Current branch name
     */
    static getCurrentBranch() {
        return executeCommand('git rev-parse --abbrev-ref HEAD');
    }

    /**
     * Get recent branches from reflog with caching
     * @param {number} limit - Maximum number of branches to return
     * @returns {string[]} Array of recent branch names
     */
    static getRecentBranches(limit = 10) {
        // Cache recent branches to avoid repeated git calls
        if (!this._recentBranchesCache) {
            const command = `git reflog show --pretty=format:"%gs" --grep-reflog="checkout" | ` +
                           `grep -oE "[^ ]+$" | grep -v "^HEAD$" | awk "!seen[$0]++" | head -${limit}`;

            const currentBranch = this.getCurrentBranch();
            this._recentBranchesCache = executeCommand(command)
                .split('\n')
                .filter(branch => branch && branch !== currentBranch);
        }
        return this._recentBranchesCache;
    }

    /**
     * Get all remote branches
     * @returns {string[]} Array of remote branch names
     */
    static getRemoteBranches() {
        return executeCommand('git branch -r')
            .split('\n')
            .map(branch => branch.trim())
            .filter(branch => branch && !branch.includes('->') && !branch.includes('HEAD'))
            .map(branch => branch.replace('origin/', ''));
    }

    /**
     * Get all local branches
     * @returns {string[]} Array of local branch names
     */
    static getLocalBranches() {
        const currentBranch = this.getCurrentBranch();
        return executeCommand('git branch')
            .split('\n')
            .map(branch => branch.trim().replace('* ', ''))
            .filter(branch => branch && branch !== currentBranch);
    }

    /**
     * Fetch latest changes from remote
     * @param {string} remote - Remote name (e.g., 'origin')
     */
    static fetchRemote(remote) {
        log(`Fetching latest from ${remote}...`, '📡');
        executeCommand(`git fetch ${remote} 2>/dev/null`, true);
    }

    /**
     * Get the number of commits between two refs
     * @param {string} from - Starting ref
     * @param {string} to - Ending ref
     * @returns {number} Number of commits
     */
    static getCommitCount(from, to) {
        return parseInt(executeCommand(`git rev-list --count ${from}..${to}`)) || 0;
    }

    /**
     * Get changed files between two refs
     * @param {string} range - Git range (e.g., 'main..HEAD')
     * @returns {string[]} Array of changed file paths
     */
    static getChangedFiles(range) {
        return executeCommand(`git diff --name-only ${range}`)
            .split('\n')
            .filter(Boolean);
    }

    /**
     * Get diff for a specific file
     * @param {string} range - Git range
     * @param {string} file - File path
     * @returns {string} Formatted diff
     */
    static getFileDiff(range, file) {
        const diff = executeCommand(`git diff ${range} -- "${file}"`);
        const lines = diff.split('\n');
        const relevantLines = [];
        let inHunk = false;
        let hunkCount = 0;
        const maxHunks = 3;

        for (const line of lines) {
            if (line.startsWith('@@')) {
                if (hunkCount >= maxHunks) break;
                hunkCount++;
                inHunk = true;
                relevantLines.push(line);
            } else if (inHunk && (line.startsWith('+') || line.startsWith('-'))) {
                relevantLines.push(line);
            } else if (inHunk && line === '') {
                relevantLines.push(line);
            } else if (!line.startsWith(' ')) {
                inHunk = false;
            }
        }

        return relevantLines.join('\n');
    }

    /**
     * Get commit messages for a file in a range
     * @param {string} range - Git range
     * @param {string} file - File path
     * @returns {string} Commit messages
     */
    static getFileCommits(range, file) {
        return executeCommand(`git log --oneline ${range} -- "${file}"`);
    }

    /**
     * Get all commits in a range
     * @param {string} range - Git range
     * @returns {string} All commit messages
     */
    static getAllCommits(range) {
        return executeCommand(`git log --oneline ${range}`);
    }

    /**
     * Get the latest commit message
     * @returns {string} Latest commit message
     */
    static getLatestCommitMessage() {
        return executeCommand('git log -1 --pretty=%B') || 'PR Changes';
    }
}

// =============================================================================
// 🔍 BRANCH SELECTION UI
// =============================================================================

/**
 * Interactive branch selection with fuzzy search
 */
class BranchSelector {
    constructor() {
        this.selectedIndex = 0;
        this.searchQuery = '';
        this.scrollOffset = 0;
        this.allBranches = [];
        this.filteredBranches = [];
    }

    /**
     * Build an ordered list of branches with priority
     * @returns {string[]} Ordered array of branch names
     */
    buildBranchList() {
        const localBranches = GitOperations.getLocalBranches();
        const remoteBranches = GitOperations.getRemoteBranches();
        const recentBranches = GitOperations.getRecentBranches();

        // Priority branches (main/master first)
        const priorityBranches = ['master', 'main'];
        const defaultBranch = priorityBranches.find(branch =>
            localBranches.includes(branch) || remoteBranches.includes(branch)
        ) || 'master';

        // Combine all unique branches
        const allBranches = [...new Set([...localBranches, ...remoteBranches])];

        // Other branches (not priority or recent)
        const otherBranches = allBranches
            .filter(branch =>
                !priorityBranches.includes(branch) &&
                !recentBranches.includes(branch)
            )
            .sort();

        // Build final ordered list
        this.allBranches = [
            defaultBranch,
            ...recentBranches.filter(branch =>
                branch !== defaultBranch && allBranches.includes(branch)
            ),
            ...otherBranches
        ].filter((branch, index, array) => array.indexOf(branch) === index);

        this.filteredBranches = this.allBranches;
        return this.allBranches;
    }

    /**
     * Filter branches based on search query with fuzzy matching
     * @param {string} query - Search query
     * @returns {string[]} Filtered branches
     */
    filterBranches(query) {
        if (!query) return this.allBranches;

        const lowerQuery = query.toLowerCase();

        // Score branches based on match quality
        const scored = this.allBranches.map(branch => {
            const lowerBranch = branch.toLowerCase();
            let score = 0;

            // Scoring rules
            if (lowerBranch === lowerQuery) {
                score = 1000; // Exact match
            } else if (lowerBranch.startsWith(lowerQuery)) {
                score = 100; // Starts with query
            } else if (lowerBranch.split(/[/-]/).some(part => part.startsWith(lowerQuery))) {
                score = 50; // Word boundary match
            } else if (lowerBranch.includes(lowerQuery)) {
                score = 10; // Contains query
            } else {
                // Fuzzy match (characters in order)
                let queryIndex = 0;
                for (let i = 0; i < lowerBranch.length && queryIndex < lowerQuery.length; i++) {
                    if (lowerBranch[i] === lowerQuery[queryIndex]) {
                        queryIndex++;
                        score += 1;
                    }
                }
                if (queryIndex !== lowerQuery.length) score = 0;
            }

            return { branch, score };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.branch);
    }

    /**
     * Display the branch selection UI
     */
    display() {
        // Buffer all output first
        const outputLines = [];

        // Add header
        outputLines.push('\n🔍 Search and select branch to compare against:');
        outputLines.push('   (Type to search, ↑↓ to navigate, Enter to select, Esc to clear, q to quit)\n');

        // Show search query
        const searchDisplay = this.searchQuery
            ? `🔎 Search: ${this.searchQuery}_`
            : '🔎 Type to search...';
        outputLines.push(`   ${searchDisplay}\n`);

        // Update filtered branches
        this.filteredBranches = this.filterBranches(this.searchQuery);

        if (this.filteredBranches.length === 0) {
            outputLines.push('   No branches match your search');

            // Clear screen and render all at once
            process.stdout.write('\x1B[2J\x1B[0f' + outputLines.join('\n'));
            return;
        }

        // Adjust selection if needed
        if (this.selectedIndex >= this.filteredBranches.length) {
            this.selectedIndex = 0;
            this.scrollOffset = 0;
        }

        // Build branch display lines
        const start = this.scrollOffset;
        const end = Math.min(start + CONFIG.ui.maxBranchesDisplay, this.filteredBranches.length);

        for (let i = start; i < end; i++) {
            outputLines.push(this.getBranchLine(i));
        }

        // Show scroll indicator
        if (this.filteredBranches.length > CONFIG.ui.maxBranchesDisplay) {
            outputLines.push(`\n   Showing ${start + 1}-${end} of ${this.filteredBranches.length} matches`);
        }

        // Clear screen and render all at once
        process.stdout.write('\x1B[2J\x1B[0f' + outputLines.join('\n'));
    }

    /**
     * Get a formatted branch line (without rendering)
     * @param {number} index - Branch index
     * @returns {string} Formatted branch line
     */
    getBranchLine(index) {
        const branch = this.filteredBranches[index];
        const isSelected = index === this.selectedIndex;
        const colors = CONFIG.ui.colors;

        // Selection indicator
        const prefix = isSelected ? '▶ ' : '  ';

        // Color for selected item
        const highlight = isSelected ? colors.selected : '';
        const reset = colors.reset;

        // Add labels for special branches
        let label = '';
        const recentBranches = GitOperations.getRecentBranches();
        if (branch === 'master' || branch === 'main') {
            label = ` ${colors.warning}(default)${reset}`;
        } else if (recentBranches.includes(branch)) {
            label = ` ${colors.success}(recent)${reset}`;
        }

        // Highlight matching parts
        let displayName = branch;
        if (this.searchQuery && !isSelected) {
            const regex = new RegExp(`(${this.searchQuery.split('').join('.*?')})`, 'gi');
            displayName = branch.replace(regex, `${colors.warning}$1${reset}`);
        }

        return `${prefix}${highlight}${isSelected ? branch : displayName}${label}${reset}`;
    }

    /**
     * Handle keyboard input
     * @param {string} str - Character input
     * @param {Object} key - Key object
     */
    handleKeypress(str, key) {
        if (key && key.name === 'up') {
            this.moveSelection(-1);
        } else if (key && key.name === 'down') {
            this.moveSelection(1);
        } else if (key && key.name === 'return') {
            return this.selectCurrent();
        } else if (key && key.name === 'escape') {
            this.clearSearch();
        } else if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
            this.quit();
        } else if (key && key.name === 'backspace') {
            this.removeCharacter();
        } else if (str && !key.ctrl && !key.meta) {
            this.addCharacter(str);
        }
        return null;
    }

    /**
     * Move selection up or down
     * @param {number} direction - Direction (-1 for up, 1 for down)
     */
    moveSelection(direction) {
        if (direction < 0) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            if (this.selectedIndex < this.scrollOffset) {
                this.scrollOffset = this.selectedIndex;
            }
        } else {
            this.selectedIndex = Math.min(this.filteredBranches.length - 1, this.selectedIndex + 1);
            if (this.selectedIndex >= this.scrollOffset + CONFIG.ui.maxBranchesDisplay) {
                this.scrollOffset = this.selectedIndex - CONFIG.ui.maxBranchesDisplay + 1;
            }
        }
        this.display();
    }

    /**
     * Select the current branch
     * @returns {string} Selected branch name
     */
    selectCurrent() {
        if (this.filteredBranches.length === 0) return null;

        const selected = this.filteredBranches[this.selectedIndex];
        const localBranches = GitOperations.getLocalBranches();
        const fullBranch = localBranches.includes(selected) ? selected : `origin/${selected}`;

        return fullBranch;
    }

    /**
     * Clear the search query
     */
    clearSearch() {
        this.searchQuery = '';
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.display();
    }

    /**
     * Quit the selection
     */
    quit() {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log('\n❌ Cancelled');
        process.exit(0);
    }

    /**
     * Remove a character from search
     */
    removeCharacter() {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.display();
    }

    /**
     * Add a character to search
     * @param {string} char - Character to add
     */
    addCharacter(char) {
        this.searchQuery += char;
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this.display();
    }

    /**
     * Run the interactive branch selection
     * @returns {Promise<string>} Selected branch
     */
    async select() {
        this.buildBranchList();

        // Set up keyboard input
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        return new Promise((resolve) => {
            this.display();

            const handleKeypress = (str, key) => {
                const result = this.handleKeypress(str, key);
                if (result) {
                    process.stdin.setRawMode(false);
                    process.stdin.removeListener('keypress', handleKeypress);
                    process.stdin.pause();
                    logSuccess(`Selected: ${result}`);
                    resolve(result);
                }
            };

            process.stdin.on('keypress', handleKeypress);
            process.stdin.resume();
        });
    }
}

// =============================================================================
// 🤖 AI INTEGRATION
// =============================================================================

/**
 * Claude AI integration for changelog generation
 */
class AIChangelogGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://api.anthropic.com/v1/messages';
    }

    /**
     * Build the prompt for Claude
     * @param {string} changes - Formatted changes text
     * @returns {string} AI prompt
     */
    buildPrompt(changes) {
        return `Analyze these code changes and generate changelog entries in the style of a professional changelog.

            Return ONLY valid JSON with this structure:
        {
            "entries": [
            {
                "type": "feat|fix|breaking|improve|refactor|docs|test",
                "category": "string (${CATEGORIES.join('|')})",
                "scope": "string (component or area name)",
                "description": "clear user-facing description",
                "prNumber": "PR number if found in commits",
                "ticketId": "ticket ID if found (e.g., JIRA-123)",
                "details": ["optional array of sub-points for complex changes"]
            }
        ]
        }

        Guidelines:
        - Focus on user-visible changes and impacts
        - Use clear, professional language
        - Group related changes logically
        - Extract PR numbers from commit messages (#123)
        - Extract ticket IDs from commit messages (JIRA-456, PV2-123)
        - For breaking changes, include migration instructions
        - Prioritize features and breaking changes over minor fixes
        - Skip internal-only refactors unless they improve performance
        - Write descriptions from the user's perspective
        - Make all code terms bold with \`single backticks\`: variable names, function names, file names, parameters, classes, methods, properties, CLI flags, branches, and any code-related words.

        Changes to analyze:
            ${changes}`;
    }

    /**
     * Call Claude API
     * @param {string} changes - Formatted changes
     * @returns {Promise<Object>} Parsed changelog entries
     */
    async generateChangelog(changes) {
        const prompt = this.buildPrompt(changes);

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: CONFIG.ai.model,
                max_tokens: CONFIG.ai.maxTokens,
                temperature: CONFIG.ai.temperature,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        const text = data.content?.[0]?.text;

        if (!text) {
            throw new Error('No response from Claude');
        }

        return this.parseResponse(text);
    }

    /**
     * Parse Claude's response
     * @param {string} text - Response text
     * @returns {Object} Parsed JSON
     */
    parseResponse(text) {
        try {
            // Extract JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            throw new Error(`Invalid JSON response: ${error.message}\nResponse: ${text}`);
        }
    }
}

// =============================================================================
// 📝 CHANGELOG FORMATTER
// =============================================================================

const CATEGORIES = [
    '✨ New Features',
    '🚀 Features',
    '🎯 Enhancements',
    '🛠️ Improvements',
    '🐛 Bug Fixes',
    '⚡ Performance',
    '♻️ Refactoring',
    '📚 Documentation',
    '🧪 Testing',
    '🔧 Configuration'
];

/**
 * Formats changelog entries into professional markdown
 */
class ChangelogFormatter {
    constructor() {
        this.categoryOrder = [...CATEGORIES];

        this.typeToCategory = {
            'feat': '✨ New Features',
            'fix': '🐛 Bug Fixes',
            'improve': '🛠️ Improvements',
            'refactor': '♻️ Refactoring',
            'docs': '📚 Documentation',
            'test': '🧪 Testing',
            'breaking': '⚠️ BREAKING CHANGES'
        };
    }

    /**
     * Get the next version number
     * @returns {string} Next semantic version
     */
    getNextVersion() {
        if (existsSync('CHANGELOG.md')) {
            const changelog = readFileSync('CHANGELOG.md', 'utf8');

            // Find all version headers
            const versionRegex = /^## \[(\d+\.\d+\.\d+)\]/gm;
            const versions = [];
            let match;

            while ((match = versionRegex.exec(changelog)) !== null) {
                versions.push(match[1]);
            }

            if (versions.length > 0) {
                // Get the latest version (first one found, as they're in reverse chronological order)
                const latestVersion = versions[0];
                const [major, minor, patch] = latestVersion.split('.').map(Number);

                if (!CONFIG.output.shouldIncureaseVersion) {
                    return latestVersion;
                }

                // TODO: Implement semantic versioning logic based on change types
                // For now, just increment patch version
                return `${major}.${minor}.${patch + 1}`;
            }
        }
        return '0.0.1';
    }

    /**
     * Format entries into markdown
     * @param {Array} entries - Changelog entries
     * @param {string} baseBranch - Base branch name
     * @returns {string} Formatted markdown
     */
    formatMarkdown(entries, baseBranch) {
        if (!entries.length) return '';

        const date = new Date().toISOString().split('T')[0];
        const version = this.getNextVersion();

        // Group entries by category
        const grouped = this.groupByCategory(entries);

        // Build markdown
        let output = this.formatHeader(version, date);

        // Add breaking changes first
        output += this.formatBreakingChanges(entries);

        // Add other categories
        output += this.formatCategories(grouped);

        return output;
    }

    /**
     * Group entries by category
     * @param {Array} entries - Changelog entries
     * @returns {Object} Grouped entries
     */
    groupByCategory(entries) {
        return entries.reduce((acc, entry) => {
            const category = entry.category || this.typeToCategory[entry.type] || 'Other Changes';
            if (!acc[category]) acc[category] = [];
            acc[category].push(entry);
            return acc;
        }, {});
    }

    /**
     * Format the changelog header
     * @param {string} version - Version number
     * @param {string} date - Release date
     * @returns {string} Formatted header
     */
    formatHeader(version, date) {
        return `## [${version}] - ${date}\n\n`;
    }

    /**
     * Format breaking changes section
     * @param {Array} entries - All entries
     * @returns {string} Formatted breaking changes
     */
    formatBreakingChanges(entries) {
        const breakingChanges = entries.filter(e => e.type === 'breaking');
        if (breakingChanges.length === 0) return '';

        let output = `### ⚠️ BREAKING CHANGES\n\n`;

        breakingChanges.forEach(entry => {
            output += this.formatBreakingEntry(entry);
        });

        return output + '\n';
    }

    /**
     * Format a single breaking change entry
     * @param {Object} entry - Breaking change entry
     * @returns {string} Formatted entry
     */
    formatBreakingEntry(entry) {
        let output = `#### ${entry.scope}\n\n`;
        output += `**${entry.description}**`;
        output += this.formatMetadata(entry);
        output += '\n';

        if (entry.details && entry.details.length > 0) {
            output += '\n**Migration:**\n';
            entry.details.forEach(detail => {
                output += `- ${detail}\n`;
            });
        }

        return output + '\n';
    }

    /**
     * Format regular categories
     * @param {Object} grouped - Grouped entries
     * @returns {string} Formatted categories
     */
    formatCategories(grouped) {
        let output = '';

        this.categoryOrder.forEach(category => {
            if (grouped[category] && !this.isBreakingCategory(category)) {
                output += this.formatCategory(category, grouped[category]);
            }
        });

        // Add any uncategorized entries
        Object.entries(grouped).forEach(([category, entries]) => {
            if (!this.categoryOrder.includes(category) && !this.isBreakingCategory(category)) {
                output += this.formatCategory(category, entries);
            }
        });

        return output;
    }

    /**
     * Format a single category
     * @param {string} category - Category name
     * @param {Array} entries - Category entries
     * @returns {string} Formatted category
     */
    formatCategory(category, entries) {
        let output = `### ${category}\n\n`;

        // Group by scope if many entries
        if (entries.length > 5) {
            output += this.formatByScopeGroups(entries);
        } else {
            entries.forEach(entry => {
                output += this.formatEntry(entry);
            });
        }

        return output + '\n';
    }

    /**
     * Format entries grouped by scope
     * @param {Array} entries - Entries to format
     * @returns {string} Formatted entries
     */
    formatByScopeGroups(entries) {
        const byScope = entries.reduce((acc, entry) => {
            const scope = entry.scope || 'General';
            if (!acc[scope]) acc[scope] = [];
            acc[scope].push(entry);
            return acc;
        }, {});

        let output = '';
        Object.entries(byScope).forEach(([scope, scopeEntries]) => {
            if (scope !== 'General') {
                output += `#### ${scope}\n\n`;
            }

            scopeEntries.forEach(entry => {
                output += this.formatEntry(entry, scope === 'General');
            });

            output += '\n';
        });

        return output;
    }

    /**
     * Format a single entry
     * @param {Object} entry - Entry to format
     * @param {boolean} includeScope - Whether to include scope in output
     * @returns {string} Formatted entry
     */
    formatEntry(entry, includeScope = true) {
        let output = '- ';

        if (includeScope && entry.scope) {
            output += `**${entry.scope}**: `;
        }

        output += entry.description;
        output += this.formatMetadata(entry);
        output += '\n';

        if (entry.details && entry.details.length > 0) {
            entry.details.forEach(detail => {
                output += `  - ${detail}\n`;
            });
        }

        return output;
    }

    /**
     * Format metadata (PR number, ticket ID)
     * @param {Object} entry - Entry with metadata
     * @returns {string} Formatted metadata
     */
    formatMetadata(entry) {
        let metadata = '';

        if (entry.prNumber) {
            const repoUrl = this.getRepoUrl();
            let prUrl;

            // Auto-detect platform if not set
            const platform = CONFIG.git.platform || ConfigAutoDetector.detectGitPlatform();

            // Platform-specific PR URL patterns
            switch (platform) {
                case 'gitlab':
                    prUrl = `${repoUrl}/-/merge_requests/${entry.prNumber}`;
                    break;
                case 'bitbucket':
                    prUrl = `${repoUrl}/pull-requests/${entry.prNumber}`;
                    break;
                case 'azure':
                    prUrl = `${repoUrl}/pullrequest/${entry.prNumber}`;
                    break;
                default: // github
                    prUrl = repoUrl
                        ? `${repoUrl}/pull/${entry.prNumber}`
                        : `../../pull/${entry.prNumber}`;
            }

            metadata += ` ([#${entry.prNumber}](${prUrl}))`;
        }

        if (entry.ticketId) {
            // If ticket URL pattern is configured, create a link
            if (CONFIG.git.ticketUrlPattern) {
                const ticketUrl = CONFIG.git.ticketUrlPattern
                    .replace('${ticketId}', entry.ticketId);
                metadata += ` [${entry.ticketId}](${ticketUrl})`;
            } else {
                // Otherwise just show as code
                metadata += ` \`${entry.ticketId}\``;
    }
    }

        return metadata;
    }

    /**
     * Get repository URL from git config
     * @returns {string|null} Repository URL
     */
    getRepoUrl() {
        try {
            const remoteUrl = executeCommand('git config --get remote.origin.url');

            // Convert SSH to HTTPS
            if (remoteUrl.startsWith('git@')) {
                return remoteUrl
                    .replace('git@', 'https://')
                    .replace('.com:', '.com/')
                    .replace('.git', '');
            }

            return remoteUrl.replace('.git', '');
        } catch {
            return null;
        }
    }

    /**
     * Check if category is for breaking changes
     * @param {string} category - Category name
     * @returns {boolean} Is breaking category
     */
    isBreakingCategory(category) {
        return category.includes('BREAKING');
    }
}

// =============================================================================
// 📄 FILE OPERATIONS
// =============================================================================

/**
 * Handles file analysis and filtering
 */
class FileAnalyzer {
    /**
     * Check if file should be ignored
     * @param {string} file - File path
     * @returns {boolean} Should ignore
     */
    shouldIgnore(file) {
        // First check gitignore patterns
        const patterns = CONFIG.ignorePatterns.length > 0
            ? CONFIG.ignorePatterns
            : ConfigAutoDetector.loadGitignorePatterns();

        return patterns.some(pattern => {
            if (pattern.endsWith('/')) {
                return file.startsWith(pattern);
            }

            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(file);
            }

            return file.includes(pattern) || file.endsWith(pattern);
        });
    }

    /**
     * Get scope for a file based on its path
     * Auto-detects from file path structure
     * @param {string} file - File path
     * @returns {string} Scope name
     */
    getScope(file) {
        // First check if there's a manual mapping
        for (const [pattern, scope] of Object.entries(CONFIG.scopeMapping)) {
            const regex = new RegExp(
                pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
            );
            if (regex.test(file)) return scope;
        }

        // Auto-detect scope from file path
        const parts = file.split('/');

        // Special cases for common files
        if (file.includes('.config.') || file.includes('config/')) return 'config';
        if (file.includes('test') || file.includes('spec')) return 'tests';
        if (file.includes('docs/') || file.includes('README')) return 'docs';

        // For paths like src/components/Button.tsx -> components
        if (parts[0] === 'src' && parts.length > 2) {
            return parts[1];
        }

        // For paths like components/Button.tsx -> components
        if (parts.length > 1) {
            return parts[0];
        }

        // Default
        return 'core';
    }

    /**
     * Analyze changes for all files with smart scope detection
     * @param {string} range - Git range
     * @param {string[]} files - File paths
     * @returns {string} Formatted changes
     */
    analyzeChanges(range, files) {
        // First, analyze all files to understand project structure
        const scopeStats = {};
        files.forEach(file => {
            const scope = this.getScope(file);
            scopeStats[scope] = (scopeStats[scope] || 0) + 1;
        });

        // Log detected scopes for visibility
        log('Detected scopes:', '📊');
        Object.entries(scopeStats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([scope, count]) => {
                console.log(`   ${scope}: ${count} files`);
            });

        // Generate changes with scopes
        const changes = files.map(file => {
            const scope = this.getScope(file);
            const diff = GitOperations.getFileDiff(range, file);
            const commits = GitOperations.getFileCommits(range, file);

            return [
                `FILE: ${file}`,
                `SCOPE: ${scope}`,
                `COMMITS:`,
                commits,
                `CHANGES:`,
                diff
            ].join('\n');
        }).join('\n\n---\n\n');

        // Add summary
        const allCommits = GitOperations.getAllCommits(range);
        const prTitle = GitOperations.getLatestCommitMessage();

        return [
            `PR/BRANCH: ${prTitle.split('\n')[0]}`,
            `COMMIT RANGE: ${range}`,
            `ALL COMMITS:`,
            allCommits,
            '',
            '---',
            '',
            changes
        ].join('\n');
    }
}

// =============================================================================
// 📤 OUTPUT HANDLER
// =============================================================================

/**
 * Handles writing changelog to files
 */
class OutputHandler {
    /**
     * Write changelog content to file
     * @param {string} content - Changelog content
     * @param {string} baseBranch - Base branch for comparison
     */
    writeChangelog(content, baseBranch) {
        const outputFile = CONFIG.output.file;

        if (CONFIG.output.appendToExisting && outputFile === 'CHANGELOG.md') {
            this.appendToChangelog(content);
        } else {
            this.writeNewFile(content, baseBranch);
        }

        logSuccess(`Written to: ${outputFile}`);
    }

    /**
     * Append to existing changelog
     * @param {string} content - New content
     */
    appendToChangelog(content) {
        let existing = '';

        if (existsSync(CONFIG.output.file)) {
            existing = readFileSync(CONFIG.output.file, 'utf8');
        } else {
            // Create new changelog with standard header
            existing = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
        }

        // Find where to insert new content
        // Look for just the main header "# Changelog" followed by any newlines
        const headerRegex = /^# Changelog\s*\n+/;
        const headerMatch = existing.match(headerRegex);

        if (headerMatch) {
            // Insert right after "# Changelog" and its newlines
            const insertPosition = headerMatch.index + headerMatch[0].length;

            // If there's a description line after the header, preserve it
            const afterHeader = existing.slice(insertPosition);
            const descriptionMatch = afterHeader.match(/^(?!#).*\n+/);

            if (descriptionMatch) {
                // Insert after the description
                const finalPosition = insertPosition + descriptionMatch[0].length;
                existing = existing.slice(0, finalPosition) + content + '\n' + existing.slice(finalPosition);
            } else {
                // Insert directly after header
                existing = existing.slice(0, insertPosition) + content + '\n' + existing.slice(insertPosition);
            }
        } else {
            // No header found, prepend everything
            existing = '# Changelog\n\n' + content + '\n' + existing;
        }

        // Clean up multiple consecutive blank lines
        existing = existing.replace(/\n{3,}/g, '\n\n');

        writeFileSync(CONFIG.output.file, existing);
    }

    /**
     * Write to a new file
     * @param {string} content - Content
     * @param {string} baseBranch - Base branch
     */
    writeNewFile(content, baseBranch) {
        const date = new Date().toISOString().split('T')[0];
        const repoUrl = this.getRepoUrl();
        const compareUrl = `${repoUrl}/compare/${baseBranch.replace('origin/', '')}...HEAD`;

        const fullContent = [
            '# Changelog Preview\n',
            content,
            '\n---\n',
            `**Full Changelog**: [Compare changes](${compareUrl})\n`,
            `*Generated on ${date}*\n`
        ].join('\n');

        const dir = dirname(CONFIG.output.file);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        writeFileSync(CONFIG.output.file, fullContent);
    }

    /**
     * Get repository URL from git config
     * @returns {string} Repository URL
     */
    getRepoUrl() {
        const remoteUrl = executeCommand('git config --get remote.origin.url');

        // Convert SSH to HTTPS
        if (remoteUrl.startsWith('git@')) {
            return remoteUrl
                .replace('git@', 'https://')
                .replace('.com:', '.com/')
                .replace('.git', '');
        }

        return remoteUrl.replace('.git', '');
    }
}

// =============================================================================
// 🎯 MAIN APPLICATION
// =============================================================================

/**
 * Main application controller
 */
class ChangelogGenerator {
    constructor() {
        this.fileAnalyzer = new FileAnalyzer();
        this.formatter = new ChangelogFormatter();
        this.outputHandler = new OutputHandler();
    }

    /**
     * Show help message
     */
    showHelp() {
        console.log(`
🚀 AI-Powered Changelog Generator

SETUP:
  1. Get API key: https://console.anthropic.com/settings/keys
  2. export ANTHROPIC_API_KEY="your-key"

USAGE:
  node changelog.mjs                    Generate changelog (interactive)
  node changelog.mjs --dry              Preview only
  node changelog.mjs --base origin/dev  Compare against specific branch
  node changelog.mjs --range A..B       Specific git range
  node changelog.mjs --help             Show this help

EXAMPLES:
  node changelog.mjs                    # Interactive branch selection
  node changelog.mjs --base origin/main # Compare to main branch
  node changelog.mjs --dry              # Preview without writing

CONFIGURATION:
  Edit the CONFIG object at the top of this file to customize:
  - Output file: ${CONFIG.output.file}
  - AI Model: ${CONFIG.ai.model}
  - Ignore patterns, scopes, and more

BREAKING CHANGES:
  ${CONFIG.safety.blockBreakingChanges ? 'Enabled' : 'Disabled'} - Set BREAKING_OK=1 to override
`);
    }

    /**
     * Get the git range for comparison
     * @param {Array} args - Command line arguments
     * @returns {Promise<string>} Git range
     */
    async getRange(args) {
        // Check for explicit range
        const rangeIndex = args.indexOf('--range');
        if (rangeIndex !== -1) {
            return args[rangeIndex + 1];
        }

        // Check for base branch flag
        const baseIndex = args.indexOf('--base');
        if (baseIndex !== -1) {
            CONFIG.git.defaultBaseBranch = args[baseIndex + 1];
        }

        // Use configured or find base branch
        let baseBranch = CONFIG.git.defaultBaseBranch;

        if (!baseBranch) {
            // Interactive selection
            const selector = new BranchSelector();
            baseBranch = await selector.select();
        }

        // Fetch latest changes
        const remote = baseBranch.split('/')[0];
        if (remote && remote !== baseBranch) {
            GitOperations.fetchRemote(remote);
        }

        const commitCount = GitOperations.getCommitCount(baseBranch, 'HEAD');
        log(`Comparing current branch against ${baseBranch} (${commitCount} commits)`, '🔀');

        return `${baseBranch}..HEAD`;
    }

    /**
     * Check for breaking changes
     * @param {Array} entries - Changelog entries
     * @returns {boolean} Has breaking changes
     */
    checkBreakingChanges(entries) {
        const breakingChanges = entries.filter(e => e.type === 'breaking');

        if (breakingChanges.length === 0) return false;

        if (CONFIG.safety.blockBreakingChanges && !process.env.BREAKING_OK) {
            console.log('\n💥 BREAKING CHANGES DETECTED:\n');

            breakingChanges.forEach(entry => {
                console.log(`   - ${entry.scope}: ${entry.description}`);
            });

            console.log('\n❌ Push blocked due to breaking changes.\n');
            console.log('📝 To override and continue:');
            console.log('   • For this run: BREAKING_OK=1 node changelog.mjs');
            console.log('   • For git push: BREAKING_OK=1 git push');
            console.log('   • Disable permanently in CONFIG\n');

            return true;
        }

        return false;
    }

    /**
     * Run the changelog generator
     * @param {Array} args - Command line arguments
     */
    async run(args) {
        // Show help if requested
        if (args.includes('--help') || args.includes('-h')) {
            this.showHelp();
            return;
        }

        const isDryRun = args.includes('--dry');

        try {
            // Initialize auto-detection
            ConfigAutoDetector.initialize();

            // Check API key
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                logError('Set ANTHROPIC_API_KEY environment variable');
                console.log('   Get one at: https://console.anthropic.com/settings/keys');
                process.exit(1);
            }

            // Get current branch
            const currentBranch = GitOperations.getCurrentBranch();
            log(`Current branch: ${currentBranch}`, '🌳');

            // Get comparison range
            const range = await this.getRange(args);
            const baseBranch = range.split('..')[0];

            log(`Comparing against: ${baseBranch}`, '🎯');
            log('Analyzing changes...', '🔍');

            // Get changed files
            const allFiles = GitOperations.getChangedFiles(range);
            const relevantFiles = allFiles.filter(file => !this.fileAnalyzer.shouldIgnore(file));

            log(`Files: ${allFiles.length} total, ${relevantFiles.length} relevant`, '📊');

            if (!relevantFiles.length) {
                logSuccess('No relevant changes found');
                return;
            }

            // Check if we're about to create a duplicate version
            const nextVersion = this.formatter.getNextVersion();
            const today = new Date().toISOString().split('T')[0];

            if (existsSync(CONFIG.output.file)) {
                const existingContent = readFileSync(CONFIG.output.file, 'utf8');
                const versionPattern = new RegExp(`^## \\[${nextVersion.replace(/\./g, '\\.')}\\]`, 'm');

                if (versionPattern.test(existingContent)) {
                    logWarning(`Version ${nextVersion} already exists in the changelog`);
                    console.log('   Consider manually updating the existing entry or removing it first');

                    if (!isDryRun) {
                        console.log('   Use --dry flag to preview without writing');
                        process.exit(1);
                    }
                }
            }

            // Analyze changes
            const changes = this.fileAnalyzer.analyzeChanges(range, relevantFiles);

            // Generate changelog with AI
            log('Calling Claude AI...', '🤖');
            const aiGenerator = new AIChangelogGenerator(apiKey);
            const result = await aiGenerator.generateChangelog(changes);

            if (!result.entries?.length) {
                logInfo('No user-facing changes detected');
                return;
            }

            log(`Generated ${result.entries.length} entries`, '📝');

            // Check for breaking changes
            if (this.checkBreakingChanges(result.entries)) {
                process.exit(1);
            }

            // Format changelog
            const markdown = this.formatter.formatMarkdown(result.entries, baseBranch);

            // Preview
            console.log('\n📋 PREVIEW:');
            console.log('═'.repeat(60));
            console.log(markdown);
            console.log('═'.repeat(60));

            // Write output
            if (isDryRun) {
                log('\nDRY RUN - no files written', '🏃');
            } else {
                this.outputHandler.writeChangelog(markdown, baseBranch);
            }

        } catch (error) {
            logError(`Error: ${error.message}`);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }
}

// =============================================================================
// 🚀 ENTRY POINT
// =============================================================================

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const generator = new ChangelogGenerator();
    generator.run(process.argv.slice(2));
}
