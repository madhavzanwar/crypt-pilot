import { APIResponse } from '../types';

/**
 * Standard success response wrapper
 */
export function success<T>(data: T, message?: string): APIResponse<T> {
    return {
        success: true,
        data,
        ...(message && { message }),
    };
}

/**
 * Standard error response wrapper
 */
export function error(message: string, statusCode: number = 400): Response {
    return new Response(
        JSON.stringify({
            success: false,
            error: message,
        }),
        {
            status: statusCode,
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );
}

/**
 * JSON response helper
 */
export function json<T>(data: APIResponse<T>, statusCode: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

/**
 * Unauthorized response
 */
export function unauthorized(message: string = 'Unauthorized'): Response {
    return error(message, 401);
}

/**
 * Not found response
 */
export function notFound(message: string = 'Not found'): Response {
    return error(message, 404);
}

/**
 * Internal server error response
 */
export function serverError(message: string = 'Internal server error'): Response {
    return error(message, 500);
}
