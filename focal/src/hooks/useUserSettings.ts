import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = '/api';

// Helper to get auth headers
const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

export type AIProvider = 'gemini' | 'openai' | 'nvidia' | 'groq';

interface UserSettings {
    defaultCurrency: string;
    aiProvider: AIProvider;
}

interface UseUserSettingsReturn {
    defaultCurrency: string;
    aiProvider: AIProvider;
    isLoading: boolean;
    isSaving: boolean;
    updateCurrency: (currency: string) => Promise<boolean>;
    updateAIProvider: (provider: AIProvider) => Promise<boolean>;
    updateSettings: (settings: Partial<UserSettings>) => Promise<boolean>;
    refetch: () => Promise<void>;
}

export const useUserSettings = (): UseUserSettingsReturn => {
    const [defaultCurrency, setDefaultCurrency] = useState<string>('EGP');
    const [aiProvider, setAiProvider] = useState<AIProvider>('gemini');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const [currencyResponse, providerResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/settings/currency`, {
                    headers: getAuthHeaders(),
                    credentials: 'include',
                }),
                fetch(`${API_BASE_URL}/settings/ai-provider`, {
                    headers: getAuthHeaders(),
                    credentials: 'include',
                }),
            ]);

            if (currencyResponse.ok) {
                const currencyData = await currencyResponse.json();
                if (currencyData.data?.defaultCurrency) {
                    setDefaultCurrency(currencyData.data.defaultCurrency);
                }
            }

            if (providerResponse.ok) {
                const providerData = await providerResponse.json();
                if (providerData.data?.aiProvider) {
                    setAiProvider(providerData.data.aiProvider);
                }
            }
        } catch (error) {
            console.error('Failed to fetch user settings:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const updateCurrency = useCallback(async (currency: string): Promise<boolean> => {
        setIsSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/settings/currency`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({ defaultCurrency: currency }),
            });

            if (response.ok) {
                setDefaultCurrency(currency);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update currency:', error);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, []);

    const updateAIProvider = useCallback(async (provider: AIProvider): Promise<boolean> => {
        setIsSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/settings/ai-provider`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({ aiProvider: provider }),
            });

            if (response.ok) {
                setAiProvider(provider);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update AI provider:', error);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, []);

    const updateSettings = useCallback(async (settings: Partial<UserSettings>): Promise<boolean> => {
        setIsSaving(true);
        try {
            const promises: Promise<Response>[] = [];

            if (settings.defaultCurrency !== undefined) {
                promises.push(
                    fetch(`${API_BASE_URL}/settings/currency`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        credentials: 'include',
                        body: JSON.stringify({ defaultCurrency: settings.defaultCurrency }),
                    })
                );
            }

            if (settings.aiProvider !== undefined) {
                promises.push(
                    fetch(`${API_BASE_URL}/settings/ai-provider`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        credentials: 'include',
                        body: JSON.stringify({ aiProvider: settings.aiProvider }),
                    })
                );
            }

            const responses = await Promise.all(promises);
            const allSuccessful = responses.every((r) => r.ok);

            if (allSuccessful) {
                if (settings.defaultCurrency !== undefined) {
                    setDefaultCurrency(settings.defaultCurrency);
                }
                if (settings.aiProvider !== undefined) {
                    setAiProvider(settings.aiProvider);
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to update settings:', error);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, []);

    return {
        defaultCurrency,
        aiProvider,
        isLoading,
        isSaving,
        updateCurrency,
        updateAIProvider,
        updateSettings,
        refetch: fetchSettings,
    };
};
