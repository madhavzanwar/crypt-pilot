import { Context, Next } from 'hono';
import { Env, JWTPayload } from '../types';
import { AuthService } from '../services/auth.service';
import { DBService } from '../services/db.service';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header or cookie
 */
export async function authMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
    const env = c.env;
    const authService = new AuthService(env.JWT_SECRET);
    const dbService = new DBService(env.DB);

    // Get token from Authorization header or cookie
    let token: string | null = null;

    // Try Authorization header first
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }

    // Fall back to cookie
    if (!token) {
        const cookieHeader = c.req.header('Cookie');

        // Debug logging in development
        if (env.NODE_ENV === 'development') {
            console.log('[Auth Debug] Cookie header:', cookieHeader);
            console.log('[Auth Debug] All headers:', Object.fromEntries(c.req.raw.headers.entries()));
        }

        if (cookieHeader) {
            const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {} as Record<string, string>);
            token = cookies['auth_token'];

            if (env.NODE_ENV === 'development') {
                console.log('[Auth Debug] Parsed cookies:', cookies);
                console.log('[Auth Debug] Token found:', !!token);
            }
        }
    }

    if (!token) {
        return c.json({ success: false, error: 'Unauthorized - No token provided' }, 401);
    }

    // Verify token
    const payload = authService.verifyToken(token);
    if (!payload) {
        return c.json({ success: false, error: 'Unauthorized - Invalid token' }, 401);
    }

    // Check if session exists and is not expired
    const session = await dbService.getSessionByToken(token);
    if (!session) {
        return c.json({ success: false, error: 'Unauthorized - Session not found' }, 401);
    }

    if (session.expires_at < Date.now()) {
        await dbService.deleteSession(token);
        return c.json({ success: false, error: 'Unauthorized - Session expired' }, 401);
    }

    // Check if email is verified (optional - can be enforced per route)
    const user = await dbService.getUserById(payload.userId);
    if (!user) {
        return c.json({ success: false, error: 'Unauthorized - User not found' }, 401);
    }

    // Check email verification status
    if (env.BREVO_API_KEY && user.email_verified !== 1) {
        // Only enforce verification if Brevo is configured
        const path = new URL(c.req.url).pathname;

        // Allow access to certain routes even without verification
        const allowedPaths = [
            '/api/auth/me',
            '/api/auth/logout',
            '/api/auth/resend-verification',
            '/api/auth/verify'
        ];

        const isAllowed = allowedPaths.some(p => path.startsWith(p));

        if (!isAllowed) {
            return c.json({
                success: false,
                error: 'Email verification required',
                code: 'EMAIL_NOT_VERIFIED'
            }, 403);
        }
    }

    // Attach user info to context
    c.set('userId', payload.userId);
    c.set('userEmail', payload.email);
    c.set('token', token);

    await next();
}

/**
 * Optional authentication middleware
 * Allows requests without auth but attaches user info if present
 */
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
    try {
        await authMiddleware(c, next);
    } catch {
        await next();
    }
}
