"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { isDemoMode, isDemoUserId } from "@/lib/user";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { OnboardingWizard } from "./OnboardingWizard";
import { useT } from "@/lib/i18n";

/** Opens once for a brand-new real account (never for demo personas or guest sandboxes). Skippable; editable later on /profile. */
export function OnboardingGate() {
  const userId = useUserId();
  const { t } = useT();
  const real = !isDemoMode() && !isDemoUserId(userId) && !userId.startsWith("guest-");
  const profile = useAsync(useCallback(() => (real ? api.profile(userId) : Promise.resolve(null)), [real, userId]), [real, userId]);
  const key = `finpilot:onboarding_closed:${userId}`;
  const [closed, setClosed] = useState(() => {
    try { return window.sessionStorage.getItem(key) === "1"; } catch { return false; }
  });
  // A "skipped" profile is asked again at the next sign-in; closing only hides it for this browser session.
  const open = real && !closed && profile.data !== null && (!profile.data.completed || profile.data.level === "skipped");

  function close() {
    try { window.sessionStorage.setItem(key, "1"); } catch { /* storage blocked: it may show again on reload */ }
    setClosed(true);
  }
  function skip() {
    api.saveProfile(userId, "skipped").catch(() => {});
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && skip()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("ob.title")}</DialogTitle>
          <DialogDescription>{t("ob.desc")}</DialogDescription>
        </DialogHeader>
        <OnboardingWizard userId={userId} onDone={close} onSkip={skip} />
      </DialogContent>
    </Dialog>
  );
}
