import {
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { join } from 'path';
const CHANGE_SET_LINES_TO_PERSIST = 3;

export function findNewestChangesetFile() {
  const changesetDir = '.changeset';
  if (!existsSync(changesetDir)) {
    throw new Error('No .changeset directory found');
  }

  const files = readdirSync(changesetDir)
    .filter(file => file.endsWith('.md') && file !== 'README.md')
    .map(file => ({
      name: file,
      path: join(changesetDir, file),
      mtime: statSync(join(changesetDir, file)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    throw new Error('No changeset files found in .changeset directory');
  }

  return files[0].path;
}

export function formatChangesetContent(content) {
  // Group entries by package/scope
  const grouped = content.entries.reduce((acc, entry) => {
    const pkg = entry.scope || 'root';
    if (!acc[pkg]) acc[pkg] = [];
    acc[pkg].push(entry);
    return acc;
  }, {});

  let output = '---\n';

  // Add package entries with bump type
  output += content.summary;
  output += '\n';

  // Add descriptions
  Object.entries(grouped).forEach(([pkg, items]) => {
    if (items.length > 0) {
      output += `### ${pkg}\n\n`;
      items.forEach(entry => {
        output += `- **${entry.type}**: ${entry.description}`;
        if (entry.ticketId) output += ` (${entry.ticketId})`;
        output += '\n';
        if (entry.details?.length) {
          entry.details.forEach(detail => (output += `  - ${detail}\n`));
        }
      });
      output += '\n';
    }
  });

  return output;
}

function readChangesetFrontmatter(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Just take the first 4 lines
  return lines.slice(0, CHANGE_SET_LINES_TO_PERSIST).join('\n') + '\n\n';
}

export function writeChangeset(content) {
  const targetFile = findNewestChangesetFile();

  const existingFrontmatter = readChangesetFrontmatter(targetFile);

  const fullContent = existingFrontmatter + content;

  writeFileSync(targetFile, fullContent);

  return targetFile;
}
