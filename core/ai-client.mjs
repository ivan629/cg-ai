const CATEGORIES = [
  '✨ New Features',
  '🐛 Bug Fixes',
  '🛠️ Improvements',
  '♻️ Refactoring',
  '📚 Documentation',
  '🧪 Testing',
];

const PROMPT_TEMPLATE = `Analyze these code changes and generate changelog entries in the style of a professional changelog.

Return ONLY valid JSON with this structure:
      {
            "summary": "string" (Comprehensive summary that summarize ALL changes in a single flowing paragraph)
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
`;

export async function generateChangelogAnthropic(changes, config) {
  const response = await fetch(config.ai[config.ai.provider].apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.ai[config.ai.provider].model,
      max_tokens: config.ai[config.ai.provider].maxTokens,
      temperature: config.ai[config.ai.provider].temperature,
      messages: [
        {
          role: 'user',
          content: PROMPT_TEMPLATE + changes,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  return JSON.parse(jsonMatch[0]);
}

export async function generateChangelogGemini(changes, config) {
  const response = await fetch(
    `${config.ai[config.ai.provider].apiUrl}/${config.ai[config.ai.provider].model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: PROMPT_TEMPLATE + changes,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: config.ai[config.ai.provider].maxTokens,
          temperature: config.ai[config.ai.provider].temperature,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  return JSON.parse(jsonMatch[0]);
}
