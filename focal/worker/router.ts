import { Hono } from 'hono';
import { Env } from './types';
import { authMiddleware } from './middleware/auth';
import { rateLimit, byUserId, byEmail } from './middleware/rateLimit';
import * as authHandler from './handlers/auth.handler';
import * as expensesHandler from './handlers/expenses.handler';
import * as apiKeysHandler from './handlers/apiKeys.handler';
import * as receiptsHandler from './handlers/receipts.handler';
import * as errorsHandler from './handlers/errors.handler';
import * as adminHandler from './handlers/admin.handler';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

/**
 * API Router for Focal Finance Tracker
 */
export function createRouter() {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    // ============ AUTHENTICATION ROUTES ============
    app.post('/auth/signup', authHandler.signup);
    app.post('/auth/login', authHandler.login);
    app.post('/auth/logout', authMiddleware, authHandler.logout);
    app.get('/auth/me', authMiddleware, authHandler.me);
    app.get('/auth/verify/:token', authHandler.verifyEmail);
    // Rate limit: 3 requests per 15 minutes
    const resendVerificationLimiter = rateLimit(
        'resend-verification',
        { limit: 3, window: 900 },
        byUserId
    );
    app.post('/auth/resend-verification', resendVerificationLimiter, authMiddleware, authHandler.resendVerification);

    // Rate limit: 3 requests per 15 minutes
    const forgotPasswordLimiter = rateLimit(
        'forgot-password',
        { limit: 3, window: 900 },
        byEmail
    );
    app.post('/auth/forgot-password', forgotPasswordLimiter, authHandler.forgotPassword);
    app.post('/auth/reset-password', authHandler.resetPassword);

    // ============ EXPENSE ROUTES (Protected) ============
    app.get('/expenses', authMiddleware, expensesHandler.getExpenses);
    app.get('/expenses/:id', authMiddleware, expensesHandler.getExpenseById);
    app.post('/expenses', authMiddleware, expensesHandler.createExpense);
    app.put('/expenses/:id', authMiddleware, expensesHandler.updateExpense);
    app.delete('/expenses/:id', authMiddleware, expensesHandler.deleteExpense);

    // ============ RECEIPT PROCESSING ROUTES (Protected) ============
    app.post('/receipts/process', authMiddleware, receiptsHandler.processReceipt);
    app.post('/receipts/process-audio', authMiddleware, receiptsHandler.processAudioReceipt);
    app.get('/receipts/quota', authMiddleware, receiptsHandler.getAIQuota);

    // ============ SETTINGS ROUTES (Protected) ============
    app.get('/settings/currency', authMiddleware, apiKeysHandler.getCurrency);
    app.put('/settings/currency', authMiddleware, apiKeysHandler.updateCurrency);
    app.get('/settings/ai-provider', authMiddleware, apiKeysHandler.getAIProvider);
    app.put('/settings/ai-provider', authMiddleware, apiKeysHandler.updateAIProvider);

    // ============ ERROR LOGGING ROUTES ============
    app.post('/client-errors', errorsHandler.logClientError);

    // ============ ADMIN ROUTES (Protected + Admin Check) ============
    // Note: Admin check happens inside each handler (returns 404 for non-admins)
    app.get('/admin/check', authMiddleware, adminHandler.checkAdmin);
    app.get('/admin/stats', authMiddleware, adminHandler.getStats);
    app.get('/admin/users', authMiddleware, adminHandler.getUsers);
    app.get('/admin/user/:email/expenses', authMiddleware, adminHandler.getUserExpenses);

    return app;
}
