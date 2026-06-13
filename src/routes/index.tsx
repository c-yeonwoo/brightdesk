import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  Clock3,
  Compass,
  Database,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { getMarketDesk } from "@/lib/market.functions";

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

function MarketPulsePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["market-desk"],
    queryFn: () => getMarketDesk(),
    refetchInterval: 10 * 60 * 1000,
  });

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {data?.generated_at ? new Date(data.generated_at).toLocaleString("ko-KR") : "Market Pulse"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            오늘 시장을 읽고, 다음 후보를 고릅니다
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            매크로·국제 정세·산업 흐름·신호를 모아 섹터, 종목, ETF 후보와 포트폴리오 반영 방향을 정리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/my-portfolio"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Briefcase className="h-4 w-4" />
            포트폴리오 입력
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

      {isLoading || !data ? <Skeleton /> : <MarketPulseContent data={data as any} />}
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

function MarketPulseContent({ data }: { data: any }) {
  const Trend = trendIcon[data.brief.trend as keyof typeof trendIcon] ?? LineChart;
  const healthLow = data.health.facts < 3;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
                regimeTone[data.brief.regime as keyof typeof regimeTone]
              }`}
            >
              {data.brief.regime_label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium">
              <Trend className="h-3.5 w-3.5" />
              {data.brief.trend_label}
            </span>
            <span className="rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              score {Number(data.brief.score).toFixed(2)}
            </span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">{data.brief.headline}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{data.brief.summary}</p>

          <div className="mt-5 flex flex-wrap gap-2">
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
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" />
            MVP 운영 상태
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
              RSS 소스와 AI 정제를 연결하면 추천 근거가 더 선명해집니다.
            </div>
          )}
        </div>
      </section>

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

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border bg-card p-5">
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

        <div className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Compass className="h-4 w-4" />
            오늘의 근거
          </h2>
          <div className="mt-4 divide-y">
            {data.sources.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                수집/정제가 실행되면 여기에 시장 판단 근거가 표시됩니다.
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
    <article className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">{item.symbol}</div>
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
          <div className="text-muted-foreground">기간</div>
          <div className="mt-0.5 font-semibold">{item.horizon}</div>
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
