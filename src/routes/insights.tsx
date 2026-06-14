import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, TrendingUp, Database, BarChart3, Loader2, Play, Trophy, Wallet } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { SignalCard } from "@/components/kb/SignalCard";
import { TermTooltip } from "@/components/kb/TermTooltip";
import { getLatestSignalPerTicker, listSignals } from "@/lib/signals.functions";
import { listFacts } from "@/lib/kb.functions";
import {
  getBestScenarioCurve,
  getLatestScenarioRunInfo,
  getScenarioRunInfo,
  getScenarios,
  runScenarios,
} from "@/lib/scenarios.functions";
import { mddInKrw, usePlainMode } from "@/lib/plain-mode";
import { Slider } from "@/components/ui/slider";
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
import { useEffect, useState } from "react";

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
const USE_LOCAL_MOCK = import.meta.env.DEV && import.meta.env.VITE_BRIGHTDESK_MOCK_DASHBOARD !== "false";
const MOCK_SIGNALS = [
  {
    id: "mock-signal-smh",
    ticker: "SMH",
    kind: "BUY",
    score: 2.6,
    technical_score: 0.8,
    fundamental_score: 0.7,
    kb_score: 1.1,
    confidence: 0.78,
    reasons: ["데이터센터 투자와 HBM 수요가 강하게 연결", "반도체 ETF가 개별 종목보다 분산 효과 제공"],
    rsi14: 58,
    macd_hist: 0.42,
    fact_ids: [],
  },
  {
    id: "mock-signal-qqq",
    ticker: "QQQ",
    kind: "HOLD",
    score: 1.4,
    technical_score: 0.5,
    fundamental_score: 0.4,
    kb_score: 0.5,
    confidence: 0.66,
    reasons: ["성장주 주도력은 유지", "밸류에이션 부담으로 신규 비중 확대는 신중"],
    rsi14: 63,
    macd_hist: 0.18,
    fact_ids: [],
  },
  {
    id: "mock-signal-tlt",
    ticker: "TLT",
    kind: "HOLD",
    score: 0.7,
    technical_score: 0.1,
    fundamental_score: 0.2,
    kb_score: 0.4,
    confidence: 0.55,
    reasons: ["금리 인하 기대는 있으나 CPI/FOMC 확인 필요"],
    rsi14: 47,
    macd_hist: -0.06,
    fact_ids: [],
  },
];
const MOCK_FACTS = [
  {
    id: "mock-fact-ai",
    title: "데이터센터 투자가 반도체 체인 실적 기대를 지지",
    summary: "데이터센터 capex, HBM, GPU 공급망 수요가 SMH, SOXX, NVDA, AVGO에 우호적으로 작용합니다.",
    updated_at: new Date().toISOString(),
    reliability: 0.82,
    sentiment: 0.42,
    related_tickers: ["SMH", "SOXX", "NVDA", "AVGO"],
  },
  {
    id: "mock-fact-fomc",
    title: "FOMC 이후 금리 인하 기대는 유지되지만 속도는 완만",
    summary: "장기채와 성장주는 물가 지표 확인이 필요하며, TLT는 관찰 후보로 분류됩니다.",
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    reliability: 0.76,
    sentiment: 0.16,
    related_tickers: ["TLT", "IEF", "QQQ"],
  },
  {
    id: "mock-fact-risk",
    title: "중동 리스크와 유가 변수는 에너지와 금에 단기 모멘텀 제공",
    summary: "XLE, GLD는 헤지 후보지만 전체 위험자산에는 변동성 요인입니다.",
    updated_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    reliability: 0.71,
    sentiment: -0.04,
    related_tickers: ["XLE", "GLD"],
  },
];
const MOCK_SCENARIOS = [
  {
    id: "mock-scenario-1",
    name: "Balanced Momentum",
    params: { rsiBuy: 45, rsiSell: 72, allocPctPerTrade: 0.12, stopLossPct: 0.08, takeProfitPct: 0.18 },
    total_return: 0.142,
    sharpe: 1.36,
    mdd: 0.083,
    score: 1.84,
  },
  {
    id: "mock-scenario-2",
    name: "Theme Rotation",
    params: { rsiBuy: 50, rsiSell: 75, allocPctPerTrade: 0.16, stopLossPct: 0.1, takeProfitPct: 0.22 },
    total_return: 0.118,
    sharpe: 1.12,
    mdd: 0.116,
    score: 1.42,
  },
];
const MOCK_CURVE = Array.from({ length: 18 }).map((_, index) => {
  const equity = 10_000_000 * (1 + index * 0.008 + Math.sin(index / 2) * 0.012);
  const benchmark = 10_000_000 * (1 + index * 0.004 + Math.sin(index / 3) * 0.009);
  return {
    date: new Date(Date.now() - (17 - index) * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    equity,
    benchmark,
  };
});
const MOCK_CURVE_DATA = { best: MOCK_SCENARIOS[0], curve: MOCK_CURVE };

function InsightsPage() {
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("signals");

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">인사이트</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          시그널, 백테스트, KB 근거를 한곳에서 확인합니다.
        </p>
      </div>

      <div className="mb-4 -mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition-colors " +
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
    queryFn: async () => (USE_LOCAL_MOCK ? MOCK_SIGNALS : getLatestSignalPerTicker()),
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
    queryFn: async () => (USE_LOCAL_MOCK ? MOCK_FACTS : listFacts({ data: { limit: 50 } })),
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
  const { plain } = usePlainMode();
  const [invest, setInvest] = useState(1_000_000);
  const [runId, setRunId] = useState<string | null>(null);
  const [lastHandledRunId, setLastHandledRunId] = useState<string | null>(null);
  const { data: scenarios, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => (USE_LOCAL_MOCK ? MOCK_SCENARIOS : getScenarios()),
  });
  const { data: curveData, isLoading: curveLoading } = useQuery({
    queryKey: ["best-scenario-curve"],
    queryFn: async () => (USE_LOCAL_MOCK ? MOCK_CURVE_DATA : getBestScenarioCurve()),
  });
  const { data: scenarioRun } = useQuery({
    queryKey: ["scenario-run", runId],
    queryFn: () =>
      USE_LOCAL_MOCK
        ? { run_id: runId ?? "mock-run", status: "success", completed_scenarios: 10, total_scenarios: 10 }
        : runId
          ? getScenarioRunInfo({ data: { runId } })
          : getLatestScenarioRunInfo(),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const latest = query.state.data as any;
      return latest?.status === "running" ? 2_000 : false;
    },
  });
  const run = useMutation({
    mutationFn: async () => (USE_LOCAL_MOCK ? { runId: "mock-run" } : runScenarios()),
    onSuccess: (result) => {
      setRunId(result.runId);
      setLastHandledRunId(null);
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      qc.invalidateQueries({ queryKey: ["best-scenario-curve"] });
    },
  });

  useEffect(() => {
    if (!scenarioRun?.run_id || !lastHandledRunId) return;
    if (scenarioRun.status !== "running" && scenarioRun.run_id === lastHandledRunId) {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      qc.invalidateQueries({ queryKey: ["best-scenario-curve"] });
      setLastHandledRunId(null);
    }
  }, [scenarioRun?.status, scenarioRun?.run_id, qc, lastHandledRunId]);

  useEffect(() => {
    if (!runId) return;
    setLastHandledRunId(runId);
  }, [runId]);

  const canRun = !run.isPending && scenarioRun?.status !== "running";
  const runStatusText = scenarioRun
    ? scenarioRun.status === "running"
      ? `백테스트 실행 중 · ${scenarioRun.completed_scenarios}/${scenarioRun.total_scenarios}`
      : scenarioRun.status === "success"
        ? `마지막 실행 완료`
        : "마지막 실행 실패"
    : "아직 실행 이력이 없습니다.";

  const rows = (scenarios ?? []) as any[];
  const best = curveData?.best as any;
  const curve = (curveData?.curve ?? []) as any[];
  const initial = curve[0]?.equity ?? 10_000_000;
  const final = curve[curve.length - 1]?.equity ?? initial;
  const portfolioRet = ((final / initial - 1) * 100).toFixed(2);
  const benchFinal = [...curve].reverse().find((c) => c.benchmark != null)?.benchmark;
  const benchRet = benchFinal ? ((benchFinal / initial - 1) * 100).toFixed(2) : null;
  const alpha = benchRet ? (Number(portfolioRet) - Number(benchRet)).toFixed(2) : null;

  // KRW 시뮬레이션
  const retPct = Number(portfolioRet) / 100;
  const finalKrw = Math.round(invest * (1 + retPct));
  const gainKrw = finalKrw - invest;
  const mddVal = best ? Number(best.mdd) : 0;
  const { worst, loss } = mddInKrw(invest, mddVal);
  const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <p className="text-xs text-muted-foreground">
          과거 가격으로 전략 성과와 벤치마크를 비교합니다.
        </p>
        <button
          onClick={() => run.mutate()}
          disabled={!canRun}
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

      <div className="rounded-xl border bg-card/80 p-2 text-[11px] text-muted-foreground">{runStatusText}</div>

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
                  label={plain ? "초과수익" : "알파"}
                  value={`${Number(alpha) >= 0 ? "+" : ""}${alpha}%p`}
                  tone={Number(alpha) >= 0 ? "pos" : "neg"}
                />
              )}
              {!plain && <Metric label="Sharpe" value={Number(best.sharpe).toFixed(2)} />}
              <Metric label={plain ? "최악 낙폭" : "MDD"} value={`-${(Number(best.mdd) * 100).toFixed(1)}%`} tone="neg" />
            </div>
          </div>

          {/* KRW 시뮬레이터 */}
          <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Wallet className="h-3.5 w-3.5 text-primary" />
                {plain ? "내가 1년 전 투자했다면?" : "투자금 시뮬레이터"}
              </div>
              <div className="text-sm font-semibold tabular-nums text-primary">
                {fmt(invest)}원
              </div>
            </div>
            <Slider
              value={[invest]}
              min={100_000}
              max={50_000_000}
              step={100_000}
              onValueChange={(v) => setInvest(v[0])}
              className="my-2"
              aria-label="투자 금액"
            />
            <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
              <div className="rounded-md bg-card/60 p-2">
                <div className="text-muted-foreground">{plain ? "지금 평가액" : "최종 자산"}</div>
                <div className="text-sm font-semibold tabular-nums" style={{ color: gainKrw >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {fmt(finalKrw)}원
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {gainKrw >= 0 ? "+" : ""}{fmt(gainKrw)}원
                </div>
              </div>
              <div className="rounded-md bg-card/60 p-2">
                <div className="text-muted-foreground">
                  {plain ? "최악일 땐 (낙폭)" : "MDD 적용 잔액"}
                </div>
                <div className="text-sm font-semibold tabular-nums text-danger">{fmt(worst)}원</div>
                <div className="text-[10px] text-muted-foreground">-{fmt(loss)}원 손실 감수</div>
              </div>
              <div className="rounded-md bg-card/60 p-2">
                <div className="text-muted-foreground">{plain ? "KOSPI에 똑같이" : "벤치마크 비교"}</div>
                <div className="text-sm font-semibold tabular-nums">
                  {benchRet ? `${fmt(Math.round(invest * (1 + Number(benchRet) / 100)))}원` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {alpha ? `차이 ${Number(alpha) >= 0 ? "+" : ""}${fmt(Math.round(invest * Number(alpha) / 100))}원` : ""}
                </div>
              </div>
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
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
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        과거 성과는 미래를 보장하지 않습니다. 수수료·세금·다음 거래일 시가 체결을 가정합니다.
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
