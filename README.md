# cg-ai

Generate a user-facing changelog from the commits between two git branches, written by Claude or Gemini. Pick the base branch from an interactive fuzzy list, preview the result, then append it to `CHANGELOG.md` or write it into a changeset file.

## Requirements

- Node.js 18 or newer
- `ANTHROPIC_API_KEY` (default provider) or `GEMINI_API_KEY` in the environment or in a local `.env` file

## Usage

Run it from the root of the repository you want a changelog for:

```bash
node /path/to/cg-ai/index.js            # interactive: choose the base branch, write CHANGELOG.md
node /path/to/cg-ai/index.js --dry      # print the changelog without writing anything
node /path/to/cg-ai/index.js --base main
node /path/to/cg-ai/index.js --changeset        # write to the newest .changeset file instead
node /path/to/cg-ai/index.js --provider gemini  # override the provider for this run
```

The branch picker lists default branches first, then recently used branches from the reflog, then everything else. Type to filter, arrow keys to move, Enter to confirm.

## Configuration

Optional `ch-ai.json` in the target repository, merged over the defaults:

```json
{
  "ai": {
    "provider": "anthropic",
    "anthropic": { "model": "claude-3-5-sonnet-20241022", "temperature": 0.2, "maxTokens": 4096 }
  },
  "output": {
    "file": "CHANGELOG.md",
    "appendToExisting": true,
    "shouldIncreaseVersion": true
  }
}
```

Git platform (GitHub, GitLab, Bitbucket, Azure DevOps), ignore patterns and ticket references (Jira keys, GitHub issue numbers) are detected automatically from the repository.

## How it works

1. Fetches the remote and lists the commits and changed files between the current branch and the chosen base.
2. Filters out ignored paths and derives scopes from the file layout.
3. Sends the commit messages and a bounded diff to the model with a prompt that asks for user-facing wording.
4. Formats the reply as a versioned changelog section and writes it.

Set `DEBUG=1` to print the raw model exchange.

## Layout

- `index.js` – entry point
- `core/changelog.mjs` – argument parsing and the main flow
- `core/branch-selector.mjs` – interactive branch picker
- `core/git-ops.mjs` – git commands
- `core/ai-client.mjs`, `core/prompts.mjs` – model calls and prompts
- `core/changelog-formatter.mjs`, `core/changeset-formater.mjs` – output writers
- `core/config.mjs` – defaults and `ch-ai.json` loading

## Licence

MIT
