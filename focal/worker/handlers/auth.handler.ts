import { Context } from 'hono';
import { z } from 'zod';
import { Env } from '../types';
import { DBService } from '../services/db.service';
import { AuthService } from '../services/auth.service';
import { BrevoService } from '../services/brevo.service';
import { validateRequest, signupSchema, loginSchema } from '../utils/validation';
import { success, error, json } from '../utils/response';

type Variables = {
    userId: string;
    userEmail: string;
    token: string;
};

/**
 * POST /api/auth/signup
 * Create a new user account
 */
export async function signup(c: Context<{ Bindings: Env }>) {
    const env = c.env;
    const dbService = new DBService(env.DB);
    const authService = new AuthService(env.JWT_SECRET);

    // Validate request body
    const validation = await validateRequest(c.req.raw, signupSchema);
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { email, password } = validation.data;

    // Check if user already exists
    const existingUser = await dbService.getUserByEmail(email);
    if (existingUser) {
        return error('Email already registered', 409);
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);

    // Create user
    const userId = crypto.randomUUID();
    const user = await dbService.createUser(userId, email, passwordHash);

    // Generate verification token (24 hour expiry)
    const verificationToken = authService.generateVerificationToken();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await dbService.setVerificationToken(userId, verificationToken, verificationExpires);

    // Send verification email via Brevo
    if (env.BREVO_API_KEY) {
        const brevoService = new BrevoService(env.BREVO_API_KEY);
        const appUrl = env.APP_URL || 'http://localhost:3000';

        const emailResult = await brevoService.sendVerificationEmail(
            email,
            email.split('@')[0], // Use email username as name
            verificationToken,
            appUrl
        );

        if (!emailResult.success) {
            console.error('[Signup] Failed to send verification email:', emailResult.error);
            // Continue with signup even if email fails
        } else {
            console.log('[Signup] Verification email sent:', emailResult.messageId);
        }
    } else {
        console.warn('[Signup] BREVO_API_KEY not configured - email verification disabled');
    }

    // Generate JWT token (but user must verify email to use protected routes)
    const token = authService.generateToken({
        userId: user.id,
        email: user.email,
    });

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = authService.getTokenExpiration();
    await dbService.createSession(sessionId, user.id, token, expiresAt);

    // Set httpOnly cookie (use Secure only in production)
    const isDev = env.NODE_ENV === 'development';
    const cookieFlags = isDev
        ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
        : `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 60 * 60}`;
    const cookieValue = `auth_token=${token}; ${cookieFlags}`;

    if (isDev) {
        console.log('[Signup] Setting cookie:', cookieValue.substring(0, 60) + '...');
    }

    c.header('Set-Cookie', cookieValue);

    return json(
        success({
            user: {
                id: user.id,
                email: user.email,
                emailVerified: false,
            },
            token,
            message: 'Account created. Please check your email to verify your account.',
        }),
        201
    );
}

/**
 * POST /api/auth/login
 * Login with email and password
 */
export async function login(c: Context<{ Bindings: Env }>) {
    const env = c.env;
    const dbService = new DBService(env.DB);
    const authService = new AuthService(env.JWT_SECRET);

    // Validate request body
    const validation = await validateRequest(c.req.raw, loginSchema);
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { email, password } = validation.data;

    // Get user by email
    const user = await dbService.getUserByEmail(email);
    if (!user) {
        return error('Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await authService.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
        return error('Invalid email or password', 401);
    }

    // Generate JWT token
    const token = authService.generateToken({
        userId: user.id,
        email: user.email,
    });

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = authService.getTokenExpiration();
    await dbService.createSession(sessionId, user.id, token, expiresAt);

    // Set httpOnly cookie (use Secure only in production)
    const isDev = env.NODE_ENV === 'development';
    const cookieFlags = isDev
        ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`
        : `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 60 * 60}`;
    const cookieValue = `auth_token=${token}; ${cookieFlags}`;

    if (isDev) {
        console.log('[Login] Setting cookie:', cookieValue.substring(0, 60) + '...');
    }

    c.header('Set-Cookie', cookieValue);

    return json(
        success({
            user: {
                id: user.id,
                email: user.email,
                emailVerified: user.email_verified === 1,
            },
            token,
        })
    );
}

/**
 * POST /api/auth/logout
 * Logout and invalidate session
 */
export async function logout(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const token = c.get('token');
    const dbService = new DBService(env.DB);

    // Delete session
    await dbService.deleteSession(token);

    // Clear cookie (match the same flags used when setting)
    const isDev = env.NODE_ENV === 'development';
    const cookieFlags = isDev
        ? `HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
        : `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
    c.header('Set-Cookie', `auth_token=; ${cookieFlags}`);

    return json(success({ message: 'Logged out successfully' }));
}

/**
 * GET /api/auth/me
 * Get current user profile
 */
export async function me(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);

    const user = await dbService.getUserById(userId);
    if (!user) {
        return error('User not found', 404);
    }

    return json(
        success({
            id: user.id,
            email: user.email,
            emailVerified: user.email_verified === 1,
            created_at: user.created_at,
        })
    );
}

/**
 * GET /api/auth/verify/:token
 * Verify email address with token
 */
export async function verifyEmail(c: Context<{ Bindings: Env }>) {
    const env = c.env;
    const token = c.req.param('token');

    if (!token) {
        return error('Verification token is required', 400);
    }

    const dbService = new DBService(env.DB);
    const result = await dbService.verifyEmail(token);

    if (!result.success) {
        return error(result.error || 'Verification failed', 400);
    }

    return json(
        success(
            { userId: result.userId },
            'Email verified successfully! You can now use all features.'
        )
    );
}

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
export async function resendVerification(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const env = c.env;
    const userId = c.get('userId');
    const dbService = new DBService(env.DB);
    const authService = new AuthService(env.JWT_SECRET);

    // Get user
    const user = await dbService.getUserById(userId);
    if (!user) {
        return error('User not found', 404);
    }

    // Check if already verified
    if (user.email_verified === 1) {
        return error('Email already verified', 400);
    }

    // Generate new verification token
    const verificationToken = authService.generateVerificationToken();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await dbService.resendVerificationToken(userId, verificationToken, verificationExpires);

    // Send verification email
    if (env.BREVO_API_KEY) {
        const brevoService = new BrevoService(env.BREVO_API_KEY);
        const appUrl = env.APP_URL || 'http://localhost:3000';

        const emailResult = await brevoService.sendVerificationEmail(
            user.email,
            user.email.split('@')[0],
            verificationToken,
            appUrl
        );

        if (!emailResult.success) {
            console.error('[Brevo] Failed to send verification email:', emailResult.error);
            return error('Failed to send verification email', 500);
        }

        return json(
            success({
                message: 'Verification email sent. Please check your inbox.',
            })
        );
    } else {
        return error('Email service not configured', 500);
    }
}

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
export async function forgotPassword(c: Context<{ Bindings: Env }>) {
    const env = c.env;
    const dbService = new DBService(env.DB);
    const authService = new AuthService(env.JWT_SECRET);

    // Validate request body
    const validation = await validateRequest(c.req.raw, z.object({
        email: z.string().email('Invalid email address'),
    }));
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { email } = validation.data;

    // Check if user exists
    const user = await dbService.getUserByEmail(email);
    if (!user) {
        // Don't reveal if email exists or not for security
        return json(
            success({
                message: 'If an account with this email exists, a password reset link has been sent.',
            })
        );
    }

    // Generate reset token (1 hour expiry)
    const resetToken = authService.generateVerificationToken();
    const resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await dbService.setResetToken(user.id, resetToken, resetExpires);

    // Send reset email via Brevo
    if (env.BREVO_API_KEY) {
        const brevoService = new BrevoService(env.BREVO_API_KEY);
        const appUrl = env.APP_URL || 'http://localhost:3000';

        const emailResult = await brevoService.sendPasswordResetEmail(
            email,
            user.email.split('@')[0], // Use email username as name
            resetToken,
            appUrl
        );

        if (!emailResult.success) {
            console.error('[ForgotPassword] Failed to send reset email:', emailResult.error);
            // Continue with success response even if email fails
        } else {
            console.log('[ForgotPassword] Reset email sent:', emailResult.messageId);
        }
    } else {
        console.warn('[ForgotPassword] BREVO_API_KEY not configured - password reset disabled');
    }

    return json(
        success({
            message: 'If an account with this email exists, a password reset link has been sent.',
        })
    );
}

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
export async function resetPassword(c: Context<{ Bindings: Env }>) {
    const env = c.env;
    const dbService = new DBService(env.DB);
    const authService = new AuthService(env.JWT_SECRET);

    // Validate request body
    const validation = await validateRequest(c.req.raw, z.object({
        token: z.string().min(1, 'Reset token is required'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
    }));
    if (!validation.success) {
        return error(validation.error, 400);
    }

    const { token, password } = validation.data;

    // Verify reset token
    const tokenResult = await dbService.verifyResetToken(token);
    if (!tokenResult.success) {
        return error(tokenResult.error || 'Invalid reset token', 400);
    }

    // Hash new password
    const passwordHash = await authService.hashPassword(password);

    // Update password and clear reset token
    await dbService.updatePassword(tokenResult.userId!, passwordHash);

    return json(
        success(
            { message: 'Password reset successfully! You can now log in with your new password.' }
        )
    );
}
