import { buildPrompt } from './prompts.mjs';

export async function generateChangelogAnthropic(changes, config) {
    const { system, user } = buildPrompt('anthropic', changes);

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
            system, // <— use system channel
            messages: [{ role: 'user', content: user }],
        }),
    });

    if (!response.ok) throw new Error(`AI API error: ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
}

export async function generateChangelogGemini(changes, config) {
    const { system, user } = buildPrompt('gemini', changes);

    const response = await fetch(
        `${config.ai[config.ai.provider].apiUrl}/${config.ai[config.ai.provider].model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { role: 'system', parts: [{ text: system }] },
                contents: [{ role: 'user', parts: [{ text: user }] }],
                generationConfig: {
                    maxOutputTokens: config.ai[config.ai.provider].maxTokens,
                    temperature: config.ai[config.ai.provider].temperature,
                },
            }),
        }
    );

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
}
