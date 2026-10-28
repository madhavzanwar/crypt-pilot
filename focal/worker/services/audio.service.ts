import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

/**
 * Audio Service for processing voice notes using Gemini
 */
export class AudioService {
    /**
     * Check if an error indicates rate limiting or quota exceeded
     */
    private isRateLimitError(error: any): boolean {
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
     */
    private async executeWithFallback<T>(
        apiKeys: string[],
        operation: (apiKey: string) => Promise<T>,
        serviceName: string
    ): Promise<T> {
        let lastError: any = null;

        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            const keyLabel = i === 0 ? 'primary' : `fallback ${i}`;

            try {
                console.log(`[${serviceName}] Attempting with ${keyLabel} API key`);
                const result = await operation(apiKey);
                console.log(`[${serviceName}] Success with ${keyLabel} API key`);
                return result;
            } catch (error: any) {
                console.error(`[${serviceName}] Error with ${keyLabel} API key:`, error);
                lastError = error;

                // If this is a rate limit error and we have more keys to try, continue
                if (this.isRateLimitError(error) && i < apiKeys.length - 1) {
                    console.log(`[${serviceName}] Rate limit detected, trying next API key...`);
                    continue;
                }

                // If it's not a rate limit error, or we've exhausted all keys, break
                if (!this.isRateLimitError(error)) {
                    console.log(`[${serviceName}] Non-rate-limit error, not retrying`);
                    break;
                }
            }
        }

        // All attempts failed
        console.error(`[${serviceName}] All API keys exhausted`);
        throw lastError;
    }

    /**
     * Process an audio file and extract receipt data
     * @param apiKeys - Gemini API key(s) - can be a single key or array of keys for fallback
     * @param audioData - Audio file as ArrayBuffer
     * @param mimeType - MIME type of the audio file
     * @param userLocalDate - User's local date in YYYY-MM-DD format (optional, defaults to server date)
     * @param userCurrency - User's default currency (optional, for context in AI prompt)
     */
    async processAudio(
        apiKeys: string | string[],
        audioData: ArrayBuffer,
        mimeType: string,
        userLocalDate?: string,
        userCurrency?: string
    ): Promise<any> {
        // Support both single key (backward compatible) and array of keys
        const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

        // Use user's local date if provided, otherwise fall back to server date
        const currentDate = userLocalDate || new Date().toISOString().split('T')[0];

        // Add currency context to the system instruction if provided
        const currencyContext = userCurrency
            ? `\n- The user's default currency is ${userCurrency}. If the currency is not explicitly mentioned in the audio, you can assume amounts are in ${userCurrency}.`
            : '';

        const systemInstruction = `You are an expert receipt extraction assistant. Your task is to analyze audio recordings where users describe their purchases or read out receipt details.

From the audio, you must extract ALL receipts mentioned and structure each one according to the provided schema.

IMPORTANT DATE CONTEXT:
- Today's date is ${currentDate}
- When the user mentions relative dates, calculate them based on TODAY being ${currentDate}:
  * "today" or "اليوم" (al-yawm) = ${currentDate}
  * "yesterday" or "امبارح" or "أمس" (ams) = subtract 1 day from ${currentDate}
  * "last Monday", "last week", etc. = calculate backwards from ${currentDate}
  * "this morning", "earlier today" = use ${currentDate}
- If the date is unclear or not mentioned at all, use ${currentDate}

Key guidelines:
- Listen carefully for merchant names, dates, items purchased, quantities, and prices
- If multiple receipts are mentioned in the audio, extract each one separately
- Pay special attention to date mentions in both English and Arabic (امبارح, أمس, اليوم)
- Assign appropriate categories based on merchant type and items mentioned (Food & Drink, Groceries, Travel, Shopping, Utilities, Other)
- If prices aren't explicitly stated, use your best judgment based on typical market prices
- If quantity isn't mentioned, assume 1
- Be thorough and extract every receipt mentioned in the audio
- Provide the final output in the same language as the audio
${currencyContext}
Return a list of all receipts found in the audio.`;

        try {
            // Convert ArrayBuffer to base64
            const base64Audio = btoa(
                new Uint8Array(audioData).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            const receipts = await this.executeWithFallback(
                keys,
                async (apiKey) => {
                    const genAI = new GoogleGenerativeAI(apiKey);

                    const model = genAI.getGenerativeModel({
                        model: 'gemini-2.5-flash',
                        generationConfig: {
                            responseMimeType: 'application/json',
                            responseSchema: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    receipts: {
                                        type: SchemaType.ARRAY,
                                        items: {
                                            type: SchemaType.OBJECT,
                                            properties: {
                                                merchant: {
                                                    type: SchemaType.STRING,
                                                    description: 'Store or restaurant name',
                                                    nullable: false,
                                                },
                                                date: {
                                                    type: SchemaType.STRING,
                                                    description: 'Transaction date in YYYY-MM-DD format',
                                                    nullable: false,
                                                },
                                                total: {
                                                    type: SchemaType.NUMBER,
                                                    description: 'Total amount (number only, no currency symbols)',
                                                    nullable: false,
                                                },
                                                category: {
                                                    type: SchemaType.STRING,
                                                    description: 'Expense category (Food & Drink, Groceries, Travel, Shopping, Utilities, Other)',
                                                    nullable: false,
                                                },
                                                lineItems: {
                                                    type: SchemaType.ARRAY,
                                                    description: 'Individual items from the receipt',
                                                    items: {
                                                        type: SchemaType.OBJECT,
                                                        properties: {
                                                            description: {
                                                                type: SchemaType.STRING,
                                                                description: 'Item description',
                                                                nullable: false,
                                                            },
                                                            quantity: {
                                                                type: SchemaType.NUMBER,
                                                                description: 'Item quantity',
                                                                nullable: false,
                                                            },
                                                            price: {
                                                                type: SchemaType.NUMBER,
                                                                description: 'Item price',
                                                                nullable: false,
                                                            },
                                                        },
                                                        required: ['description', 'quantity', 'price'],
                                                    },
                                                    nullable: false,
                                                },
                                            },
                                            required: ['merchant', 'date', 'total', 'category', 'lineItems'],
                                        },
                                    },
                                },
                                required: ['receipts'],
                            },
                        },
                    });

                    const result = await model.generateContent([
                        systemInstruction,
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Audio,
                            },
                        },
                    ]);

                    const response = result.response;
                    const text = response.text();

                    // Parse JSON response
                    const parsedData = JSON.parse(text);
                    return parsedData.receipts || [];
                },
                'AudioService'
            );

            return {
                success: true,
                data: receipts,
            };
        } catch (error: any) {
            console.error('[AudioService] Error:', error);
            return {
                success: false,
                error: error?.message || 'Failed to process audio',
            };
        }
    }
}
