import { Context, Next } from 'hono';
import { Env } from '../types';

/**
 * Request logging middleware
 * Logs the time taken for non-GET requests (write operations only)
 */
export async function requestLogger(c: Context<{ Bindings: Env }>, next: Next) {
    const method = c.req.method;

    // Skip logging for GET requests (read operations)
    if (method === 'GET') {
        await next();
        return;
    }

    const startTime = Date.now();
    const path = new URL(c.req.url).pathname;

    try {
        await next();
    } finally {
        const duration = Date.now() - startTime;
        const status = c.res.status;

        // Log the request details
        console.log(
            `[${method}] ${path} - ${status} - ${duration}ms`
        );
    }
}
