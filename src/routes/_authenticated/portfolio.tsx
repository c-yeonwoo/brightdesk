import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, RotateCcw, Camera, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { Button } from "@/components/ui/button";
import {
  applySignals,
  getPortfolio,
  resetMyPortfolio,
  takeSnapshot,
} from "@/lib/portfolio.functions";
import { fmtDateTime } from "@/lib/kb-format";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "포트폴리오 · Sentinel" },
      { name: "description", content: "1000만원 모의 포트폴리오 — 시그널 기반 자동매매 결과" },
    ],
  }),
  component: PortfolioPage,
});

const krw = (n: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.round(n));

function PortfolioPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["portfolio"], queryFn: () => getPortfolio() });

  const apply = useMutation({
    mutationFn: () => applySignals(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });
  const snap = useMutation({
    mutationFn: () => takeSnapshot(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });
  const reset = useMutation({
    mutationFn: () => resetMyPortfolio(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });

  const pnlColor =
    (data?.summary.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">모의 포트폴리오</h1>
          <p className="text-sm text-muted-foreground">
            초기 자본 1000만원 · 다음날 시가 체결 · 수수료 0.015% · 거래세 0.18%
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => apply.mutate()} disabled={apply.isPending} className="h-9">
            {apply.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            최근 시그널 반영
          </Button>
          <Button
            onClick={() => snap.mutate()}
            disabled={snap.isPending}
            variant="secondary"
            className="h-9"
          >
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            오늘 스냅샷
          </Button>
          <Button
            onClick={() => {
              if (confirm("초기화하시겠습니까?")) reset.mutate();
            }}
            variant="outline"
            className="h-9"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            리셋
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="h-32 animate-pulse rounded-xl border bg-card" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">총 평가</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                ₩{krw(data.summary.total)}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">현금</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                ₩{krw(data.summary.cash)}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">보유 평가</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                ₩{krw(data.summary.holdings)}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">손익</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${pnlColor}`}>
                {data.summary.pnl >= 0 ? "+" : ""}₩{krw(data.summary.pnl)}
                <span className="ml-2 text-sm">
                  ({data.summary.pnl_pct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">보유 종목</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">티커</th>
                    <th className="px-3 py-2 text-right">수량</th>
                    <th className="px-3 py-2 text-right">평단</th>
                    <th className="px-3 py-2 text-right">현재가</th>
                    <th className="px-3 py-2 text-right">평가금</th>
                    <th className="px-3 py-2 text-right">손익</th>
                  </tr>
                </thead>
                <tbody>
                  {data.positions.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-xs text-muted-foreground" colSpan={6}>
                        보유 종목이 없습니다.
                      </td>
                    </tr>
                  )}
                  {data.positions.map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{p.ticker}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(p.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(p.avg_price).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.last_price?.toFixed?.(2) ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ₩{krw(p.market_value)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          (p.pl ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {p.pl != null ? `${p.pl >= 0 ? "+" : ""}₩${krw(p.pl)}` : "—"}
                        {p.pl_pct != null && (
                          <span className="ml-1 text-[10px]">({p.pl_pct.toFixed(2)}%)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">최근 거래</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">시각</th>
                    <th className="px-3 py-2 text-left">티커</th>
                    <th className="px-3 py-2 text-left">유형</th>
                    <th className="px-3 py-2 text-right">수량</th>
                    <th className="px-3 py-2 text-right">가격</th>
                    <th className="px-3 py-2 text-right">수수료+세금</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-xs text-muted-foreground" colSpan={6}>
                        거래 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                  {data.transactions.map((t: any) => {
                    const Icon = t.side === "BUY" ? TrendingUp : TrendingDown;
                    const cls =
                      t.side === "BUY" ? "text-emerald-600" : "text-rose-600";
                    return (
                      <tr key={t.id} className="border-t">
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                          {fmtDateTime(t.executed_at)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{t.ticker}</td>
                        <td className={`px-3 py-2 ${cls}`}>
                          <span className="inline-flex items-center gap-1 text-xs font-medium">
                            <Icon className="h-3 w-3" />
                            {t.side}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(t.qty)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(t.price).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          ₩{krw(Number(t.fee) + Number(t.tax))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
