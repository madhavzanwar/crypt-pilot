import { useState } from 'react';
import { expenseService, ExpenseData } from '@/lib/expense-service';
import { resizeImage } from '@/lib/utils';
import { toast } from 'sonner';
import { useUserSettings } from '@/hooks/useUserSettings';

export const useExpenseCreation = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [extractedData, setExtractedData] = useState<ExpenseData | null>(null);
    const [originalData, setOriginalData] = useState<ExpenseData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { defaultCurrency } = useUserSettings();

    const handleImageProcessing = async (base64Image: string) => {
        setIsProcessing(true);
        setError(null);
        setExtractedData(null);
        setOriginalData(null);

        try {
            const resizedImage = await resizeImage(base64Image, 1200);
            const response = await expenseService.processReceipt(resizedImage);

            if (response.success && response.data) {
                const data = {
                    ...response.data,
                    lineItems: response.data.lineItems || [],
                };
                setExtractedData(data);
                setOriginalData(data);
            } else {
                setError(response.error || 'Failed to extract data from receipt.');
                toast.error('Processing Failed', { description: response.error });
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred.';
            setError(errorMessage);
            toast.error('Processing Error', { description: 'Could not connect to the server.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAudioProcessing = async (audioBlob: Blob) => {
        setIsProcessing(true);
        setError(null);
        setExtractedData(null);
        setOriginalData(null);

        try {
            const response = await expenseService.processAudioReceipt(audioBlob);
            if (response.success && response.data && response.data.length > 0) {
                return response.data;
            } else {
                setError(response.error || 'Failed to process audio.');
                toast.error('Processing Failed', { description: response.error });
                return null;
            }
        } catch (e) {
            console.error('Error processing audio:', e);
            toast.error('Processing Error', { description: 'Could not connect to the server.' });
            return null;
        } finally {
            setIsProcessing(false);
        }
    };

    const handleManualEntry = () => {
        const today = new Date().toISOString().split('T')[0];
        const newData = {
            merchant: '',
            date: today,
            total: 0,
            currency: defaultCurrency,
            category: 'Other',
            lineItems: [{ description: '', quantity: 1, price: 0 }],
        };
        setExtractedData(newData);
        setOriginalData(newData);
    };

    const handleSave = async () => {
        if (extractedData && !isSaving) {
            setIsSaving(true);
            try {
                const response = await expenseService.saveExpense(extractedData);
                if (response.success) {
                    toast.success('Expense Saved!', {
                        description: `${extractedData.merchant} for ${extractedData.total} has been added.`,
                    });
                    setExtractedData(null);
                    // Optional: Trigger a refresh callback if provided
                    return true;
                } else {
                    toast.error('Save Failed', { description: response.error });
                    return false;
                }
            } catch (e) {
                toast.error('Save Error', { description: 'Could not connect to the server.' });
                return false;
            } finally {
                setIsSaving(false);
            }
        }
        return false;
    };

    return {
        isProcessing,
        isSaving,
        extractedData,
        setExtractedData,
        originalData,
        error,
        setError,
        defaultCurrency,
        handleImageProcessing,
        handleAudioProcessing,
        handleManualEntry,
        handleSave,
    };
};
