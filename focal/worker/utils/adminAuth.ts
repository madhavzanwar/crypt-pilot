import { Env } from '../types';

/**
 * Check if a user email matches the admin email
 * Returns false if ADMIN_EMAIL is not configured
 */
export function isAdmin(email: string, env: Env): boolean {
    const adminEmail = env.ADMIN_EMAIL;
    if (!adminEmail) {
        return false;
    }
    return email.toLowerCase() === adminEmail.toLowerCase();
}