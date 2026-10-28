import { Context, Next } from 'hono';
import { Env } from '../types';
import { DBService } from '../services/db.service';
import { RateLimitService, RateLimitConfig } from '../services/rateLimit.service';
import { error } from '../utils/response';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

type IdentifierFn = (c: Context<{ Bindings: Env; Variables: Variables }>) => Promise<string | null>;

/**
 * Rate limiting middleware factory.
 * Creates a middleware function that enforces rate limiting based on the provided configuration.
 *
 * @param action - The action to be rate-limited (e.g., 'resend-verification', 'forgot-password').
 * @param config - The rate limit configuration (limit and window).
 * @param getIdentifier - An async function to extract the unique identifier from the request context.
 * @returns A Hono middleware function.
 */
export function rateLimit(action: string, config: RateLimitConfig, getIdentifier: IdentifierFn) {
    return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
        const env = c.env;
        const dbService = new DBService(env.DB);
        const rateLimitService = new RateLimitService(dbService, action, config);

        // Get the unique identifier for the request
        const identifier = await getIdentifier(c);

        if (!identifier) {
            // If no identifier is found, skip rate limiting but log a warning
            console.warn(`[RateLimit] Could not determine identifier for action: ${action}. Allowing request.`);
            return next();
        }

        // Check if the request is allowed
        const isAllowed = await rateLimitService.isAllowed(identifier);
        if (!isAllowed) {
            return error('Too many requests. Please try again later.', 429);
        }

        // Record the request and proceed to the next middleware
        await rateLimitService.recordRequest(identifier);
        await next();
    };
}

/**
 * Identifier function for authenticated users.
 * Uses the user ID from the context.
 */
export const byUserId: IdentifierFn = async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    return c.get('userId') || null;
};

/**
 * Identifier function for public routes that use an email address.
 * Extracts the email from the JSON request body.
 */
export const byEmail: IdentifierFn = async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    try {
        const body = await c.req.json();
        return body.email || null;
    } catch (e) {
        return null; // Ignore if body is not valid JSON
    }
};