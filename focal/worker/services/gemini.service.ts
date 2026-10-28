import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

/**
 * Google Gemini AI service for receipt processing
 */
export class GeminiService {
    /**
     * Process a receipt image and extract expense data
     */
    async processReceipt(apiKey: string, base64Image: string, modelName: string): Promise<any> {
        const genAI = new GoogleGenerativeAI(apiKey);

        // Get current date in YYYY-MM-DD format for the prompt
        const currentDate = new Date().toISOString().split('T')[0];

        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
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
        });

        const systemInstruction = `You are a receipt data extraction assistant. Extract the following information from receipt images:
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

        try {
            // Extract mime type and data from base64 string
            const match = base64Image.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
            if (!match) {
                throw new Error('Invalid image format. Expected data:image/{type};base64,{data}');
            }

            const mimeType = match[1] === 'jpg' ? 'jpeg' : match[1];
            const imageData = match[2];

            const result = await model.generateContent([
                systemInstruction,
                {
                    inlineData: {
                        mimeType: `image/${mimeType}`,
                        data: imageData,
                    },
                },
            ]);

            const response = result.response;
            const text = response.text();

            // Parse JSON response
            const expenseData = JSON.parse(text);

            return {
                success: true,
                data: expenseData,
            };
        } catch (error: any) {
            console.error('Gemini API error:', error);
            return {
                success: false,
                error: error.message || 'Failed to process receipt',
            };
        }
    }
}
