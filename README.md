# AI-Powered Changelog Generator - Technical Specification

## Executive Summary

The AI-Powered Changelog Generator is a Node.js tool that leverages Claude AI to automatically generate professional, user-focused changelog entries from git commits. It features interactive branch selection, intelligent commit analysis, and customizable output formatting.

## Core Features

### 1. Interactive Branch Selection
- **Fuzzy Search Interface**: Real-time filtering of branches as user types
- **Branch Prioritization**: 
  - Default branches (`master`, `main`) appear first
  - Recently used branches from git reflog
  - All local and remote branches
- **Keyboard Navigation**:
  - Arrow keys for selection
  - Enter to confirm
  - Escape to clear search
  - `q` or Ctrl+C to quit
- **Visual Indicators**:
  - Selected branch highlighted
  - Labels for default/recent branches
  - Scroll indicators for long lists

### 2. Auto-Configuration Detection
- **Git Platform Detection**: Automatically identifies GitHub, GitLab, Bitbucket, or Azure DevOps
- **Ignore Patterns**: Loads from `.gitignore` or uses sensible defaults
- **Ticket System Detection**: Analyzes commit history for JIRA, GitHub issues patterns
- **Main Branch Detection**: Identifies default branch automatically

### 3. Git Operations
- **Commit Analysis**: 
  - Counts commits between branches
  - Retrieves file diffs with context limiting
  - Extracts commit messages
- **File Change Detection**:
  - Lists all changed files between branches
  - Filters based on ignore patterns
  - Automatic scope detection from file paths
- **Remote Synchronization**: Fetches latest changes before comparison

### 4. AI Integration (Claude API)
- **Model**: Claude 3.5 Sonnet (configurable)
- **Intelligent Prompt Engineering**:
  - Structured JSON output format
  - User-focused descriptions
  - Automatic categorization
  - PR and ticket ID extraction
- **Error Handling**: Graceful fallback for API failures

### 5. Changelog Generation
- **Entry Types**:
  - `feat`: New features
  - `fix`: Bug fixes
  - `breaking`: Breaking changes
  - `improve`: Improvements
  - `refactor`: Code refactoring
  - `docs`: Documentation
  - `test`: Testing
- **Categories with Emojis**:
  - ✨ New Features
  - 🚀 Features
  - 🎯 Enhancements
  - 🛠️ Improvements
  - 🐛 Bug Fixes
  - ⚡ Performance
  - ♻️ Refactoring
  - 📚 Documentation
  - 🧪 Testing
  - 🔧 Configuration

### 6. Output Formatting
- **Semantic Versioning**: Automatic version increment
- **Markdown Structure**:
  - Version header with date
  - Breaking changes section (prioritized)
  - Categorized entries
  - Scope-based grouping for large changelogs
  - Clickable PR/ticket links
- **Metadata Support**:
  - PR numbers with platform-specific URLs
  - Ticket IDs with configurable URL patterns

### 7. Safety Features
- **Breaking Change Detection**: 
  - Blocks push on breaking changes (configurable)
  - Override with `BREAKING_OK=1` environment variable
- **Duplicate Version Prevention**: Warns about existing versions
- **Dry Run Mode**: Preview without writing files

## Configuration Options

### Output Configuration
- `file`: Output filename (default: `CHANGELOG.md`)
- `appendToExisting`: Whether to append to existing changelog
- `shouldIncreaseVersion`: Auto-increment version numbers

### Safety Configuration
- `blockBreakingChanges`: Block on breaking changes
- `requireApprovalForBreaking`: Require explicit approval

### AI Configuration
- `model`: Claude model to use
- `temperature`: AI creativity (0.2 for consistency)
- `maxTokens`: Maximum response length

### Git Configuration
- `defaultBaseBranch`: Base branch for comparison
- `platform`: Git platform (auto-detected)
- `prUrlPattern`: PR URL template
- `ticketUrlPattern`: Ticket URL template

### UI Configuration
- `maxBranchesDisplay`: Branches shown at once
- `colors`: Terminal color codes

## File Analysis

### Scope Detection
- **Automatic Path-Based Detection**:
  - `src/components/Button.tsx` → `components`
  - `docs/README.md` → `docs`
  - `tests/unit/auth.test.js` → `tests`
- **Special Cases**:
  - Config files → `config`
  - Test files → `tests`
  - Documentation → `docs`
- **Manual Mapping**: Optional scope overrides

### Ignore Patterns
- **Sources**:
  1. `.gitignore` file (primary)
  2. Default patterns (fallback)
- **Default Patterns**:
  - `node_modules/`, `dist/`, `build/`
  - `*.log`, `*.map`, `*.min.js`
  - `.env*`, `*.pem`, `*.key`

## Command Line Interface

### Basic Usage
```bash
node changelog.mjs                    # Interactive mode
node changelog.mjs --dry              # Preview only
node changelog.mjs --base origin/dev  # Specific base branch
node changelog.mjs --range A..B       # Specific git range
node changelog.mjs --help             # Show help
```

### Environment Variables
- `ANTHROPIC_API_KEY`: Required for AI generation
- `BREAKING_OK`: Override breaking change blocks
- `DEBUG`: Enable stack traces

## Workflow

### 1. Initialization
1. Auto-detect configuration
2. Validate API key
3. Identify current branch

### 2. Branch Selection
1. Build prioritized branch list
2. Show interactive selector
3. User selects base branch

### 3. Change Analysis
1. Fetch remote updates
2. Get changed files
3. Filter by ignore patterns
4. Detect scopes
5. Generate diffs and commits

### 4. AI Processing
1. Build structured prompt
2. Call Claude API
3. Parse JSON response
4. Validate entries

### 5. Output Generation
1. Group by categories
2. Format markdown
3. Add metadata (PR/ticket links)
4. Preview to console
5. Write to file (unless dry run)

## Error Handling

### Graceful Failures
- Missing API key: Clear instructions
- Git errors: Silent fallback
- API failures: Error message with details
- Invalid JSON: Parse error with response

### User Guidance
- Color-coded messages (errors, warnings, success)
- Help command with examples
- Configuration tips in output

## Platform Support

### Git Platforms
- **GitHub**: Full support with PR links
- **GitLab**: Merge request links
- **Bitbucket**: Pull request links
- **Azure DevOps**: Pull request links
- **Self-hosted**: Pattern detection

### Operating Systems
- Linux/macOS: Full support
- Windows: Requires Git Bash or WSL

## Performance Optimizations

### Caching
- Recent branches cached during session
- Git command results reused

### Diff Limiting
- Maximum 3 hunks per file
- Only relevant lines included
- Large files truncated

### Batch Operations
- Single git fetch operation
- Parallel file analysis
- Efficient regex matching

## Security Considerations

### API Key Protection
- Environment variable only
- Never logged or stored
- Clear error on missing key

### File System Safety
- Directory creation with recursion
- Existing file backup
- UTF-8 encoding throughout

### Git Safety
- Read-only operations
- No automatic commits
- Explicit branch selection

## Extensibility

### Custom Scopes
- Path-based mapping
- Regex pattern support
- Priority ordering

### Category Management
- Add/remove categories
- Custom emoji mappings
- Order customization

### Output Formats
- Markdown (default)
- Custom file paths
- Template modification

## Best Practices

### Commit Messages
- Include PR numbers (#123)
- Add ticket IDs (JIRA-456)
- Clear, descriptive text

### Breaking Changes
- Detailed descriptions
- Migration instructions
- Clear warnings

### Regular Usage
- Run before releases
- Review AI output
- Manual adjustments as needed
