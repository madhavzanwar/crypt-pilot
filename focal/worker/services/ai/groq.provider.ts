import { BaseAIProvider, AIResponse } from './base.service';
import { OcrService } from '../ocr.service';

/**
 * Groq Provider with OCR
 * Uses Azure Computer Vision for OCR and Groq for LLM structuring
 */
export class GroqProvider extends BaseAIProvider {
    private groqApiKeys: string[];
    private azureEndpoint: string;
    private azureApiKey: string;
    private modelName: string;

    constructor(
        groqApiKeys: string | string[],
        azureEndpoint: string,
        azureApiKey: string,
        modelName: string = 'openai/gpt-oss-20b'
    ) {
        super();
        // Support both single key (backward compatible) and array of keys
        this.groqApiKeys = Array.isArray(groqApiKeys) ? groqApiKeys : [groqApiKeys];
        this.azureEndpoint = azureEndpoint;
        this.azureApiKey = azureApiKey;
        this.modelName = modelName;
    }

    async processReceipt(base64Image: string): Promise<AIResponse> {
        try {
            console.log('[Groq Provider] Starting receipt processing...');
            console.log('[Groq Provider] Azure endpoint:', this.azureEndpoint);
            console.log('[Groq Provider] Model:', this.modelName);

            // Step 1: Extract text using Azure OCR
            const ocrService = new OcrService(this.azureEndpoint, this.azureApiKey);
            const ocrResult = await ocrService.extractText(base64Image);

            console.log('[Groq Provider] OCR result:', ocrResult.success ? 'Success' : 'Failed');

            if (!ocrResult.success) {
                console.error('[Groq Provider] OCR failed:', ocrResult.error);
                return {
                    success: false,
                    error: ocrResult.error || 'OCR extraction failed',
                };
            }

            console.log('[Groq Provider] OCR text length:', ocrResult.text.length);
            console.log('[Groq Provider] Calling Groq LLM for structuring...');

            // Step 2: Structure the OCR text using Groq LLM (with fallback)
            const structuredData = await this.structureWithGroq(ocrResult.text);

            console.log('[Groq Provider] Structuring result:', structuredData.success ? 'Success' : 'Failed');

            return structuredData;
        } catch (error: any) {
            console.error('Groq provider error:', error);
            return {
                success: false,
                error: error.message || 'Failed to process receipt',
            };
        }
    }

    /**
     * Structure OCR text using Groq LLM with JSON mode
     */
    private async structureWithGroq(ocrText: string): Promise<AIResponse> {
        try {
            const currentDate = this.getCurrentDate();
            
            const systemPrompt = `You are an expert AI data extraction assistant.

Your task is to analyze the provided OCR text from a receipt and extract the specified information.
You must format your response as a single, valid JSON object that strictly adheres to the provided schema.

**Constraints:**
1. **Strict Schema:** Only output the JSON object. Do not add any explanatory text, markdown formatting, or "\`\`\`json" tags before or after the JSON.
2. **Date Format:** The date must be in YYYY-MM-DD format. If the year is not specified, use ${currentDate.split('-')[0]} (current year).
3. **Numeric Fields:** "total", "quantity", and "price" must be numbers (float or int), not strings. Do not include currency symbols ($, €, etc.).
4. **Category Inference:** Analyze the merchant name and the line items to determine the most appropriate category from: ["Food & Drink", "Groceries", "Travel", "Shopping", "Utilities", "Other"].
5. **Line Items:**
   - Extract all individual items listed.
   - If quantity is not explicitly mentioned, assume quantity is 1.0.
   - If quantity is specified (e.g., "2x Item"), use that quantity.
   - The "price" for a line item should be the total price for that line.
6. **OCR Messiness:** The text will be "dirty" from OCR. Do your best to interpret misspelled words, cut off words, and fragmented lines.
7. **Total:** The "total" field must be the final amount paid, usually labeled "TOTAL", "AMOUNT", or similar.

If the date is unclear or not visible, use ${currentDate} (today's date).
If lineItems are not visible or unclear, return an empty array.`;

            const userPrompt = `Please extract the information from the following receipt text according to the schema.

Receipt text:
${ocrText}

Extract the merchant, date, total, category, and line items. Return ONLY a valid JSON object with this structure:
{
  "merchant": "Store Name",
  "date": "YYYY-MM-DD",
  "total": 123.45,
  "category": "Food & Drink",
  "lineItems": [
    {
      "description": "Item name",
      "quantity": 1.0,
      "price": 10.00
    }
  ]
}`;

            console.log('[Groq Provider] Making Groq API call...');
            console.log('[Groq Provider] OCR text preview:', ocrText.substring(0, 200));

            const expenseData = await this.executeWithFallback(
                this.groqApiKeys,
                async (groqApiKey) => {
                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${groqApiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: this.modelName,
                            messages: [
                                {
                                    role: 'system',
                                    content: systemPrompt,
                                },
                                {
                                    role: 'user',
                                    content: userPrompt,
                                },
                            ],
                            temperature: 0.2,
                            max_tokens: 4000,
                            response_format: {
                                type: 'json_object',
                            },
                        }),
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
                    }

                    const result: any = await response.json();
                    const content = result.choices?.[0]?.message?.content;

                    if (!content) {
                        throw new Error('No response from Groq API');
                    }

                    const data = JSON.parse(content);

                    // Validate required fields
                    if (!data.merchant || !data.date || !data.total || !data.category) {
                        throw new Error('Missing required fields in structured data');
                    }

                    // Ensure lineItems is an array
                    if (!Array.isArray(data.lineItems)) {
                        data.lineItems = [];
                    }

                    return data;
                },
                'Groq Provider'
            );

            return {
                success: true,
                data: expenseData,
            };
        } catch (error: any) {
            console.error('[Groq Provider] Structuring error:', error);
            return {
                success: false,
                error: error.message || 'Failed to structure receipt data',
            };
        }
    }
}
