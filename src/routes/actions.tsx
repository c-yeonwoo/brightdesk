import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Minus, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { getTodayActions } from "@/lib/actions.functions";
import { relativeTime } from "@/lib/kb-format";

export const Route = createFileRoute("/actions")({
  head: () => ({
    meta: [
      { title: "오늘의 액션 · Sentinel" },
      { name: "description", content: "최적 시나리오 기반 매수·매도·보유 권고" },
    ],
  }),
  component: ActionsPage,
});

const krw = (n: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.round(n));

const meta = (a: string) => {
  if (a === "BUY")
    return {
      label: "매수",
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
      Icon: TrendingUp,
    };
  if (a === "SELL")
    return {
      label: "매도",
      cls: "border-rose-500/30 bg-rose-500/10 text-rose-700",
      Icon: TrendingDown,
    };
  return {
    label: "보유",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: Minus,
  };
};

function ActionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["today-actions"],
    queryFn: () => getTodayActions(),
  });

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">오늘의 액션</h1>
        <p className="text-sm text-muted-foreground">
          최적 시나리오 + 최신 시그널 + KB Facts 를 결합한 오늘의 권고안.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="h-32 animate-pulse rounded-xl border bg-card" />
      ) : (
        <>
          {data.best_scenario ? (
            <div className="mb-4 rounded-xl border bg-card p-4 text-sm">
              <span className="text-muted-foreground">기준 시나리오: </span>
              <span className="font-semibold">{data.best_scenario.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                (Sharpe {Number(data.best_scenario.sharpe).toFixed(2)} · 누적{" "}
                {(Number(data.best_scenario.total_return) * 100).toFixed(2)}%)
              </span>
              <Link
                to="/scenarios"
                className="ml-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                시나리오 비교 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              아직 시나리오 결과가 없습니다.{" "}
              <Link to="/scenarios" className="text-primary hover:underline">
                시나리오 실행
              </Link>{" "}
              먼저 진행하세요.
            </div>
          )}

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">현금</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">₩{krw(data.cash)}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">매수 권고</div>
              <div className="mt-1 text-xl font-semibold text-emerald-600 tabular-nums">
                {data.counts.buy}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">매도 권고</div>
              <div className="mt-1 text-xl font-semibold text-rose-600 tabular-nums">
                {data.counts.sell}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">보유</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{data.counts.hold}</div>
            </div>
          </div>

          <div className="grid gap-3">
            {data.actions.length === 0 && (
              <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                권고 액션이 없습니다.
              </div>
            )}
            {data.actions.map((a: any, i: number) => {
              const m = meta(a.action);
              return (
                <div key={i} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${m.cls}`}
                    >
                      <m.Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </span>
                    <span className="font-mono text-lg font-semibold tabular-nums">
                      {a.ticker}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      score {a.score} · {relativeTime(a.ts)}
                    </span>
                    {a.allocation_krw != null && (
                      <span className="ml-auto text-sm">
                        권고 배분{" "}
                        <span className="font-mono font-semibold tabular-nums">
                          ₩{krw(a.allocation_krw)}
                        </span>
                      </span>
                    )}
                  </div>
                  {a.reason && (
                    <p className="mt-2 text-xs text-muted-foreground">근거 · {a.reason}</p>
                  )}
                  {a.fact_ids?.length > 0 && (
                    <Link
                      to="/facts"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      관련 Facts {a.fact_ids.length}건 보기 <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
