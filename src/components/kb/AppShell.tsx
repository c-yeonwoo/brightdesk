import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Briefcase, Database, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { AlertCenter } from "./AlertCenter";

const nav = [
  { to: "/", label: "대시보드", icon: Activity, desc: "BrightDesk Live" },
  { to: "/my-portfolio", label: "내 포트폴리오", icon: Briefcase, desc: "AI 재구성 추천" },
  { to: "/insights", label: "인사이트", icon: Sparkles, desc: "분석 · 시그널 · 시나리오" },
  { to: "/data", label: "데이터", icon: Database, desc: "수집 · 원본" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-md"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--domain-theme))" }}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">BrightDesk</span>
              <span className="text-[10px] text-muted-foreground">Live AI Trading Desk · 1,000만원 실증</span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {nav.map((n) => {
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

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span>Live · 1h 자동 갱신</span>
            </span>
            <AlertCenter />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
    </div>
  );
}
