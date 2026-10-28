import { z } from 'zod';

/**
 * Validation schemas for API requests
 */

export const signupSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

export const expenseSchema = z.object({
    merchant: z.string().min(1, 'Merchant is required'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    total: z.number().min(0, 'Total must be a non-negative number'),
    currency: z.string().length(3, 'Currency must be a 3-letter ISO code'),
    category: z.enum(['Food & Drink', 'Groceries', 'Travel', 'Shopping', 'Utilities', 'Other']),
    lineItems: z.array(
        z.object({
            description: z.string().min(1, 'Description is required'),
            quantity: z.number().positive('Quantity must be a positive number'),
            price: z.number().min(0, 'Price must be non-negative'),
        })
    ),
});

export const processReceiptSchema = z.object({
    image: z.string().min(1, 'Image data is required'),
});

/**
 * Validate request body against a schema
 */
export async function validateRequest<T>(
    request: Request,
    schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
        const body = await request.json();
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map((err) => err.message).join(', ');
            return { success: false, error: errors };
        }

        return { success: true, data: result.data };
    } catch (err) {
        return { success: false, error: 'Invalid JSON body' };
    }
}

/**
 * Maximum allowed image dimension (width or height) in pixels
 */
export const MAX_IMAGE_DIMENSION = 2000;

/**
 * Extract image dimensions from a base64 image string
 * Supports JPEG, PNG, GIF, and WebP formats
 * @param base64Image - Base64 encoded image string (with or without data URI prefix)
 * @returns Object with width, height, and format, or null if unable to parse
 */
export function getImageDimensions(base64Image: string): { width: number; height: number; format: string } | null {
    try {
        // Remove data URI prefix if present
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

        // Decode base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Check for JPEG (starts with FF D8 FF)
        if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
            return parseJpegDimensions(bytes);
        }

        // Check for PNG (starts with 89 50 4E 47)
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
            // PNG stores dimensions at bytes 16-23 (width: 16-19, height: 20-23)
            const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
            const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
            return { width, height, format: 'png' };
        }

        // Check for GIF (starts with GIF87a or GIF89a)
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
            // GIF stores dimensions at bytes 6-9 (little-endian)
            const width = bytes[6] | (bytes[7] << 8);
            const height = bytes[8] | (bytes[9] << 8);
            return { width, height, format: 'gif' };
        }

        // Check for WebP (starts with RIFF....WEBP)
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            return parseWebpDimensions(bytes);
        }

        return null;
    } catch (err) {
        console.error('Failed to parse image dimensions:', err);
        return null;
    }
}

/**
 * Parse JPEG dimensions from binary data
 */
function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number; format: string } | null {
    let offset = 2; // Skip SOI marker

    while (offset < bytes.length) {
        // Find marker
        if (bytes[offset] !== 0xFF) {
            offset++;
            continue;
        }

        const marker = bytes[offset + 1];

        // Skip padding bytes
        if (marker === 0xFF) {
            offset++;
            continue;
        }

        // SOF markers (Start of Frame) contain dimensions
        // SOF0 (0xC0) - Baseline DCT
        // SOF1 (0xC1) - Extended sequential DCT
        // SOF2 (0xC2) - Progressive DCT
        if (marker >= 0xC0 && marker <= 0xC3) {
            const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
            const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
            return { width, height, format: 'jpeg' };
        }

        // Skip to next marker
        const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 2 + length;
    }

    return null;
}

/**
 * Parse WebP dimensions from binary data
 */
function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number; format: string } | null {
    // Check VP8 chunk type at offset 12
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

    if (chunk === 'VP8 ') {
        // Lossy WebP - dimensions at offset 26-29
        const width = ((bytes[26] | (bytes[27] << 8)) & 0x3FFF);
        const height = ((bytes[28] | (bytes[29] << 8)) & 0x3FFF);
        return { width, height, format: 'webp' };
    }

    if (chunk === 'VP8L') {
        // Lossless WebP - dimensions encoded in first 4 bytes after signature
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        const width = (bits & 0x3FFF) + 1;
        const height = ((bits >> 14) & 0x3FFF) + 1;
        return { width, height, format: 'webp' };
    }

    if (chunk === 'VP8X') {
        // Extended WebP - dimensions at offset 24-29
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width, height, format: 'webp' };
    }

    return null;
}

/**
 * Validate that an image does not exceed the maximum dimension
 * @param base64Image - Base64 encoded image string
 * @returns Object with success status and error message if validation fails
 */
export function validateImageDimensions(base64Image: string): { valid: true } | { valid: false; error: string } {
    const dimensions = getImageDimensions(base64Image);

    if (!dimensions) {
        // If we can't parse dimensions, allow the image (backend AI will handle invalid images)
        return { valid: true };
    }

    if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
        return {
            valid: false,
            error: `Image dimensions (${dimensions.width}x${dimensions.height}) exceed maximum allowed size of ${MAX_IMAGE_DIMENSION}px. Please resize the image before uploading.`,
        };
    }

    return { valid: true };
}
