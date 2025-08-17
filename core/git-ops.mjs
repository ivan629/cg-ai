import { execSync } from 'child_process';
import { BranchSelector } from './branch-selector.mjs';

export function exec(command, silent = true) {
    try {
        return execSync(command, {
            encoding: 'utf8',
            stdio: silent ? 'pipe' : 'inherit'
        }).trim();
    } catch (error) {
        if (silent) return '';
        throw error;
    }
}

export const git = {
    getCurrentBranch: () => exec('git rev-parse --abbrev-ref HEAD'),

    getLocalBranches: () => {
        const currentBranch = exec('git rev-parse --abbrev-ref HEAD');
        return exec('git branch')
            .split('\n')
            .map(branch => branch.trim().replace('* ', ''))
            .filter(branch => branch && branch !== currentBranch);
    },

    getRemoteBranches: () => {
        return exec('git branch -r')
            .split('\n')
            .map(branch => branch.trim())
            .filter(branch => branch && !branch.includes('->') && !branch.includes('HEAD'))
            .map(branch => branch.replace('origin/', ''));
    },

    getRecentBranches: () => {
        if (!git._recentBranchesCache) {
            const command = `git reflog show --pretty=format:"%gs" --grep-reflog="checkout" | ` +
                `grep -oE "[^ ]+$" | grep -v "^HEAD$" | awk "!seen[$0]++" | head -10`;
            const currentBranch = git.getCurrentBranch();
            git._recentBranchesCache = exec(command)
                .split('\n')
                .filter(branch => branch && branch !== currentBranch);
        }
        return git._recentBranchesCache;
    },

    getChangedFiles: (range) => exec(`git diff --name-only ${range}`).split('\n').filter(Boolean),

    getFileDiff: (range, file) => exec(`git diff ${range} -- "${file}"`),

    getFileCommits: (range, file) => exec(`git log --oneline ${range} -- "${file}"`),
};

export async function selectBranch() {
    const selector = new BranchSelector();
    return await selector.select();
}