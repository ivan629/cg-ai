const CATEGORIES = [
    '✨ New Features',
    '🐛 Bug Fixes',
    '🛠️ Improvements',
    '♻️ Refactoring',
    '📚 Documentation',
    '🧪 Testing',
];

const BASE_TASK = `
Analyze these code changes and generate changelog entries in the style of a professional changelog.

Return ONLY valid JSON with this structure:
{
  "summary": "string",
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
`;

const PROVIDER_PROMPTS = {
    anthropic: {
        system: `
You are a precise changelog generator. Output must be STRICT JSON only.
Do NOT wrap in backticks. Do NOT add prose before/after JSON.
If something is missing, return the closest valid JSON with empty values.
The JSON must parse with standard JSON.parse.
`,
        userPrefix: `${BASE_TASK}\n\nChanges to analyze:\n`,
    },

    gemini: {
        system: `
You are a tool that returns ONLY strict JSON. No Markdown fences, no preambles, no explanations.
Output must be a single JSON object matching the required schema. Ensure valid UTF-8 and quotes.
If you cannot find values, use empty strings or empty arrays to stay valid.
`,
        userPrefix: `${BASE_TASK}\n\nIMPORTANT: Respond with JSON ONLY. Do not include \`\`\` or any extra text.\n\nChanges to analyze:\n`,
    },
};

export function buildPrompt(provider, changes) {
    const prompt = PROVIDER_PROMPTS[provider] ?? PROVIDER_PROMPTS.anthropic;
    return {
        system: prompt.system.trim(),
        user: (prompt.userPrefix + changes).trim(),
    };
}
