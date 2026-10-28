import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";
import { NavShell } from "@/components/NavShell";
import { Toaster } from "@/components/shadcn/sonner";
import { LiveSync } from "@/components/LiveSync";
import { SheetAutoSync } from "@/components/connect/SheetAutoSync";
import { ChatPopup } from "@/components/copilot/ChatPopup";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { CopilotToaster } from "@/components/copilot/CopilotToaster";

/** Shell for the app routes (dashboard/copilot/simulate/timeline). Nothing renders until the visitor is signed in (AuthGate). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <NavShell>
        {children}
        <CopilotToaster />
        <ChatPopup />
        <OnboardingGate />
        <SheetAutoSync />
        <LiveSync />
        <Toaster richColors position="top-right" />
      </NavShell>
    </AuthGate>
  );
}
