import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const USER_CONFIG_FILENAME = 'ch-ai.json'

const DEFAULT_CONFIG = {
    ai: {
        provider: 'anthropic', // 'anthropic' | 'openai' | 'gemini' | 'cohere'
        anthropic: {
            model: 'claude-3-5-sonnet-20241022',
            apiUrl: 'https://api.anthropic.com/v1/messages',
            temperature: 0.2,
            maxTokens: 4096
        },
    },
    output: {
        file: 'CHANGELOG.md',
        appendToExisting: true,
        shouldIncreaseVersion: true
    },
};

// Load and merge user config
export async function loadConfig() {
    let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep clone

    // Try multiple config file locations
    const configPaths = [
        resolve(process.cwd(), USER_CONFIG_FILENAME),
    ];

    for (const configPath of configPaths) {
        if (existsSync(configPath)) {
            try {
                const userConfig = JSON.parse(readFileSync(configPath, 'utf8'));
                config = deepMerge(config, userConfig);
                console.log(`📋 Loaded config from ${configPath.split('/').pop()}`);
                break;
            } catch (error) {
                console.warn(`⚠️  Failed to load ${configPath}:`, error.message);
            }
        }
    }

    // Set active AI config based on provider
    const provider = config.ai.provider || 'anthropic';
    config.ai.active = {
        provider,
        ...config.ai[provider]
    };

    return config;
}

// Simple deep merge
function deepMerge(target, source) {
    const output = { ...target };
    Object.keys(source).forEach(key => {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            output[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            output[key] = source[key];
        }
    });
    return output;
}