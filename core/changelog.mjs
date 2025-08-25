import { loadConfig } from './config.mjs';
import { git, selectBranch } from './git-ops.mjs';
import { generateChangelog } from './ai-client.mjs';
import { formatChangelog, writeChangelog } from './changelog-formatter.mjs';
import {
  formatChangesetContent,
  writeChangeset,
} from './changeset-formatter.mjs';
import { existsSync, readFileSync } from 'fs';

// Load env file
if (existsSync('.env')) {
  readFileSync('.env', 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...vals] = trimmed.split('=');
        if (key && vals.length) {
          process.env[key.trim()] = vals.join('=').trim();
        }
      }
    });
}

export async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry');
  const useChangeset = args.includes('--changeset');

  // Show help
  if (args.includes('--help')) {
    console.log(`
🚀 AI Changelog Generator

USAGE:
  node changelog.mjs [options]

OPTIONS:
  --dry              Preview without writing
  --base <branch>    Compare against branch
  --changeset        Write to newest changeset file
  --help             Show this help

CONFIG:
  Create changelog.config.js to customize
`);
    return;
  }

  try {
    // Load config
    const config = await loadConfig();

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ Set ANTHROPIC_API_KEY environment variable');
      process.exit(1);
    }

    // Get base branch
    let baseBranch = args.includes('--base')
      ? args[args.indexOf('--base') + 1]
      : await selectBranch();

    const range = `${baseBranch}..HEAD`;
    console.log(`\n🔍 Analyzing ${range}...`);

    // Get changes
    const files = git.getChangedFiles(range);
    if (!files.length) {
      console.log('✅ No changes found');
      return;
    }

    // Build changes text
    const changes = files
      .map(file => {
        const scope = file.split('/')[0]; // Simple scope detection
        return [
          `FILE: ${file}`,
          `SCOPE: ${scope}`,
          `COMMITS:`,
          git.getFileCommits(range, file),
          `CHANGES:`,
          git.getFileDiff(range, file),
        ].join('\n');
      })
      .join('\n\n---\n\n');

    // Generate with AI
    console.log('🤖 Generating changelog...');
    const result = await generateChangelog(changes, config);

    if (!result.entries?.length) {
      console.log('ℹ️  No user-facing changes detected');
      return;
    }

    // Format output based on mode
    let changelog;

    if (useChangeset) {
      changelog = formatChangesetContent(result);
    } else {
      changelog = formatChangelog(result.entries, config);
    }

    if (!isDryRun) {
      if (useChangeset) {
        writeChangeset(changelog);
          console.log('\n✅ Good job, now you can go to check the changeset and push your MR');
      } else {
        writeChangelog(changelog, config);
          console.log('\n🏃 DRY RUN - no files written');
      }
    } else {
      console.log('\n🏃 DRY RUN - no files written');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  }
}
