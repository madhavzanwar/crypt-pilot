import { Context } from 'hono';
import { Env } from '../types';
import { DBService } from '../services/db.service';
import { success, error, json } from '../utils/response';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

/**
 * GET /api/settings/currency
 * Get user's default currency
 */
export async function getCurrency(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    const apiKey = await dbService.getApiKey(userId);

    return json(
        success({
            defaultCurrency: apiKey?.default_currency || 'EGP',
        })
    );
}

/**
 * PUT /api/settings/currency
 * Update user's default currency
 */
export async function updateCurrency(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    try {
        const body = await c.req.json();
        const { defaultCurrency } = body;

        if (!defaultCurrency || typeof defaultCurrency !== 'string') {
            return error('Invalid currency', 400);
        }

        // Update only the currency field (won't affect ai_provider)
        await dbService.updateCurrency(userId, defaultCurrency);

        return json(success({ message: 'Currency updated successfully', defaultCurrency }));
    } catch (err) {
        return error('Invalid request body', 400);
    }
}

/**
 * GET /api/settings/ai-provider
 * Get user's preferred AI provider
 */
export async function getAIProvider(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    const settings = await dbService.getApiKey(userId);

    return json(
        success({
            aiProvider: settings?.ai_provider || 'gemini',
        })
    );
}

/**
 * PUT /api/settings/ai-provider
 * Update user's preferred AI provider
 */
export async function updateAIProvider(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    try {
        const body = await c.req.json();
        const { aiProvider } = body;

        // Validate provider
        if (!aiProvider || !['gemini', 'openai', 'nvidia', 'groq'].includes(aiProvider)) {
            return error('Invalid AI provider. Must be one of: gemini, openai, nvidia, groq', 400);
        }

        // Update provider
        await dbService.updateAIProvider(userId, aiProvider);

        return json(success({ message: 'AI provider updated successfully', aiProvider }));
    } catch (err) {
        console.error('[API Handler] updateAIProvider error:', err);
        return error('Invalid request body', 400);
    }
}
