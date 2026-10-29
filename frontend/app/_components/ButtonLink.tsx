import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// A link that looks like components/ui/Button. A <Link> wrapping a <button> is invalid HTML (nested
// interactive content), so landing CTAs use this instead. Keep the class strings in step with Button.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-chip font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const VARIANT = {
  primary: "bg-navy text-white shadow-[0_2px_10px_rgba(23,37,84,0.22)] hover:bg-navy-light hover:shadow-[0_4px_16px_rgba(23,37,84,0.32)] border border-navy-dark/30",
  lime: "bg-lime text-ink font-semibold shadow-[0_2px_12px_rgba(166,209,26,0.35)] hover:bg-lime-dark hover:shadow-[0_4px_16px_rgba(166,209,26,0.45)] border border-lime-dark/40",
  secondary: "border border-mist bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-fog hover:border-black/[0.12]",
};

export function ButtonLink({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof VARIANT }) {
  return <Link className={cn(BASE, "min-h-12 px-6 py-3 text-base font-semibold", VARIANT[variant], className)} {...props} />;
}
