import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Briefcase,
  Database,
  FileText,
  FlaskConical,
  LineChart,
  Target,
  Workflow,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof Activity };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "분석",
    items: [
      { to: "/", label: "대시보드", icon: Activity },
      { to: "/actions", label: "오늘의 액션", icon: Target },
      { to: "/signals", label: "시그널", icon: Zap },
      { to: "/portfolio", label: "포트폴리오", icon: Briefcase },
      { to: "/scenarios", label: "시나리오", icon: FlaskConical },
      { to: "/tickers", label: "종목", icon: LineChart },
    ],
  },
  {
    label: "지식베이스",
    items: [
      { to: "/facts", label: "Facts", icon: Database },
      { to: "/documents", label: "원본", icon: FileText },
    ],
  },
  {
    label: "운영",
    items: [{ to: "/pipeline", label: "파이프라인", icon: Workflow }],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
          <Link to="/" className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-md"
              style={{
                background:
                  "linear-gradient(135deg, var(--primary), var(--domain-theme))",
              }}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">BrightDesk</span>
              <span className="text-[10px] text-muted-foreground">
                Insight Desk · Signal · Portfolio
              </span>
            </div>
          </Link>

          <nav className="ml-2 flex items-center gap-3">
            {navGroups.map((g, gi) => (
              <div key={g.label} className="flex items-center gap-1">
                {gi > 0 && <span className="mx-1 h-4 w-px bg-border" />}
                <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:inline">
                  {g.label}
                </span>
                {g.items.map((n) => {
                  const active =
                    path === n.to || (n.to !== "/" && path.startsWith(n.to));
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      className={
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors " +
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
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            <span>모의 운용 모드</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
    </div>
  );
}
