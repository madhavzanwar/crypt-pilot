import { Context } from 'hono';
import { Env } from '../types';
import { success, json } from '../utils/response';

/**
 * POST /api/client-errors
 * Log client-side errors for debugging
 */
export async function logClientError(c: Context<{ Bindings: Env }>) {
    try {
        const body = await c.req.json();

        // In development, log to console
        if (c.env.NODE_ENV === 'development') {
            console.error('[Client Error]', {
                timestamp: new Date().toISOString(),
                ...body,
            });
        }

        // In production, you could send to error tracking service
        // (Sentry, Rollbar, etc.)

        return json(success({ message: 'Error logged' }), 200);
    } catch (error) {
        // Don't fail if error logging fails
        console.error('Failed to log client error:', error);
        return json(success({ message: 'Error logging failed' }), 200);
    }
}
