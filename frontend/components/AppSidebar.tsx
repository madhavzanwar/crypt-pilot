"use client";

import { useT } from "@/lib/i18n";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  ScanText,
  Wallet,
  Target,
  Users,
  Sparkles,
  FlaskConical,
  GitCompare,
  Route,
  FileText,
  ShieldAlert,
  ScanSearch,
  Network,
  Database,
  Link2,
  UserRound,
  ChartLine,
  ShieldCheck,
  Coins,
  Ellipsis,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/shadcn/sidebar";
import { FinPilotLogo } from "@/components/FinPilotLogo";
import { SignInButton } from "@/components/SignInButton";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Secondary pages live under a collapsed "More" group so the primary menu stays short and focused. */
  more?: boolean;
}

export const NAV_GROUPS: { label: string; tone: string; links: NavLink[] }[] = [
  {
    label: "Copilot",
    tone: "text-[#e0540a]",
    links: [{ href: "/copilot", label: "FinPilot Copilot", icon: Sparkles }],
  },
  {
    label: "Crypto",
    tone: "text-[#3b6bff]",
    links: [
      { href: "/wallet-guard", label: "Wallet Guard", icon: ShieldCheck },
      { href: "/credits", label: "Credits", icon: Coins },
    ],
  },
  {
    label: "Track",
    tone: "text-[#0fb67a]",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/connect", label: "Connectors", icon: Link2 },
      { href: "/transactions", label: "Transactions", icon: ReceiptText },
      { href: "/upload", label: "Upload document", icon: ScanText, more: true },
      { href: "/budgets", label: "Budgets", icon: Wallet, more: true },
      { href: "/goals", label: "Goals", icon: Target, more: true },
      { href: "/household", label: "Household", icon: Users, more: true },
    ],
  },
  {
    label: "Intelligence",
    tone: "text-[#e0540a]",
    links: [
      { href: "/financial-security", label: "Financial Security", icon: ShieldAlert, more: true },
      { href: "/simulate", label: "Simulate", icon: FlaskConical },
      { href: "/plan", label: "Plan", icon: Route, more: true },
      { href: "/forecast-risk", label: "Forecast & Risk", icon: ChartLine },
      { href: "/scenarios", label: "Compare, Tax & Timeline", icon: GitCompare, more: true },
    ],
  },
  {
    label: "Reports",
    tone: "text-[#3b6bff]",
    links: [
      { href: "/statement", label: "Statement", icon: FileText },
    ],
  },
  {
    label: "Security",
    tone: "text-[#d6336c]",
    links: [
      { href: "/evidence-room", label: "Evidence Council", icon: ScanSearch },
      { href: "/council", label: "Risk Council", icon: Users },
      { href: "/twin", label: "Twin Simulator", icon: Network },
      { href: "/my-data", label: "My Data", icon: Database, more: true },
      { href: "/profile", label: "Profile", icon: UserRound, more: true },
    ],
  },
];

const MORE_LINKS: (NavLink & { tone: string })[] = NAV_GROUPS.flatMap((g) =>
  g.links.filter((l) => l.more).map((l) => ({ ...l, tone: g.tone })),
);

export function AppSidebar({ footer }: { footer?: ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();
  const { setOpenMobile, state } = useSidebar();
  const onMorePage = MORE_LINKS.some((l) => !!pathname?.startsWith(l.href));
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || onMorePage; // never hide the page you are on

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="FinPilot home">
              <Link href="/" aria-label="FinPilot home">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-mist bg-paper">
                  <FinPilotLogo size={20} />
                </div>
                <span className="font-display text-lg font-medium tracking-tight">FinPilot</span>
                <span className="-ml-1 mt-1 text-[10px] font-medium uppercase tracking-wider text-ember">x Crypto</span>
                <span className="ml-auto size-1.5 rounded-full bg-lime shadow-[0_0_8px_rgba(198,241,53,0.8)] animate-pulse" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="[@media(max-height:860px)]:gap-0 [@media(max-height:860px)]:[&_[data-sidebar=group]]:py-1 [@media(max-height:860px)]:[&_[data-sidebar=group-label]]:h-6 [@media(max-height:860px)]:[&_[data-sidebar=group-label]]:mb-0 [@media(max-height:860px)]:[&_[data-sidebar=menu]]:gap-0 [@media(max-height:860px)]:[&_[data-sidebar=menu-button]]:h-7">
        {NAV_GROUPS.filter((g) => g.links.some((l) => !l.more)).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t(`nav.${group.label}`, group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.links.filter((l) => !l.more).map(({ href, label, icon: Icon }) => {
                  const active = !!pathname?.startsWith(href);
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={t(`nav.${label}`, label)}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <Icon className={active ? "text-ink" : group.tone} />
                          <span>{t(`nav.${label}`, label)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t("nav.More", "More")}
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={showMore}
                  aria-controls="nav-more"
                >
                  <Ellipsis className="text-pewter" />
                  <span>{t("nav.More", "More")}</span>
                  <ChevronDown className={`ml-auto size-4 text-pewter transition-transform ${showMore ? "rotate-180" : ""}`} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {showMore && (
              <SidebarMenu id="nav-more">
                {MORE_LINKS.map(({ href, label, icon: Icon, tone }) => {
                  const active = !!pathname?.startsWith(href);
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={t(`nav.${label}`, label)}>
                        <Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                          <Icon className={active ? "text-ink" : tone} />
                          <span>{t(`nav.${label}`, label)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {state === "expanded" && (
          <>
            {footer}
            <SignInButton />
          </>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
