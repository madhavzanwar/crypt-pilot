/**
 * Azure Computer Vision OCR Service
 * Extracts text from images using Azure's Read API
 */

export interface OcrResult {
    text: string;
    success: boolean;
    error?: string;
}

interface AzureReadResult {
    status: 'notStarted' | 'running' | 'succeeded' | 'failed';
    analyzeResult?: {
        readResults: Array<{
            lines: Array<{
                text: string;
            }>;
        }>;
    };
}

export class OcrService {
    private endpoint: string;
    private apiKey: string;

    constructor(endpoint: string, apiKey: string) {
        this.endpoint = endpoint;
        this.apiKey = apiKey;
    }

    /**
     * Extract text from a base64 image using Azure Computer Vision Read API
     * @param base64Image - Base64 encoded image with data URI prefix
     * @returns Extracted text from the image
     */
    async extractText(base64Image: string): Promise<OcrResult> {
        try {
            console.log('[OCR Service] Starting text extraction...');

            // Extract image data from base64 string
            const match = base64Image.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
            if (!match) {
                throw new Error('Invalid image format. Expected data:image/{type};base64,{data}');
            }

            const imageData = match[2];

            console.log('[OCR Service] Image data length:', imageData.length);

            // Convert base64 to binary
            const binaryString = atob(imageData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            console.log('[OCR Service] Converted to binary, size:', bytes.length);

            // Call Azure Computer Vision Read API
            const analyzeUrl = `${this.endpoint}/vision/v3.2/read/analyze`;

            console.log('[OCR Service] Calling Azure API:', analyzeUrl);

            const response = await fetch(analyzeUrl, {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': this.apiKey,
                    'Content-Type': 'application/octet-stream',
                },
                body: bytes,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Azure Vision API error: ${response.status} - ${errorText}`);
            }

            // Get the operation location from headers
            const operationLocation = response.headers.get('Operation-Location');
            if (!operationLocation) {
                throw new Error('No Operation-Location header in response');
            }

            // Poll for results
            let result: AzureReadResult | null = null;
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                await this.sleep(1000); // Wait 1 second between polls

                const resultResponse = await fetch(operationLocation, {
                    method: 'GET',
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.apiKey,
                    },
                });

                if (!resultResponse.ok) {
                    throw new Error(`Failed to get OCR results: ${resultResponse.status}`);
                }

                result = await resultResponse.json() as AzureReadResult;

                if (result?.status === 'succeeded') {
                    break;
                } else if (result?.status === 'failed') {
                    throw new Error('OCR processing failed');
                }

                attempts++;
            }

            if (attempts >= maxAttempts || !result) {
                throw new Error('OCR processing timeout');
            }

            // Extract text from results
            let extractedText = '';
            if (result?.analyzeResult?.readResults) {
                for (const page of result.analyzeResult.readResults) {
                    for (const line of page.lines) {
                        extractedText += line.text + '\n';
                    }
                }
            }

            return {
                success: true,
                text: extractedText.trim(),
            };
        } catch (error: any) {
            console.error('OCR error:', error);
            return {
                success: false,
                text: '',
                error: error.message || 'Failed to extract text from image',
            };
        }
    }

    /**
     * Sleep utility for polling
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
