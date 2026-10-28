/**
 * Encryption service for API key storage
 * Uses Web Crypto API for encryption/decryption
 */
export class EncryptionService {
    private encryptionKey: string;

    constructor(encryptionKey: string) {
        this.encryptionKey = encryptionKey;
    }

    /**
     * Encrypt a string using AES-GCM
     */
    async encrypt(plaintext: string): Promise<string> {
        // Convert encryption key to CryptoKey
        const keyData = new TextEncoder().encode(this.encryptionKey.padEnd(32, '0').slice(0, 32));
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        // Generate random IV (Initialization Vector)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt the plaintext
        const encodedText = new TextEncoder().encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            encodedText
        );

        // Combine IV and ciphertext, then encode as base64
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        return this.arrayBufferToBase64(combined.buffer);
    }

    /**
     * Decrypt a string using AES-GCM
     */
    async decrypt(encryptedText: string): Promise<string> {
        // Convert encryption key to CryptoKey
        const keyData = new TextEncoder().encode(this.encryptionKey.padEnd(32, '0').slice(0, 32));
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        // Decode base64 to ArrayBuffer
        const combined = this.base64ToArrayBuffer(encryptedText);
        const combinedArray = new Uint8Array(combined);

        // Extract IV and ciphertext
        const iv = combinedArray.slice(0, 12);
        const ciphertext = combinedArray.slice(12);

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Convert ArrayBuffer to base64 string
     */
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert base64 string to ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
