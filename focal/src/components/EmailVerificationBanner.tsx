import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Mail, Loader2 } from "lucide-react";

interface EmailVerificationBannerProps {
  onResend?: () => void;
}

export function EmailVerificationBanner({
  onResend,
}: EmailVerificationBannerProps) {
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleResend = async () => {
    setIsResending(true);
    setMessage(null);

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: "success",
          text:
            data.data.message ||
            "Verification email sent! Please check your inbox.",
        });
        if (onResend) onResend();
      } else {
        setMessage({
          type: "error",
          text:
            data.error ||
            "Failed to send verification email. Please try again.",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "An error occurred. Please try again later.",
      });
      console.error("Resend verification error:", error);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Alert className="border-amber-600 bg-amber-50 dark:bg-amber-900/20">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="ml-2 flex items-center justify-between">
          <span className="text-sm text-amber-800 dark:text-amber-200">
            Please verify your email to access all features.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResend}
            disabled={isResending}
            className="ml-4"
          >
            {isResending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Resend Email
              </>
            )}
          </Button>
        </AlertDescription>
      </Alert>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription className="text-sm">
            {message.text}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
