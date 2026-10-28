import { BaseAIProvider } from './base.service';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { NvidiaProvider } from './nvidia.provider';
import { GroqProvider } from './groq.provider';

export type AIProviderType = 'gemini' | 'openai' | 'nvidia' | 'groq';

/**
 * Factory to create AI provider instances based on environment configuration
 */
export class AIProviderFactory {
    /**
     * Create an AI provider instance based on the provider type
     * @param providerType - The type of AI provider to create
     * @param apiKeys - API key(s) for the provider (string or array of strings for fallback)
     * @param modelName - Optional model name override
     * @param env - Environment variables (needed for Groq provider Azure credentials)
     */
    static createProvider(
        providerType: AIProviderType,
        apiKeys: string | string[],
        modelName?: string,
        env?: any
    ): BaseAIProvider {
        switch (providerType) {
            case 'gemini':
                return new GeminiProvider(apiKeys, modelName || 'gemini-2.5-flash');

            case 'openai':
                return new OpenAIProvider(apiKeys, modelName || 'gpt-4o');

            case 'nvidia':
                return new NvidiaProvider(apiKeys, modelName || 'meta/llama-3.2-90b-vision-instruct');

            case 'groq':
                if (!env?.AZURE_VISION_ENDPOINT || !env?.AZURE_VISION_KEY) {
                    throw new Error('Azure Vision credentials not configured for Groq provider');
                }
                return new GroqProvider(
                    apiKeys,
                    env.AZURE_VISION_ENDPOINT,
                    env.AZURE_VISION_KEY,
                    modelName || 'openai/gpt-oss-20b'
                );

            default:
                throw new Error(`Unknown AI provider: ${providerType}`);
        }
    }

    /**
     * Get the appropriate API key from environment based on provider type
     */
    static getApiKey(env: any, providerType: AIProviderType): string {
        switch (providerType) {
            case 'gemini':
                if (!env.GEMINI_API_KEY) {
                    throw new Error('GEMINI_API_KEY not configured');
                }
                return env.GEMINI_API_KEY;

            case 'openai':
                if (!env.GITHUB_TOKEN) {
                    throw new Error('GITHUB_TOKEN not configured');
                }
                return env.GITHUB_TOKEN;

            case 'nvidia':
                if (!env.NVIDIA_API_KEY) {
                    throw new Error('NVIDIA_API_KEY not configured');
                }
                return env.NVIDIA_API_KEY;

            case 'groq':
                if (!env.GROQ_API_KEY) {
                    throw new Error('GROQ_API_KEY not configured');
                }
                return env.GROQ_API_KEY;

            default:
                throw new Error(`Unknown AI provider: ${providerType}`);
        }
    }

    /**
     * Get all API keys (primary + fallback) from environment based on provider type
     * Returns an array with at least the primary key, and optionally the fallback key
     */
    static getApiKeys(env: any, providerType: AIProviderType): string[] {
        const keys: string[] = [];

        switch (providerType) {
            case 'gemini':
                if (!env.GEMINI_API_KEY) {
                    throw new Error('GEMINI_API_KEY not configured');
                }
                keys.push(env.GEMINI_API_KEY);
                if (env.GEMINI_API_KEY_2) {
                    keys.push(env.GEMINI_API_KEY_2);
                }
                break;

            case 'openai':
                if (!env.GITHUB_TOKEN) {
                    throw new Error('GITHUB_TOKEN not configured');
                }
                keys.push(env.GITHUB_TOKEN);
                if (env.GITHUB_TOKEN_2) {
                    keys.push(env.GITHUB_TOKEN_2);
                }
                break;

            case 'nvidia':
                if (!env.NVIDIA_API_KEY) {
                    throw new Error('NVIDIA_API_KEY not configured');
                }
                keys.push(env.NVIDIA_API_KEY);
                if (env.NVIDIA_API_KEY_2) {
                    keys.push(env.NVIDIA_API_KEY_2);
                }
                break;

            case 'groq':
                if (!env.GROQ_API_KEY) {
                    throw new Error('GROQ_API_KEY not configured');
                }
                keys.push(env.GROQ_API_KEY);
                if (env.GROQ_API_KEY_2) {
                    keys.push(env.GROQ_API_KEY_2);
                }
                break;

            default:
                throw new Error(`Unknown AI provider: ${providerType}`);
        }

        return keys;
    }

    /**
     * Get the default model name for a provider
     */
    static getDefaultModel(providerType: AIProviderType): string {
        switch (providerType) {
            case 'gemini':
                return 'gemini-2.5-flash';
            case 'openai':
                return 'gpt-4o';
            case 'nvidia':
                return 'meta/llama-3.2-90b-vision-instruct';
            case 'groq':
                return 'openai/gpt-oss-20b';
            default:
                return '';
        }
    }
}
