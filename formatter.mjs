import { readFileSync, writeFileSync, existsSync } from 'fs';

const TYPE_TO_CATEGORY = {
    'feat': '✨ New Features',
    'fix': '🐛 Bug Fixes',
    'improve': '🛠️ Improvements',
    'refactor': '♻️ Refactoring',
    'docs': '📚 Documentation',
    'test': '🧪 Testing',
    'breaking': '⚠️ BREAKING CHANGES'
};

export function formatChangelog(entries, config) {
    const date = new Date().toISOString().split('T')[0];
    const version = getNextVersion(config);

    // Group by category
    const grouped = entries.reduce((acc, entry) => {
        const category = entry.category || TYPE_TO_CATEGORY[entry.type] || '📝 Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(entry);
        return acc;
    }, {});

    // Build markdown
    let output = `## [${version}] - ${date}\n\n`;

    // Breaking changes first
    const breaking = entries.filter(e => e.type === 'breaking');
    if (breaking.length) {
        output += `### ⚠️ BREAKING CHANGES\n\n`;
        breaking.forEach(entry => {
            output += `- **${entry.scope}**: ${entry.description}\n`;
            if (entry.details?.length) {
                entry.details.forEach(detail => output += `  - ${detail}\n`);
            }
        });
        output += '\n';
    }

    // Other categories
    Object.entries(grouped).forEach(([category, items]) => {
        if (category.includes('BREAKING')) return;

        output += `### ${category}\n\n`;
        items.forEach(entry => {
            output += `- **${entry.scope}**: ${entry.description}`;
            if (entry.ticketId) output += ` \`${entry.ticketId}\``;
            output += '\n';
        });
        output += '\n';
    });

    return output;
}

function getNextVersion(config) {
    if (!config.output.shouldIncreaseVersion) return '0.0.0';

    if (existsSync(config.output.file)) {
        const content = readFileSync(config.output.file, 'utf8');
        const match = content.match(/## \[(\d+\.\d+\.\d+)\]/);
        if (match) {
            const [major, minor, patch] = match[1].split('.').map(Number);
            return `${major}.${minor}.${patch + 1}`;
        }
    }
    return '0.0.1';
}

export function writeChangelog(content, config) {
    if (config.output.appendToExisting && existsSync(config.output.file)) {
        let existing = readFileSync(config.output.file, 'utf8');

        // Insert after header
        const headerMatch = existing.match(/^# Changelog\s*\n+(?:[^\n]+\n+)?/);
        if (headerMatch) {
            const pos = headerMatch.index + headerMatch[0].length;
            existing = existing.slice(0, pos) + content + '\n' + existing.slice(pos);
        } else {
            existing = '# Changelog\n\n' + content + '\n' + existing;
        }

        writeFileSync(config.output.file, existing);
    } else {
        writeFileSync(config.output.file, `# Changelog\n\n${content}`);
    }
}