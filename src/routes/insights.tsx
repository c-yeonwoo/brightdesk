import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, TrendingUp, Database, BarChart3, Loader2, Play, Trophy } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { SignalCard } from "@/components/kb/SignalCard";
import { getLatestSignalPerTicker, listSignals } from "@/lib/signals.functions";
import { listFacts } from "@/lib/kb.functions";
import { getBestScenarioCurve, getScenarios, runScenarios } from "@/lib/scenarios.functions";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  { id: "backtest", label: "백테스트", icon: BarChart3 },
  { id: "facts", label: "KB Facts", icon: Database },
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
      {tab === "backtest" && <BacktestTab />}
      {tab === "facts" && <FactsTab />}
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

function BacktestTab() {
  const qc = useQueryClient();
  const { data: scenarios, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => getScenarios(),
  });
  const { data: curveData, isLoading: curveLoading } = useQuery({
    queryKey: ["best-scenario-curve"],
    queryFn: () => getBestScenarioCurve(),
  });
  const run = useMutation({
    mutationFn: () => runScenarios(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      qc.invalidateQueries({ queryKey: ["best-scenario-curve"] });
    },
  });

  const rows = (scenarios ?? []) as any[];
  const best = curveData?.best as any;
  const curve = (curveData?.curve ?? []) as any[];
  const initial = curve[0]?.equity ?? 10_000_000;
  const final = curve[curve.length - 1]?.equity ?? initial;
  const portfolioRet = ((final / initial - 1) * 100).toFixed(2);
  const benchFinal = [...curve].reverse().find((c) => c.benchmark != null)?.benchmark;
  const benchRet = benchFinal ? ((benchFinal / initial - 1) * 100).toFixed(2) : null;
  const alpha = benchRet ? (Number(portfolioRet) - Number(benchRet)).toFixed(2) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <p className="text-xs text-muted-foreground">
          과거 6개월 가격으로 10개 파라미터 조합을 시뮬레이션 → 최적 시나리오의 자산곡선과 벤치마크 비교.
        </p>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {run.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          시뮬레이션 재실행
        </button>
      </div>

      {best && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-amber-500" />
              최적 전략: <span className="text-primary">{best.name}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <Metric label="누적수익" value={`${portfolioRet}%`} tone={Number(portfolioRet) >= 0 ? "pos" : "neg"} />
              {benchRet && <Metric label="벤치마크" value={`${benchRet}%`} muted />}
              {alpha && (
                <Metric
                  label="알파"
                  value={`${Number(alpha) >= 0 ? "+" : ""}${alpha}%p`}
                  tone={Number(alpha) >= 0 ? "pos" : "neg"}
                />
              )}
              <Metric label="Sharpe" value={Number(best.sharpe).toFixed(2)} />
              <Metric label="MDD" value={`-${(Number(best.mdd) * 100).toFixed(1)}%`} tone="neg" />
            </div>
          </div>

          <div className="h-[280px]">
            {curveLoading ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                시뮬레이션 중…
              </div>
            ) : curve.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                데이터 없음 — 시뮬레이션을 실행하세요.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve}>
                  <defs>
                    <linearGradient id="bt-eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickFormatter={(d) => String(d).slice(5)}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                    }}
                    formatter={(v: any) => Math.round(Number(v)).toLocaleString("ko-KR") + "원"}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#bt-eq)"
                    name="전략 자산"
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    name="KOSPI 벤치마크"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          전체 시나리오 ({rows.length}) · Score 순
        </div>
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">시나리오</th>
              <th className="px-3 py-2 text-left">파라미터</th>
              <th className="px-3 py-2 text-right">수익</th>
              <th className="px-3 py-2 text-right">Sharpe</th>
              <th className="px-3 py-2 text-right">MDD</th>
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  아직 결과가 없습니다. "시뮬레이션 재실행"을 눌러주세요.
                </td>
              </tr>
            )}
            {rows.map((s: any, i: number) => {
              const p = s.params as any;
              const ret = Number(s.total_return);
              return (
                <tr key={s.id} className={"border-t " + (i === 0 ? "bg-amber-500/5" : "")}>
                  <td className="px-3 py-2 font-medium">
                    {i === 0 && <span className="mr-1">🏆</span>}
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    RSI {p.rsiBuy}/{p.rsiSell} · 배분 {(p.allocPctPerTrade * 100).toFixed(0)}% · SL{" "}
                    {(p.stopLossPct * 100).toFixed(0)}% · TP {(p.takeProfitPct * 100).toFixed(0)}%
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono tabular-nums"
                    style={{ color: ret >= 0 ? "var(--success)" : "var(--danger)" }}
                  >
                    {(ret * 100).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {Number(s.sharpe).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-danger">
                    -{(Number(s.mdd) * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                    {Number(s.score).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        ⚠️ 과거 성과는 미래를 보장하지 않습니다. 백테스트는 수수료(0.18%) · 세금(0.015%) 가정,
        체결가는 다음 거래일 시가 · 진입조건은 RSI + MA 추세필터.
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  muted?: boolean;
}) {
  const color =
    tone === "pos" ? "var(--success)" : tone === "neg" ? "var(--danger)" : "var(--foreground)";
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span
        className="font-mono tabular-nums font-semibold"
        style={{ color: muted ? "var(--muted-foreground)" : color }}
      >
        {value}
      </span>
    </div>
  );
}
