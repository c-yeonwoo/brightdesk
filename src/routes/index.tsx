import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Briefcase, Sparkles, Activity, TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { TradeLedger } from "@/components/kb/TradeLedger";
import { RegimeBadge } from "@/components/kb/RegimeBadge";
import { TodaysActions } from "@/components/kb/TodaysActions";
import { getLiveDashboard } from "@/lib/dashboard.functions";
import { Line } from "recharts";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BrightDesk · Live AI Trading Desk" },
      { name: "description", content: "1,000만원 자체 운용 + KB 인사이트 기반 AI 포트폴리오 재구성" },
    ],
  }),
  component: DashboardPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        대시보드 로딩 실패: {error.message}
      </div>
    </AppShell>
  ),
});

function fmtKrw(n: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n);
}

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["live-dashboard"],
    queryFn: () => getLiveDashboard(),
    refetchInterval: 60_000,
  });

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">BrightDesk Live</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              자체 운용 1,000만원
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            1시간마다 KB·기술·기본 분석을 종합해 자동 리밸런싱하는 실시간 트레이딩 데스크.
          </p>
        </div>
        <Link
          to="/my-portfolio"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm hover:opacity-90 sm:h-9"
        >
          <Briefcase className="h-3.5 w-3.5" />
          내 포트폴리오 분석
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[0,1,2,3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />)}
        </div>
      ) : <DashboardContent data={data} />}
    </AppShell>
  );
}

function DashboardContent({ data }: { data: any }) {
  const s = data.summary;
  const weekly = data.weekly_summary ?? {};
  const pnlPositive = s.pnl >= 0;
  const weeklyReturnPct = weekly.return_pct != null ? Number(weekly.return_pct) : null;
  const weeklyReturnAmt = weekly.return_amount != null ? Number(weekly.return_amount) : null;
  const weeklySignalCount = Number(weekly.signal_count ?? 0);
  const weeklyQualityHitRate = weekly.outcomes?.hit_rate != null ? Number(weekly.outcomes.hit_rate) : null;
  const weeklySignalConfidence = weekly.avg_confidence != null ? Number(weekly.avg_confidence) : null;

  return (
    <>
      <section className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">최근 7일 요약</h2>
          <span className="text-[11px] text-muted-foreground">
            {weekly.period_start ? new Date(weekly.period_start).toLocaleDateString() : "최근 7일"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">성과(7일)</div>
            <div className="mt-1 text-base font-semibold tabular-nums" style={{ color: (weeklyReturnPct ?? 0) >= 0 ? "var(--success)" : "var(--danger)" }}>
              {weeklyReturnPct == null ? "—" : `${weeklyReturnPct >= 0 ? "+" : ""}${weeklyReturnPct.toFixed(2)}%`}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {weeklyReturnAmt == null ? "수익 금액 대기중" : `₩${fmtKrw(Math.round(weeklyReturnAmt))}`}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">추천 품질</div>
            <div className="mt-1 text-base font-semibold tabular-nums">
              {weeklyQualityHitRate == null ? "—" : `${Math.round(weeklyQualityHitRate * 100)}%`}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {weeklySignalCount}건 중 평균 신뢰도{" "}
              {weeklySignalConfidence == null ? "—" : `${Math.round(weeklySignalConfidence * 100)}%`}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">운영 안정성(7일)</div>
            <div className="mt-1 text-base font-semibold tabular-nums">{data.txns_7d_count}건</div>
            <div className="text-[11px] text-muted-foreground">
              포트폴리오 거래 7일치 반영
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="총자산"
          value={`${fmtKrw(s.total)}원`}
          hint={`초기 ${fmtKrw(Number(data.portfolio.initial_cash))}원`}
          icon={Activity}
        />
        <KpiCard
          label="누적 수익"
          value={`${pnlPositive ? "+" : ""}${fmtKrw(s.pnl)}원`}
          hint={`${pnlPositive ? "+" : ""}${s.pnl_pct.toFixed(2)}%`}
          icon={pnlPositive ? TrendingUp : TrendingDown}
          tone={pnlPositive ? "success" : "danger"}
        />
        <KpiCard
          label="BUY 승률"
          value={
            data.winrate.buy.winrate != null
              ? `${(data.winrate.buy.winrate * 100).toFixed(1)}%`
              : "—"
          }
          hint={`표본 ${data.winrate.buy.n}건 · 5d 평균 ${
            data.winrate.buy.avg_ret_5d != null
              ? `${(data.winrate.buy.avg_ret_5d * 100).toFixed(2)}%`
              : "—"
          }`}
          icon={Target}
          tone={
            data.winrate.buy.winrate != null && data.winrate.buy.winrate >= 0.5 ? "success" : "default"
          }
        />
        <KpiCard
          label="SELL 승률"
          value={
            data.winrate.sell.winrate != null
              ? `${(data.winrate.sell.winrate * 100).toFixed(1)}%`
              : "—"
          }
          hint={`표본 ${data.winrate.sell.n}건 · 회피 적중`}
          icon={Target}
        />
        <KpiCard
          label="보유 / 7d 거래"
          value={`${data.positions.length}종`}
          hint={`최근 7일 ${data.txns_7d_count}건 체결`}
          icon={Briefcase}
        />
      </div>

      {/* 오늘의 액션 */}
      <TodaysActions exitAlerts={data.exit_alerts ?? []} recentSignals={data.recent_signals ?? []} />

      {/* Curve + Regime + Activity */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">자산 곡선 vs 벤치마크</h2>
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} /> 포트폴리오</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--muted-foreground)" }} /> {data.regime?.ticker ?? "^KS11"}</span>
            </span>
          </div>
          <div className="h-64">
            {data.curve.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                스냅샷이 아직 없습니다. 1시간 cron이 첫 실행되면 데이터가 누적됩니다.
              </div>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={data.curve}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis
                    tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => `${fmtKrw(v)}원`}
                  />
                  <Area type="monotone" dataKey="total_value" stroke="var(--primary)" fill="url(#totalGrad)" strokeWidth={2} name="포트폴리오" />
                  <Line type="monotone" dataKey="benchmark_value" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="벤치마크" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {data.regime && <RegimeBadge {...data.regime} />}

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">24h 활동</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">시그널</div>
                <div className="text-base font-semibold tabular-nums">{data.recent_signals.length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">매수</div>
                <div className="text-base font-semibold tabular-nums" style={{ color: "var(--success)" }}>
                  {data.trade_ledger.filter((t: any) => t.side === "BUY" && t.executed_at >= new Date(Date.now() - 86400000).toISOString()).length}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">매도</div>
                <div className="text-base font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
                  {data.trade_ledger.filter((t: any) => t.side === "SELL" && t.executed_at >= new Date(Date.now() - 86400000).toISOString()).length}
                </div>
              </div>
            </div>
          </div>

          {data.exit_alerts && data.exit_alerts.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                손절/익절 트리거 ({data.exit_alerts.length})
              </h2>
              <ul className="space-y-1.5">
                {data.exit_alerts.slice(0, 4).map((e: any) => (
                  <li key={e.ticker} className="flex items-start justify-between gap-2 text-[11px]">
                    <div>
                      <span className="font-medium">{e.ticker}</span>
                      <span className="ml-1.5 rounded bg-warning/15 px-1 py-0.5 text-[9px] font-medium text-warning">
                        {e.reason}
                      </span>
                      <div className="text-[10px] text-muted-foreground">{e.message}</div>
                    </div>
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ color: e.pl_pct >= 0 ? "var(--success)" : "var(--danger)" }}
                    >
                      {e.pl_pct >= 0 ? "+" : ""}{e.pl_pct.toFixed(2)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>


      {/* 거래 원장 (근거 첨부) */}
      <div className="mt-6">
        <TradeLedger trades={data.trade_ledger.slice(0, 12)} />
      </div>



      {/* Positions + KB highlights */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">현재 보유 ({data.positions.length})</h2>
          {data.positions.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">아직 보유 종목 없음</div>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[320px] text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-1 text-left">종목</th><th className="px-1 text-right">수량</th><th className="px-1 text-right">평가</th><th className="px-1 text-right">손익</th></tr>
                </thead>
                <tbody>
                  {data.positions.map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-1 py-2 font-medium">{p.ticker}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{Number(p.qty)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{fmtKrw(p.market_value)}</td>
                      <td
                        className="px-1 py-2 text-right tabular-nums"
                        style={{ color: (p.pl ?? 0) >= 0 ? "var(--success)" : "var(--danger)" }}
                      >
                        {p.pl_pct != null ? `${p.pl_pct >= 0 ? "+" : ""}${p.pl_pct.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            KB 최신 인사이트
          </h2>
          <ul className="space-y-2">
            {data.recent_facts.slice(0, 6).map((f: any) => {
              const senti = f.sentiment != null ? Number(f.sentiment) : null;
              const color = senti == null ? "var(--muted-foreground)" : senti > 0.1 ? "var(--success)" : senti < -0.1 ? "var(--danger)" : "var(--muted-foreground)";
              return (
                <li key={f.id} className="border-t pt-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{f.title}</span>
                    {senti != null && (
                      <span className="shrink-0 tabular-nums" style={{ color }}>
                        {senti >= 0 ? "+" : ""}{senti.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {f.related_tickers && f.related_tickers.length > 0 && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {f.related_tickers.slice(0, 5).join(" · ")}
                    </div>
                  )}
                </li>
              );
            })}
            {data.recent_facts.length === 0 && (
              <li className="text-center text-muted-foreground">최신 인사이트 없음</li>
            )}
          </ul>
          <Link to="/insights" className="mt-3 inline-block text-xs text-primary hover:underline">
            전체 인사이트 보기 →
          </Link>
        </div>
      </div>
    </>
  );
}

function KpiCard({ label, value, hint, icon: Icon, tone = "default" }: any) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--primary)";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
