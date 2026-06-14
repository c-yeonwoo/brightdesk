import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Briefcase, Database, Sparkles } from "lucide-react";
import brightdeskLogo from "@/assets/brightdesk-logo.png";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCenter } from "./AlertCenter";
import { PlainModeToggle } from "./PlainModeToggle";
import { UserMenu } from "./UserMenu";
import { getFxRate } from "@/lib/fx.functions";
import { isCurrentUserAdmin } from "@/lib/access-control";

const nav = [
  { to: "/", label: "대시보드", icon: Activity },
  { to: "/my-portfolio", label: "포트폴리오", icon: Briefcase },
  { to: "/insights", label: "인사이트", icon: Sparkles },
  { to: "/data", label: "데이터", icon: Database },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: isAdmin = false } = useQuery({
    queryKey: ["current-user-admin"],
    queryFn: () => isCurrentUserAdmin(),
    staleTime: 60 * 1000,
  });
  const visibleNav = nav.filter((item) => item.to !== "/data" || isAdmin);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img
              src={brightdeskLogo}
              alt="BrightDesk"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">BrightDesk</span>
              <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
                Market desk · 1,000만원 실증
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {visibleNav.map((n) => {
              const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors " +
                    (active
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground sm:gap-3">
            <FxBadge />
            <span className="hidden items-center gap-1.5 lg:flex">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span>하루 4회 갱신</span>
            </span>
            <PlainModeToggle />
            <AlertCenter />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Page content — extra bottom padding on mobile for bottom nav */}
      <main className="mx-auto max-w-[1400px] px-4 py-5 pb-24 sm:px-6 sm:py-6 md:pb-6">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className={`mx-auto grid max-w-[1400px] ${visibleNav.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {visibleNav.map((n) => {
            const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
            const Icon = n.icon;
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  className={
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors " +
                    (active
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span>{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function FxBadge() {
  const { data } = useQuery({
    queryKey: ["fx-rate"],
    queryFn: () => getFxRate(),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });
  if (!data?.rate) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium tabular-nums"
      title="USD/KRW · 미국주 평가에 적용"
    >
      <span className="hidden text-muted-foreground sm:inline">USD/KRW</span>
      <span className="text-muted-foreground sm:hidden">$</span>
      <span className="text-foreground">₩{Math.round(data.rate).toLocaleString()}</span>
    </span>
  );
}
