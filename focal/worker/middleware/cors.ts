import { Context, Next } from 'hono';

/**
 * CORS middleware for handling cross-origin requests
 */
export async function corsMiddleware(c: Context, next: Next) {
    // Allow localhost during development
    const origin = c.req.header('Origin') || '*';
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8787',
        'https://focal.creativegeek.net',
        'https://focal-finance-tracker.pages.dev',
    ];

    // In production, check if origin is in allowed list
    const env = c.env?.NODE_ENV || 'development';
    const allowOrigin = env === 'development' || allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    c.header('Access-Control-Allow-Origin', allowOrigin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
    }

    await next();
}
