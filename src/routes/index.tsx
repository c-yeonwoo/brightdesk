import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock3,
  Compass,
  Database,
  Layers3,
  LineChart,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { TradeLedger } from "@/components/kb/TradeLedger";
import { getLiveDashboard } from "@/lib/dashboard.functions";
import { getMarketDesk, listMarketDeskHistory } from "@/lib/market.functions";
import { usePlainMode } from "@/lib/plain-mode";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BrightDesk · Market Pulse" },
      {
        name: "description",
        content:
          "시장 흐름을 읽고 섹터·종목·ETF 추천과 포트폴리오 반영 방향을 제안하는 AI 투자 데스크.",
      },
    ],
  }),
  component: MarketPulsePage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        시장 브리프 로딩 실패: {error.message}
      </div>
    </AppShell>
  ),
});

const regimeTone = {
  RISK_ON: "border-success/30 bg-success/10 text-success",
  NEUTRAL: "border-info/30 bg-info/10 text-info",
  RISK_OFF: "border-danger/30 bg-danger/10 text-danger",
} as const;

const trendIcon = {
  UP: TrendingUp,
  SIDEWAYS: LineChart,
  DOWN: TrendingDown,
} as const;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function signed(n: number) {
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function krw(n: number) {
  if (!Number.isFinite(n)) return "대기";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function MarketPulsePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["market-desk"],
    queryFn: () => getMarketDesk(),
    refetchInterval: 10 * 60 * 1000,
  });
  const { data: history } = useQuery({
    queryKey: ["market-desk-history"],
    queryFn: () => listMarketDeskHistory(),
    refetchInterval: 10 * 60 * 1000,
  });
  const { data: liveDashboard } = useQuery({
    queryKey: ["live-dashboard"],
    queryFn: () => getLiveDashboard(),
    refetchInterval: 10 * 60 * 1000,
  });

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {data?.generated_at ? new Date(data.generated_at).toLocaleString("ko-KR") : "Market Pulse"}
            {data?.is_mock && (
              <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">샘플</span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            오늘의 투자 판단판
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            시장 국면, 돈이 몰리는 섹터, 실증 포트폴리오 액션을 한 화면에서 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/my-portfolio"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Briefcase className="h-4 w-4" />
            포트폴리오
          </Link>
          <Link
            to="/pipeline"
            className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted"
          >
            <Database className="h-4 w-4" />
            데이터 상태
          </Link>
        </div>
      </div>

      {isLoading || !data ? (
        <Skeleton />
      ) : (
        <MarketPulseContent
          data={data as any}
          history={(history ?? []) as any[]}
          liveDashboard={liveDashboard as any}
        />
      )}
    </AppShell>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4">
      <div className="h-56 animate-pulse rounded-lg border bg-card" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    </div>
  );
}

function MarketPulseContent({ data, history, liveDashboard }: { data: any; history: any[]; liveDashboard?: any }) {
  const { plain } = usePlainMode();
  const Trend = trendIcon[data.brief.trend as keyof typeof trendIcon] ?? LineChart;
  const healthLow = data.health.facts < 3;
  const confidence = Number(data.market_read?.confidence ?? 0.35);

  if (plain) {
    return <EasyMarketPulseContent data={data} history={history} liveDashboard={liveDashboard} />;
  }

  return (
    <div className="space-y-6">
      <DeskCommandCenter data={data} liveDashboard={liveDashboard} />

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_30%)]" />
          <div className="relative p-5 sm:p-7">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  regimeTone[data.brief.regime as keyof typeof regimeTone]
                }`}
              >
                {data.brief.regime_label}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/80 px-2.5 py-1 text-xs font-medium">
                <Trend className="h-3.5 w-3.5" />
                {data.brief.trend_label}
              </span>
              <span className="rounded-md border bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
                market score {signed(Number(data.brief.score))}
              </span>
            </div>

            <div className="max-w-4xl">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                {data.market_read?.posture ?? "시장 판단 대기"} · {data.market_read?.action_bias ?? "근거 수집 중"}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{data.brief.headline}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{data.brief.summary}</p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <DecisionMetric
                icon={Target}
                label="판단 확신도"
                value={pct(confidence)}
                helper={`데이터 깊이 ${data.market_read?.data_depth ?? "낮음"}`}
              />
              <DecisionMetric
                icon={TrendingUp}
                label="긍정 후보"
                value={`${data.market_read?.positive_candidates ?? 0}개`}
                helper="확대/유지/관심 후보"
              />
              <DecisionMetric
                icon={ShieldCheck}
                label="방어 체크"
                value={`${data.market_read?.defensive_candidates ?? 0}개`}
                helper="축소/회피 후보"
              />
            </div>
          </div>

          <div className="relative border-t bg-background/45 p-5 sm:p-7 lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4" />
                다음 액션
              </h2>
              <span className="rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground">상세</span>
            </div>
            <div className="space-y-2">
              {(data.next_actions ?? []).slice(0, 3).map((action: string, index: number) => (
                <div key={action} className="rounded-xl border bg-card/85 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                      {index + 1}
                    </span>
                    Priority {index + 1}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{action}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-semibold">
              <Layers3 className="h-3.5 w-3.5" />
              활성 테마
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(data.brief.active_themes ?? []).slice(0, 8).map((theme: string) => (
              <span key={theme} className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                {theme.replaceAll("_", " ")}
              </span>
            ))}
            {data.brief.active_themes.length === 0 && (
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                수집 데이터 연결 대기
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {(data.portfolio.allocation_guidance ?? []).map((item: any) => (
              <AllocationTile key={item.label} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" />
            데이터 상태
          </h2>
          <div className="mt-4 grid gap-3">
            <Metric label="최근 KB facts" value={data.health.facts} />
            <Metric label="최근 signals" value={data.health.signals} />
            <Metric label="추천 후보" value={data.health.opportunities} />
          </div>
          {healthLow && (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                데이터가 아직 얇습니다
              </div>
              자료를 더 넣으면 판단 근거가 선명해집니다.
            </div>
          )}
          {(data.risk_alerts ?? []).length > 0 && (
            <div className="mt-3 space-y-2">
              {data.risk_alerts.slice(0, 2).map((risk: string) => (
                <div key={risk} className="rounded-md border border-danger/20 bg-danger/5 p-3 text-xs leading-5 text-danger">
                  {risk}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PaperPortfolioCard data={data.paper_portfolio} expert />
      <PaperPortfolioDetail liveDashboard={liveDashboard} expert />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            추천 후보
          </h2>
          <Link to="/signals" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            전체 시그널
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.opportunities.map((item: any) => (
            <OpportunityCard key={item.symbol} item={item} />
          ))}
        </div>
      </section>

      <MarketHistoryPanel history={history} expert />

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="h-4 w-4" />
            포트폴리오 반영 방향
          </h2>
          <div className="mt-4 space-y-3">
            {data.portfolio.notes.map((note: string) => (
              <div key={note} className="rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground">
                {note}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(data.portfolio.owned_tickers ?? []).slice(0, 12).map((ticker: string) => (
              <span key={ticker} className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                {ticker}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Compass className="h-4 w-4" />
            오늘의 근거
          </h2>
          <div className="mt-4 divide-y">
            {data.sources.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                갱신 후 판단 근거가 표시됩니다.
              </div>
            ) : (
              data.sources.slice(0, 5).map((source: any) => (
                <div key={source.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {source.domain ?? "fact"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      신뢰도 {pct(Number(source.reliability ?? 0.5))}
                    </span>
                  </div>
                  <h3 className="mt-1 text-sm font-medium">{source.title}</h3>
                  {source.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.summary}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function EasyMarketPulseContent({ data, history, liveDashboard }: { data: any; history: any[]; liveDashboard?: any }) {
  const Trend = trendIcon[data.brief.trend as keyof typeof trendIcon] ?? LineChart;
  const topPick = (data.opportunities ?? [])[0];
  const secondPick = (data.opportunities ?? [])[1];
  const risk = (data.risk_alerts ?? [])[0];

  return (
    <div className="space-y-5">
      <DeskCommandCenter data={data} liveDashboard={liveDashboard} easy />

      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="relative p-5 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_90%_15%,rgba(251,191,36,0.16),transparent_30%)]" />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-semibold">
              <Trend className="h-4 w-4" />
              쉬운 요약
            </div>
            <h2 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
              지금은 <span className="text-primary">{data.market_read?.posture ?? data.brief.regime_label}</span>
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {data.market_read?.action_bias ?? data.brief.summary}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <EasyAnswer label="시장 분위기" value={data.brief.regime_label} helper={data.brief.trend_label} />
              <EasyAnswer label="확신 정도" value={pct(Number(data.market_read?.confidence ?? 0.35))} helper="근거와 함께 확인" />
              <EasyAnswer label="먼저 볼 후보" value={topPick?.symbol ?? "대기"} helper={topPick?.action_label ?? "대기"} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            오늘 볼 것
          </h2>
          <div className="space-y-3">
            {(data.next_actions ?? []).slice(0, 3).map((action: string, index: number) => (
              <div key={action} className="rounded-2xl border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {index + 1}
                  </span>
                  {index === 0 ? "가장 먼저" : index === 1 ? "그 다음" : "마지막으로"}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            우선 후보
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {topPick && <EasyOpportunityCard item={topPick} rank={1} />}
            {secondPick && <EasyOpportunityCard item={secondPick} rank={2} />}
          </div>
          <Link
            to="/signals"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            전체 후보 더 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PaperPortfolioCard data={data.paper_portfolio} />
      <PaperPortfolioDetail liveDashboard={liveDashboard} />

      <MarketHistoryPanel history={history} />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Briefcase className="h-4 w-4" />
            내 포트폴리오에는?
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(data.portfolio.allocation_guidance ?? []).map((item: any) => (
              <AllocationTile key={item.label} item={item} />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {(data.portfolio.notes ?? []).slice(0, 2).map((note: string) => (
              <p key={note} className="rounded-2xl border bg-background p-3 text-sm leading-6 text-muted-foreground">
                {note}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-warning" />
            조심할 점
          </h2>
          <p className="rounded-2xl border border-warning/25 bg-warning/10 p-4 text-sm leading-6 text-warning">
            {risk ?? "큰 리스크 신호는 아직 없지만, 신규 진입은 항상 분할로 접근하는 편이 안전합니다."}
          </p>
          <div className="mt-4 rounded-2xl border bg-background p-4">
            <div className="text-xs text-muted-foreground">데이터 상태</div>
            <div className="mt-1 text-lg font-semibold">
              facts {data.health.facts} · signals {data.health.signals}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeskCommandCenter({ data, liveDashboard, easy = false }: { data: any; liveDashboard?: any; easy?: boolean }) {
  const topPick = (data.opportunities ?? [])[0];
  const confidence = Number(data.market_read?.confidence ?? 0.35);
  const facts = Number(data.health?.facts ?? 0);
  const signals = Number(data.health?.signals ?? 0);
  const dataDepth = data.market_read?.data_depth ?? (facts + signals > 20 ? "보통" : "얇음");
  const paper = data.paper_portfolio ?? {};
  const weekly = liveDashboard?.weekly_summary ?? {};
  const returnPct = Number(paper.return_pct ?? 0);
  const hitRate = weekly.outcomes?.hit_rate;
  const signalPolicy = Array.isArray(liveDashboard?.trade_ledger)
    ? liveDashboard.trade_ledger.every((trade: any) => Boolean(trade.signal))
    : true;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--card)_92%,var(--primary)_8%),var(--card)_48%,color-mix(in_oklab,var(--card)_88%,var(--success)_12%))] shadow-sm">
      <div className="relative grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(15,23,42,0.08),transparent_30%),radial-gradient(circle_at_90%_15%,rgba(34,197,94,0.16),transparent_28%)]" />
        <div className="relative p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${regimeTone[data.brief.regime as keyof typeof regimeTone]}`}>
              {data.brief.regime_label}
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              {data.brief.trend_label}
            </span>
            <span className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              확신도 {pct(confidence)}
            </span>
          </div>

          <div className="max-w-4xl">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              BrightDesk Decision
            </div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              {easy ? data.market_read?.action_bias ?? data.brief.headline : data.brief.headline}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
              {easy
                ? `먼저 볼 후보는 ${topPick?.symbol ?? "대기"}입니다. 데이터가 충분히 쌓이면 추천 강도와 검증률이 더 선명해집니다.`
                : data.brief.summary}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <QualityPillar
              label="오늘의 후보"
              value={topPick?.symbol ?? "대기"}
              helper={topPick ? `${topPick.action_label} · ${topPick.sector}` : "시그널 생성 대기"}
              tone="primary"
            />
            <QualityPillar
              label="실증 수익률"
              value={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`}
              helper={`${krw(Number(paper.current_value ?? 0))} 평가`}
              tone={returnPct >= 0 ? "success" : "danger"}
            />
            <QualityPillar
              label="검증 적중률"
              value={hitRate == null ? "대기" : pct(Number(hitRate))}
              helper={hitRate == null ? "5거래일 평가 누적 중" : "최근 평가된 시그널 기준"}
              tone="info"
            />
          </div>
        </div>

        <div className="relative border-t bg-background/55 p-5 sm:p-7 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-success" />
              신뢰 체크
            </h3>
            <Link to="/pipeline" className="text-xs font-medium text-muted-foreground hover:text-foreground">
              데이터 상태
            </Link>
          </div>
          <div className="space-y-3">
            <DeskCheck
              ok={signalPolicy}
              label="근거 없는 매매 차단"
              detail={signalPolicy ? "BUY/SELL은 signal_id 없이는 실행되지 않습니다." : "과거 거래 중 근거 누락 항목이 있습니다."}
            />
            <DeskCheck
              ok={facts >= 8 || signals >= 8}
              label="데이터 깊이"
              detail={`${dataDepth} · facts ${facts} / signals ${signals}`}
            />
            <DeskCheck
              ok={Number(paper.trades_30d ?? 0) > 0 || Number(paper.current_value ?? 0) > 0}
              label="실증 운용"
              detail={`최근 거래 ${paper.trades_30d ?? 0}건 · 현금비중 ${Math.round(Number(paper.cash_weight ?? 1) * 100)}%`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function QualityPillar({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "primary" | "success" | "danger" | "info";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "danger"
        ? "var(--danger)"
        : tone === "info"
          ? "var(--info)"
          : "var(--primary)";
  return (
    <div className="rounded-2xl border bg-background/80 p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function DeskCheck({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-card/80 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
        {label}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function PaperPortfolioCard({ data, expert = false }: { data: any; expert?: boolean }) {
  if (!data) return null;
  const positive = Number(data.return_pct ?? 0) >= 0;
  const excess =
    data.benchmark_return_pct == null ? null : Number(data.return_pct ?? 0) - Number(data.benchmark_return_pct);
  const cashWeight = Number(data.cash_weight ?? 0);

  return (
    <section className="overflow-hidden rounded-3xl border bg-card">
      <div className="border-b bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="rounded-full bg-primary px-2.5 py-1 text-primary-foreground">실증 운용</span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">초기 1,000만원</span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">시그널 근거 필수</span>
          <span className="rounded-full border bg-background px-2.5 py-1 text-muted-foreground">5거래일 사후검증</span>
        </div>
      </div>
      <div className="p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Briefcase className="h-4 w-4" />
            {data.label}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            실거래가 아닌 모델 포트폴리오입니다. 매매는 신호 근거와 연결되고, 이후 성과 검증에 남습니다.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">현재 평가금액</div>
          <div className="text-2xl font-semibold tabular-nums">{krw(Number(data.current_value ?? 0))}</div>
          <div className={`mt-1 text-xs font-semibold tabular-nums ${positive ? "text-success" : "text-danger"}`}>
            {positive ? "+" : ""}{Number(data.return_pct ?? 0).toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <PaperMetric label="시작금액" value={krw(Number(data.initial_value ?? 0))} />
        <PaperMetric
          label="누적수익률"
          value={`${positive ? "+" : ""}${Number(data.return_pct ?? 0).toFixed(2)}%`}
          tone={positive ? "pos" : "neg"}
        />
        <PaperMetric label="현금비중" value={`${Math.round(cashWeight * 100)}%`} />
        <PaperMetric
          label={expert ? `초과수익 vs ${data.benchmark_label}` : "시장 대비"}
          value={excess == null ? "대기" : `${excess >= 0 ? "+" : ""}${excess.toFixed(2)}%p`}
          tone={excess == null ? undefined : excess >= 0 ? "pos" : "neg"}
        />
        <PaperMetric label={expert ? "MDD" : "최대 낙폭"} value={`${Number(data.max_drawdown_pct ?? 0).toFixed(1)}%`} tone="neg" />
      </div>
      </div>
    </section>
  );
}

function PaperPortfolioDetail({ liveDashboard, expert = false }: { liveDashboard?: any; expert?: boolean }) {
  if (!liveDashboard) {
    return (
      <section className="rounded-3xl border bg-card p-5">
        <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
      </section>
    );
  }

  const positions = Array.isArray(liveDashboard.positions) ? liveDashboard.positions : [];
  const trades = Array.isArray(liveDashboard.trade_ledger) ? liveDashboard.trade_ledger : [];

  return (
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-3xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Briefcase className="h-4 w-4" />
              실증 포트폴리오 구성
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              현재 보유 종목, 비중, 평가손익을 함께 봅니다.
            </p>
          </div>
          <span className="rounded-md border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
            {positions.length}종목
          </span>
        </div>

        {positions.length === 0 ? (
          <div className="rounded-2xl border bg-background p-5 text-sm text-muted-foreground">
            아직 보유 종목이 없습니다. 백필 후 hourly cron이 신뢰도 높은 BUY/SELL 시그널을 만나면 구성이 생깁니다.
          </div>
        ) : (
          <div className="space-y-2">
            {positions.map((p: any) => {
              const total = Number(liveDashboard.summary?.total ?? 0);
              const value = Number(p.market_value ?? 0);
              const weight = total > 0 ? value / total : 0;
              const pnl = Number(p.pl ?? 0);
              return (
                <div key={p.id ?? p.ticker} className="rounded-2xl border bg-background p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{p.ticker}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {Number(p.qty).toLocaleString("ko-KR")}주 · 비중 {pct(weight)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{Math.round(value).toLocaleString("ko-KR")}원</div>
                      <div className={`text-[11px] tabular-nums ${pnl >= 0 ? "text-success" : "text-danger"}`}>
                        {pnl >= 0 ? "+" : ""}{Math.round(pnl).toLocaleString("ko-KR")}원
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, weight * 100)}%` }} />
                  </div>
                  {expert && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      평단 {Number(p.avg_price_krw ?? p.avg_price ?? 0).toLocaleString("ko-KR")}원 · 현재가{" "}
                      {Number(p.last_price_krw ?? p.last_price ?? 0).toLocaleString("ko-KR")}원
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TradeLedger trades={trades} />
    </section>
  );
}

function PaperMetric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1 text-base font-semibold tabular-nums"
        style={{ color: tone === "pos" ? "var(--success)" : tone === "neg" ? "var(--danger)" : "var(--foreground)" }}
      >
        {value}
      </div>
    </div>
  );
}

function MarketHistoryPanel({ history, expert = false }: { history: any[]; expert?: boolean }) {
  return (
    <section className="rounded-3xl border bg-card p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clock3 className="h-4 w-4 text-primary" />
            판단 히스토리
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            하루 네 번의 판단 변화를 기록합니다.
          </p>
        </div>
        <span className="rounded-md border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          최근 {history.length}회
        </span>
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border bg-background p-5 text-sm text-muted-foreground">
          아직 기록이 없습니다. 다음 갱신 후 표시됩니다.
        </div>
      ) : (
        <div className={expert ? "grid gap-3 lg:grid-cols-2" : "space-y-3"}>
          {history.slice(0, expert ? 6 : 4).map((item) => (
            <HistoryItem key={item.id ?? item.generated_at} item={item} expert={expert} />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryItem({ item, expert }: { item: any; expert: boolean }) {
  const opportunities = Array.isArray(item.top_opportunities) ? item.top_opportunities : [];
  const actions = Array.isArray(item.top_actions) ? item.top_actions : [];
  const themes = Array.isArray(item.active_themes) ? item.active_themes : [];

  return (
    <article className="rounded-2xl border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          {item.session_label}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(item.generated_at).toLocaleString("ko-KR")}
        </span>
        {expert && (
          <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
            {item.regime} · {item.trend} · {signed(Number(item.score ?? 0))}
          </span>
        )}
      </div>
      <h3 className="text-sm font-semibold leading-6">{item.headline}</h3>
      {!expert && actions[0] && <p className="mt-2 text-sm leading-6 text-muted-foreground">{actions[0]}</p>}
      {expert && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">확신도</div>
            <div className="mt-1 font-semibold">{pct(Number(item.confidence ?? 0))}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">상위 후보</div>
            <div className="mt-1 font-semibold">
              {opportunities.slice(0, 2).map((o: any) => o.symbol).join(", ") || "없음"}
            </div>
          </div>
        </div>
      )}
      {expert && themes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {themes.slice(0, 5).map((theme: string) => (
            <span key={theme} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium">
              {theme.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function EasyAnswer({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border bg-background/80 p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function EasyOpportunityCard({ item, rank }: { item: any; rank: number }) {
  return (
    <article className="rounded-2xl border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          추천 {rank}
        </span>
        {item.owned && <span className="rounded-full bg-info/10 px-2.5 py-1 text-xs font-semibold text-info">보유중</span>}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{item.symbol}</div>
      <div className="mt-1 text-sm text-muted-foreground">{item.name}</div>
      <div className="mt-4 rounded-xl bg-secondary p-3">
        <div className="text-xs text-muted-foreground">지금 판단</div>
        <div className="mt-1 font-semibold">{item.action_label}</div>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {(item.reasons ?? [])[0] ?? "시장 방향성이 더 명확해질 때까지 관찰하세요."}
      </p>
    </article>
  );
}

function DecisionMetric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border bg-background/80 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{helper}</div>
    </div>
  );
}

function AllocationTile({ item }: { item: any }) {
  const tone =
    item.tone === "positive"
      ? "border-success/20 bg-success/10 text-success"
      : item.tone === "caution"
        ? "border-warning/20 bg-warning/10 text-warning"
        : item.tone === "defensive"
          ? "border-info/20 bg-info/10 text-info"
          : "border-border bg-background text-foreground";

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="text-xs opacity-80">{item.label}</div>
      <div className="mt-1 text-base font-semibold">{item.value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function OpportunityCard({ item }: { item: any }) {
  const positive = item.action === "ACCUMULATE" || item.action === "ADD" || item.action === "HOLD";

  return (
    <article className="group rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold tracking-tight">{item.symbol}</div>
            {positive ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-danger" />
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{item.name}</div>
        </div>
        <span className="rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {item.type}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${
            positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}
        >
          {item.action_label}
        </span>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
          {item.sector}
        </span>
        {item.owned && (
          <span className="rounded-md bg-info/10 px-2 py-1 text-xs font-medium text-info">보유중</span>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">신뢰도</div>
          <div className="mt-0.5 font-semibold">{pct(Number(item.confidence ?? 0))}</div>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">우선 점수</div>
          <div className="mt-0.5 font-semibold">{signed(Number(item.score ?? 0))}</div>
        </div>
      </div>

      <div className="space-y-2">
        {item.reasons.slice(0, 2).map((reason: string) => (
          <p key={reason} className="text-xs leading-5 text-muted-foreground">
            {reason}
          </p>
        ))}
      </div>

      <div className="mt-3 border-t pt-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          리스크
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{item.risks[0]}</p>
      </div>
    </article>
  );
}
