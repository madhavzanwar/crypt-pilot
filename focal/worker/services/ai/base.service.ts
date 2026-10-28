/**
 * Base AI Service Interface
 * All AI providers must implement this interface to ensure consistent behavior
 */

export interface ExpenseData {
    merchant: string;
    date: string; // YYYY-MM-DD format
    total: number;
    category: 'Food & Drink' | 'Groceries' | 'Travel' | 'Shopping' | 'Utilities' | 'Other';
    lineItems: LineItem[];
}

export interface LineItem {
    description: string;
    quantity: number;
    price: number;
}

export interface AIResponse {
    success: boolean;
    data?: ExpenseData;
    error?: string;
}

/**
 * Abstract base class for AI providers
 */
export abstract class BaseAIProvider {
    /**
     * Process a receipt image and extract expense data
     * @param base64Image - Base64 encoded image with data URI prefix (data:image/{type};base64,{data})
     * @returns Promise with structured expense data
     */
    abstract processReceipt(base64Image: string): Promise<AIResponse>;

    /**
     * Get the current date in YYYY-MM-DD format for the prompt
     */
    protected getCurrentDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Extract mime type and data from base64 string
     */
    protected parseBase64Image(base64Image: string): { mimeType: string; imageData: string } {
        const match = base64Image.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
        if (!match) {
            throw new Error('Invalid image format. Expected data:image/{type};base64,{data}');
        }

        const mimeType = match[1] === 'jpg' ? 'jpeg' : match[1];
        const imageData = match[2];

        return { mimeType, imageData };
    }

    /**
     * Get the system instruction for receipt processing
     */
    protected getSystemInstruction(): string {
        const currentDate = this.getCurrentDate();
        return `You are a receipt data extraction assistant. Extract the following information from receipt images:
- merchant: Store/restaurant name
- date: Transaction date in YYYY-MM-DD format
- total: Total amount (number only, no currency symbols or codes)
- category: One of: Food & Drink, Groceries, Travel, Shopping, Utilities, Other
- lineItems: Array of items with description, quantity, and price

Important:
- Extract the raw numeric total value without any currency symbols
- If date is unclear or not visible, use ${currentDate} (today's date: ${currentDate})
- If lineItems are not visible or unclear, return an empty array
- All fields are required and must match the schema`;
    }

    /**
     * Check if an error indicates rate limiting or quota exceeded
     */
    protected isRateLimitError(error: any): boolean {
        const errorMessage = error?.message?.toLowerCase() || '';
        const errorString = String(error).toLowerCase();
        
        return (
            errorMessage.includes('rate limit') ||
            errorMessage.includes('quota') ||
            errorMessage.includes('429') ||
            errorMessage.includes('resource exhausted') ||
            errorMessage.includes('too many requests') ||
            errorString.includes('rate limit') ||
            errorString.includes('quota')
        );
    }

    /**
     * Execute an operation with retry logic for multiple API keys
     * @param apiKeys - Array of API keys to try
     * @param operation - Async function that takes an API key and performs the operation
     * @param providerName - Name of the provider for logging
     * @returns Promise with the result
     */
    protected async executeWithFallback<T>(
        apiKeys: string[],
        operation: (apiKey: string) => Promise<T>,
        providerName: string
    ): Promise<T> {
        let lastError: any = null;

        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            const keyLabel = i === 0 ? 'primary' : `fallback ${i}`;
            
            try {
                console.log(`[${providerName}] Attempting with ${keyLabel} API key`);
                const result = await operation(apiKey);
                console.log(`[${providerName}] Success with ${keyLabel} API key`);
                return result;
            } catch (error: any) {
                console.error(`[${providerName}] Error with ${keyLabel} API key:`, error);
                lastError = error;
                
                // If this is a rate limit error and we have more keys to try, continue
                if (this.isRateLimitError(error) && i < apiKeys.length - 1) {
                    console.log(`[${providerName}] Rate limit detected, trying next API key...`);
                    continue;
                }
                
                // If it's not a rate limit error, or we've exhausted all keys, break
                if (!this.isRateLimitError(error)) {
                    console.log(`[${providerName}] Non-rate-limit error, not retrying`);
                    break;
                }
            }
        }

        // All attempts failed
        console.error(`[${providerName}] All API keys exhausted`);
        throw lastError;
    }
}
