import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Loader, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUserSettings, AIProvider } from "@/hooks/useUserSettings";

const CURRENCIES = ["CAD", "EGP", "EUR", "GBP", "JPY", "SAR", "USD"];
const AI_PROVIDERS = [
  { value: "gemini", label: "Google Gemini" },
  { value: "openai", label: "OpenAI GPT-4o" },
  { value: "nvidia", label: "Nvidia NIM (Experimental)" },
  { value: "groq", label: "Groq (OCR + LLM)" },
];

export const SettingsPage: React.FC = () => {
  const {
    defaultCurrency,
    aiProvider: savedAiProvider,
    isLoading,
    isSaving,
    updateSettings,
  } = useUserSettings();

  // Local state for form editing
  const [currency, setCurrency] = useState(defaultCurrency);
  const [aiProvider, setAiProvider] = useState<AIProvider>(savedAiProvider);

  // Sync local state when settings are loaded
  useEffect(() => {
    setCurrency(defaultCurrency);
    setAiProvider(savedAiProvider);
  }, [defaultCurrency, savedAiProvider]);

  const handleSave = async () => {
    const success = await updateSettings({
      defaultCurrency: currency,
      aiProvider: aiProvider,
    });

    if (success) {
      toast.success("Settings Saved", {
        description: "Your preferences have been updated successfully.",
      });
    } else {
      toast.error("Failed to save settings. Please try again.");
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Manage your application preferences.
        </p>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Choose your preferred AI provider for receipt scanning. You have
              10 free scans per day.
            </AlertDescription>
          </Alert>

          <div className="grid gap-6">
            <div className="grid md:grid-cols-3 items-start gap-4">
              <Label htmlFor="ai-provider" className="md:text-right md:mt-2">
                AI Provider
              </Label>
              <div className="md:col-span-2 space-y-2">
                <Select
                  value={aiProvider}
                  onValueChange={(value) => setAiProvider(value as AIProvider)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select AI provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        <div className="flex flex-col">
                          <span>{provider.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Switch providers if one isn't working or to try different
                  accuracy levels.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 items-center gap-4">
              <Label htmlFor="currency" className="md:text-right">
                Default Currency
              </Label>
              <div className="md:col-span-2">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  This currency will be automatically assigned to new expenses.
                </p>
              </div>
            </div>
          </div>
          <footer className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </footer>
        </div>
      )}
    </div>
  );
};
