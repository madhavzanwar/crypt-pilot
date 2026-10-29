"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useAsync, useUserId } from "@/lib/hooks";
import { isDemoUserId } from "@/lib/user";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { PaymentReviewCard } from "@/components/dashboard/PaymentReviewCard";

export default function ProfilePage() {
  const userId = useUserId();
  const profile = useAsync(useCallback(() => api.profile(userId), [userId]), [userId]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-3xl text-ink">Your profile</h1>
        <p className="text-sm text-graphite">What you tell FinPilot here is used by the Copilot to personalise its answers. Change it whenever your life changes.</p>
      </div>
      {/* ProfileForm caps its question list at 45vh with an inner scroller (right for the onboarding dialog, wrong for a full page: the last inputs were cut off). Lift the cap here. */}
      <div className="rounded-card bg-white p-5 shadow-sm [&_.max-h-\[45vh\]]:max-h-none [&_.max-h-\[45vh\]]:overflow-visible">
        {isDemoUserId(userId) && <p className="mb-4 rounded-2xl bg-fog p-3 text-xs text-graphite">This is a demo persona, so answers are saved to the demo profile shared by everyone using it.</p>}
        {profile.loading && !profile.data ? (
          <p className="text-sm text-pewter">Loading…</p>
        ) : (
          <ProfileForm key={userId + (profile.data?.level ?? "new")} userId={userId} initial={profile.data} onDone={() => profile.reload()} />
        )}
      </div>
      <PaymentReviewCard />
    </div>
  );
}
