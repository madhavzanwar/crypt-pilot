import { Context } from 'hono';
import { Env } from '../types';
import { DBService } from '../services/db.service';
import { RateLimitService } from '../services/rateLimit.service';
import { AIProviderFactory, AIProviderType } from '../services/ai/factory';
import { AudioService } from '../services/audio.service';
import { validateRequest, processReceiptSchema, validateImageDimensions } from '../utils/validation';
import { success, error, json } from '../utils/response';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

// AI usage rate limit: 10 requests per day per user
const AI_RATE_LIMIT = {
    limit: 10,
    window: 24 * 60 * 60, // 24 hours in seconds
};

/**
 * POST /api/receipts/process
 * Process a receipt image using the configured AI provider
 */
export async function processReceipt(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    // Validate request body
    const validation = await validateRequest(c.req.raw, processReceiptSchema);
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { image } = validation.data;

    // Validate image dimensions (max 2000px in any dimension)
    const dimensionValidation = validateImageDimensions(image);
    if (!dimensionValidation.valid) {
        return error(dimensionValidation.error, 400);
    }

    // Check AI usage rate limit
    const rateLimitService = new RateLimitService(dbService, 'ai_receipt_processing', AI_RATE_LIMIT);
    const isAllowed = await rateLimitService.isAllowed(userId);

    if (!isAllowed) {
        // Get current usage for better error message
        const now = Date.now();
        const windowStart = now - AI_RATE_LIMIT.window * 1000;
        const recentRequests = await dbService.getRateLimitRequests('ai_receipt_processing', userId, windowStart);

        // Calculate reset time
        const oldestRequest = Math.min(...recentRequests.map(r => r.created_at));
        const resetAt = (oldestRequest + AI_RATE_LIMIT.window) * 1000;
        const hoursUntilReset = Math.ceil((resetAt - now) / (1000 * 60 * 60));

        return error(
            `Daily AI scan limit reached (10/10 used). Your quota will reset in approximately ${hoursUntilReset} hour${hoursUntilReset !== 1 ? 's' : ''}. Try again later!`,
            429
        );
    }

    // Get user's AI provider preference (fallback to env, then gemini)
    const userSettings = await dbService.getApiKey(userId);
    const providerType = (userSettings?.ai_provider || env.AI_PROVIDER || 'gemini') as AIProviderType;
    const modelName = env.AI_MODEL;

    console.log('[Receipt Handler] Selected provider:', providerType);
    console.log('[Receipt Handler] User setting:', userSettings?.ai_provider);
    console.log('[Receipt Handler] Env default:', env.AI_PROVIDER);

    try {
        // Get the appropriate API key(s) for the provider (includes fallback if configured)
        const apiKeys = AIProviderFactory.getApiKeys(env, providerType);

        console.log('[Receipt Handler] Creating provider instance...');
        console.log('[Receipt Handler] API keys available:', apiKeys.length);

        // Create AI provider instance (pass env for Groq provider Azure credentials)
        const aiProvider = AIProviderFactory.createProvider(providerType, apiKeys, modelName, env);

        console.log('[Receipt Handler] Processing receipt with', providerType);

        // Process the receipt
        const result = await aiProvider.processReceipt(image);

        if (!result.success) {
            return error(result.error || 'Failed to process receipt', 500);
        }

        // Record the AI usage (only after successful processing)
        await rateLimitService.recordRequest(userId);

        // Get user's default currency (check api_keys table for backward compatibility)
        const apiKeyRecord = await dbService.getApiKey(userId);
        const defaultCurrency = apiKeyRecord?.default_currency || 'EGP';

        // Add user's default currency to the response
        const expenseData = {
            ...result.data,
            currency: defaultCurrency,
        };

        return json(success(expenseData));
    } catch (err: any) {
        console.error('Receipt processing error:', err);
        return error(err.message || 'Failed to process receipt', 500);
    }
}

/**
 * POST /api/receipts/process-audio
 * Process an audio file using Gemini
 */
export async function processAudioReceipt(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    // Check AI usage rate limit
    const rateLimitService = new RateLimitService(dbService, 'ai_receipt_processing', AI_RATE_LIMIT);
    const isAllowed = await rateLimitService.isAllowed(userId);

    if (!isAllowed) {
        // Get current usage for better error message
        const now = Date.now();
        const windowStart = now - AI_RATE_LIMIT.window * 1000;
        const recentRequests = await dbService.getRateLimitRequests('ai_receipt_processing', userId, windowStart);

        // Calculate reset time
        const oldestRequest = Math.min(...recentRequests.map(r => r.created_at));
        const resetAt = (oldestRequest + AI_RATE_LIMIT.window) * 1000;
        const hoursUntilReset = Math.ceil((resetAt - now) / (1000 * 60 * 60));

        return error(
            `Daily AI scan limit reached (10/10 used). Your quota will reset in approximately ${hoursUntilReset} hour${hoursUntilReset !== 1 ? 's' : ''}. Try again later!`,
            429
        );
    }

    try {
        const body = await c.req.parseBody();
        const audioFile = body['audio'] as File;
        const userLocalDate = body['userLocalDate'] as string | undefined;

        if (!audioFile) {
            return error('No audio file provided', 400);
        }

        if (!audioFile.type.startsWith('audio/')) {
            return error('Invalid file type. Please upload an audio file.', 400);
        }

        // Get Gemini API key(s) (includes fallback if configured)
        const apiKeys = AIProviderFactory.getApiKeys(env, 'gemini');

        // Get user's default currency
        const apiKeyRecord = await dbService.getApiKey(userId);
        const defaultCurrency = apiKeyRecord?.default_currency || 'EGP';

        // Process audio with user's local date and currency context
        const audioService = new AudioService();
        const arrayBuffer = await audioFile.arrayBuffer();

        console.log('[Receipt Handler] Processing audio receipt...');
        console.log('[Receipt Handler] User local date:', userLocalDate || 'not provided');
        console.log('[Receipt Handler] User currency:', defaultCurrency);
        console.log('[Receipt Handler] API keys available:', apiKeys.length);

        const result = await audioService.processAudio(
            apiKeys,
            arrayBuffer,
            audioFile.type,
            userLocalDate,
            defaultCurrency
        );

        if (!result.success) {
            return error(result.error || 'Failed to process audio', 500);
        }

        // Record the AI usage (only after successful processing)
        await rateLimitService.recordRequest(userId);

        // Add default currency to each receipt
        const receipts = result.data.map((receipt: any) => ({
            ...receipt,
            currency: defaultCurrency,
        }));

        return json(success({ receipts }));

    } catch (err: any) {
        console.error('Audio processing error:', err);
        return error(err.message || 'Failed to process audio', 500);
    }
}

/**
 * GET /api/receipts/quota
 * Get the user's remaining AI usage quota
 */
export async function getAIQuota(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const userId = c.get('userId');
    const dbService = new DBService(c.env.DB);

    try {
        const rateLimitService = new RateLimitService(dbService, 'ai_receipt_processing', AI_RATE_LIMIT);

        // Get current usage
        const now = Date.now();
        const windowStart = now - AI_RATE_LIMIT.window * 1000;
        const recentRequests = await dbService.getRateLimitRequests('ai_receipt_processing', userId, windowStart);

        const used = recentRequests.length;
        const remaining = Math.max(0, AI_RATE_LIMIT.limit - used);
        const limit = AI_RATE_LIMIT.limit;

        // Calculate reset time (24 hours from oldest request, or now if no requests)
        let resetAt: number;
        if (recentRequests.length > 0) {
            const oldestRequest = Math.min(...recentRequests.map(r => r.created_at));
            resetAt = (oldestRequest + AI_RATE_LIMIT.window) * 1000; // Convert to milliseconds
        } else {
            resetAt = now + AI_RATE_LIMIT.window * 1000;
        }

        return json(success({
            limit,
            used,
            remaining,
            resetAt,
            resetIn: Math.max(0, Math.ceil((resetAt - now) / 1000)), // Seconds until reset
        }));
    } catch (err: any) {
        console.error('Failed to get AI quota:', err);
        return error('Failed to retrieve AI usage quota', 500);
    }
}
