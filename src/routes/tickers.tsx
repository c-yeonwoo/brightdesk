import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { AppShell } from "@/components/kb/AppShell";
import { DomainBadge } from "@/components/kb/DomainBadge";
import { SentimentGauge } from "@/components/kb/SentimentGauge";
import { ReliabilityBar } from "@/components/kb/ReliabilityBar";
import { TickerChart } from "@/components/kb/TickerChart";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { getFactsByTicker, listTickerSuggestions } from "@/lib/kb.functions";
import { DOMAIN_LABEL, fmtDateTime, relativeTime } from "@/lib/kb-format";
import type { KbDomain, KbFact } from "@/lib/kb-client.server";

export const Route = createFileRoute("/tickers")({
  head: () => ({
    meta: [
      { title: "종목별 뷰 · KB Monitor" },
      { name: "description", content: "티커별 관련 fact를 분야별 타임라인으로." },
    ],
  }),
  component: TickerPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        티커 데이터를 불러올 수 없습니다: {error.message}
      </div>
    </AppShell>
  ),
});

const DOMAINS: KbDomain[] = ["macro", "theme", "news", "politics"];

function TickerPage() {
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string | null>(null);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["ticker-suggestions"],
    queryFn: () => listTickerSuggestions(),
  });

  const { data: facts = [], isLoading } = useQuery({
    queryKey: ["facts-by-ticker", ticker],
    queryFn: () => getFactsByTicker({ data: { ticker: ticker! } }),
    enabled: !!ticker,
  });

  const grouped = useMemo(() => {
    const m: Record<string, KbFact[]> = {};
    for (const f of facts as KbFact[]) {
      const d = f.domain;
      if (!m[d]) m[d] = [];
      m[d].push(f);
    }
    return m;
  }, [facts]);

  const submit = () => {
    const t = input.trim().toUpperCase();
    if (t) setTicker(t);
  };

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">종목별 뷰</h1>
        <p className="text-sm text-muted-foreground">
          티커를 입력하면 관련 fact를 분야별 타임라인으로 보여줍니다.
        </p>
      </div>

      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="티커 입력 (예: AAPL, NVDA, TSM)"
              className="h-10 pl-8 text-sm uppercase tabular-nums"
            />
          </div>
          <Button onClick={submit} className="h-10">
            조회
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              자주 등장하는 티커
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 24).map((s) => (
                <button
                  key={s.ticker}
                  onClick={() => {
                    setInput(s.ticker);
                    setTicker(s.ticker);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium uppercase tabular-nums transition-colors hover:bg-accent"
                >
                  {s.ticker}
                  <span className="text-[10px] text-muted-foreground">{s.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!ticker ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-12 text-center text-sm text-muted-foreground">
          티커를 입력해 시작하세요.
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          불러오는 중…
        </div>
      ) : facts.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          <span className="font-mono font-medium uppercase">{ticker}</span> 관련 fact가 없습니다.
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-2xl font-semibold tabular-nums">{ticker}</h2>
            <span className="text-sm text-muted-foreground">
              총 {facts.length}건의 관련 fact
            </span>
          </div>
          <TickerChart ticker={ticker} />
          <div className="grid gap-4 lg:grid-cols-2">
            {DOMAINS.map((d) => {
              const items = grouped[d] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={d} className="rounded-xl border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DomainBadge domain={d} />
                      <span className="text-sm font-medium">{DOMAIN_LABEL[d]}</span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {items.length}건
                    </span>
                  </div>
                  <ol className="relative space-y-3 border-l border-border pl-4">
                    {items.map((f) => (
                      <li key={f.id} className="relative">
                        <span
                          className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2"
                          style={{
                            background: "var(--card)",
                            borderColor: `var(--domain-${d})`,
                          }}
                        />
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{relativeTime(f.updated_at)}</span>
                          <span>·</span>
                          <span className="tabular-nums">{fmtDateTime(f.updated_at)}</span>
                          {!f.is_active && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium">
                              비활성
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm font-medium leading-snug">
                          {f.title}
                        </div>
                        {f.summary && (
                          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                            {f.summary}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-3">
                          <SentimentGauge value={f.sentiment} />
                          <ReliabilityBar value={f.reliability} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
