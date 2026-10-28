import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resize an image to a maximum dimension while maintaining aspect ratio
 * @param base64Image - Base64 encoded image string (with data:image prefix)
 * @param maxDimension - Maximum width or height in pixels (default: 1000)
 * @returns Promise<string> - Resized base64 image
 */
export async function resizeImage(
  base64Image: string,
  maxDimension: number = 1000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      // Only resize if image exceeds max dimension
      if (width <= maxDimension && height <= maxDimension) {
        resolve(base64Image);
        return;
      }

      // Calculate scaling factor
      const scaleFactor = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * scaleFactor);
      height = Math.round(height * scaleFactor);

      // Create canvas and resize
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw resized image
      ctx.drawImage(img, 0, 0, width, height);

      // Convert back to base64
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.9);
      resolve(resizedBase64);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = base64Image;
  });
}
