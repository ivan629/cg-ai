import readline from 'readline';
import { git } from './git-ops.mjs';
import { loadConfig } from './config.mjs';

export class BranchSelector {
    constructor() {
        this.selectedIndex = 0;
        this.searchQuery = '';
        this.scrollOffset = 0;
        this.allBranches = [];
        this.filteredBranches = [];
        this.config = loadConfig();
    }

    /**
     * Build an ordered list of branches with priority
     * @returns {string[]} Ordered array of branch names
     */
    buildBranchList() {
        const localBranches = git.getLocalBranches();
        const remoteBranches = git.getRemoteBranches();
        const recentBranches = git.getRecentBranches();

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
        const end = Math.min(start + (this.config.ui?.maxBranchesDisplay || 10), this.filteredBranches.length);

        for (let i = start; i < end; i++) {
            outputLines.push(this.getBranchLine(i));
        }

        // Show scroll indicator
        if (this.filteredBranches.length > (this.config.ui?.maxBranchesDisplay || 10)) {
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
        const colors = this.config.ui?.colors || {
            selected: '\x1b[36m',
            warning: '\x1b[33m',
            success: '\x1b[32m',
            reset: '\x1b[0m'
        };

        // Selection indicator
        const prefix = isSelected ? '▶ ' : '  ';

        // Color for selected item
        const highlight = isSelected ? colors.selected : '';
        const reset = colors.reset;

        // Add labels for special branches
        let label = '';
        const recentBranches = git.getRecentBranches();
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
            if (this.selectedIndex >= this.scrollOffset + (this.config.ui?.maxBranchesDisplay || 10)) {
                this.scrollOffset = this.selectedIndex - (this.config.ui?.maxBranchesDisplay || 10) + 1;
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
        const localBranches = git.getLocalBranches();
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
                    console.log(`✅ Selected: ${result}`);
                    resolve(result);
                }
            };

            process.stdin.on('keypress', handleKeypress);
            process.stdin.resume();
        });
    }
}