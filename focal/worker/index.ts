import { Hono } from 'hono';
import { Env } from './types';
import { corsMiddleware } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { createRouter } from './router';

/**
 * Main Cloudflare Worker entry point
 * Serves both API endpoints and static frontend assets
 */
const app = new Hono<{ Bindings: Env }>();

// Apply CORS middleware to all routes
app.use('*', corsMiddleware);

// Apply request logging middleware to all routes
app.use('*', requestLogger);

// Health check endpoint
app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() });
});

// Mount API routes under /api prefix
const apiRouter = createRouter();
app.route('/api', apiRouter);

// Serve static assets from the ASSETS binding (production only)
// In development, Vite serves the frontend on port 3000
app.get('/*', async (c) => {
    const env = c.env;

    // If ASSETS binding is not available (development mode), return a helpful message
    if (!env.ASSETS) {
        return c.json({
            message: 'API server is running. Frontend is served by Vite on http://localhost:3000',
            apiEndpoints: {
                auth: '/api/auth/*',
                expenses: '/api/expenses/*',
                receipts: '/api/receipts/*',
                settings: '/api/settings/*',
            },
        });
    }

    // Try to fetch from assets (production mode)
    const url = new URL(c.req.url);
    const assetResponse = await env.ASSETS.fetch(url);

    // If asset not found and path doesn't have extension, serve index.html for SPA routing
    if (assetResponse.status === 404 && !url.pathname.includes('.')) {
        const indexUrl = new URL(c.req.url);
        indexUrl.pathname = '/index.html';
        return await env.ASSETS.fetch(indexUrl);
    }

    return assetResponse;
});

export default app;
