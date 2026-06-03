import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Database, FileText, LineChart } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "대시보드", icon: Activity },
  { to: "/facts", label: "KB Facts", icon: Database },
  { to: "/documents", label: "원본 문서", icon: FileText },
  { to: "/tickers", label: "종목별 뷰", icon: LineChart },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-6">
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-md"
              style={{
                background:
                  "linear-gradient(135deg, var(--primary), var(--domain-theme))",
              }}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">KB Monitor</span>
              <span className="text-[10px] text-muted-foreground">
                Economic Knowledge Base
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map((n) => {
              const active = path === n.to || (n.to !== "/" && path.startsWith(n.to));
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
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
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            <span>읽기 전용 · 큐레이션 모드</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
    </div>
  );
}
