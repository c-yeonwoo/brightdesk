import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, Database, BarChart3 } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { SignalCard } from "@/components/kb/SignalCard";
import { getLatestSignalPerTicker, listSignals } from "@/lib/signals.functions";
import { listFacts } from "@/lib/kb.functions";
import { useState } from "react";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "인사이트 · BrightDesk" },
      { name: "description", content: "KB 분석, 시그널, 시나리오를 종합한 인사이트 허브" },
    ],
  }),
  component: InsightsPage,
});

const TABS = [
  { id: "signals", label: "시그널", icon: TrendingUp },
  { id: "facts", label: "KB Facts", icon: Database },
  { id: "scenarios", label: "시나리오", icon: BarChart3 },
] as const;

function InsightsPage() {
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("signals");

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">인사이트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          모든 분석 결과는 <strong>기술 · 기본 · KB</strong> 3-팩터 점수 + 과거 승률을 근거로 산출됩니다.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors " +
                (active
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "signals" && <SignalsTab />}
      {tab === "facts" && <FactsTab />}
      {tab === "scenarios" && <ScenariosTab />}
    </AppShell>
  );
}

function SignalsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["latest-signals-by-ticker"],
    queryFn: () => getLatestSignalPerTicker(),
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">불러오는 중…</div>;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        시그널이 아직 없습니다. <Link to="/data" className="underline">데이터 페이지</Link>에서 시그널을 생성하세요.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((s) => (
        <SignalCard
          key={s.id}
          ticker={s.ticker}
          kind={s.kind}
          totalScore={Number(s.score)}
          technicalScore={s.technical_score != null ? Number(s.technical_score) : null}
          fundamentalScore={s.fundamental_score != null ? Number(s.fundamental_score) : null}
          kbScore={s.kb_score != null ? Number(s.kb_score) : null}
          confidence={s.confidence != null ? Number(s.confidence) : null}
          reasons={s.reasons ?? []}
          rsi14={s.rsi14 != null ? Number(s.rsi14) : null}
          macdHist={s.macd_hist != null ? Number(s.macd_hist) : null}
          factIds={s.fact_ids ?? []}
        />
      ))}
    </div>
  );
}

function FactsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["facts-insights"],
    queryFn: () => listFacts({ data: { limit: 50 } }),
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">불러오는 중…</div>;
  const rows = (data ?? []) as any[];
  return (
    <div className="space-y-2">
      {rows.map((f) => (
        <div key={f.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">{f.title}</h3>
            <span className="text-[10px] text-muted-foreground">
              {new Date(f.updated_at).toLocaleDateString()}
            </span>
          </div>
          {f.summary && <p className="mt-1 text-xs text-muted-foreground">{f.summary}</p>}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>신뢰도 {f.reliability != null ? Number(f.reliability).toFixed(2) : "—"}</span>
            <span>감성 {f.sentiment != null ? Number(f.sentiment).toFixed(2) : "—"}</span>
            {f.related_tickers && f.related_tickers.length > 0 && (
              <span>· {f.related_tickers.slice(0, 5).join(", ")}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScenariosTab() {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      시나리오 백테스트는 <Link to="/scenarios" className="underline">기존 시나리오 페이지</Link>를 참고하세요.<br />
      (인사이트 탭으로 통합 예정)
    </div>
  );
}
