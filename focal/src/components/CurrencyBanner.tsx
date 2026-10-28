import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useUserSettings } from "@/hooks/useUserSettings";

const CURRENCY_BANNER_DISMISSED_KEY = "currency_banner_dismissed";

export function CurrencyBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const navigate = useNavigate();
  const { defaultCurrency } = useUserSettings();

  useEffect(() => {
    const dismissed = sessionStorage.getItem(CURRENCY_BANNER_DISMISSED_KEY);
    if (dismissed === "true") {
      setIsDismissed(true);
    }
  }, []);

  const handleChange = () => {
    navigate("/settings");
  };

  const handleDismiss = () => {
    sessionStorage.setItem(CURRENCY_BANNER_DISMISSED_KEY, "true");
    setIsDismissed(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <Alert>
      <AlertDescription className="flex items-center justify-between">
        <span className="text-sm ">Default currency: {defaultCurrency}</span>
        <div className="flex items-center gap-2 ml-4">
          <Button size="sm" onClick={handleChange}>
            Change
          </Button>
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
