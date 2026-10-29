"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/shadcn/sheet";
import { CreditsPanel } from "./CreditsPanel";

/** Right-side sheet with the balance, packs and both test-mode payment paths. Controlled by CreditsPill. */
export function CreditsDrawer({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element that gets focus back when the drawer closes (Escape, the close button, the overlay). */
  returnFocusTo?: () => HTMLElement | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(e) => {
          const el = returnFocusTo?.();
          if (el && el.isConnected) {
            e.preventDefault();
            el.focus();
          }
        }}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-xl text-ink">Credits</SheetTitle>
          <SheetDescription>One credit pays for one new wallet check. Test mode only.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {/* mount the panel only while open so closed drawers do not poll or hold invoices */}
          {open && <CreditsPanel compact />}
          <Link href="/credits" onClick={() => onOpenChange(false)} className="mt-5 inline-flex text-sm font-medium text-ink underline underline-offset-4">
            How credits work
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
