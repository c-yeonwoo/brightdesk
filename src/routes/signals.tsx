import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, TrendingDown, TrendingUp, Minus, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/kb/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generateAllSignals,
  generateSignal,
  getLatestSignalPerTicker,
  listSignals,
} from "@/lib/signals.functions";
import { fmtDateTime, relativeTime } from "@/lib/kb-format";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "시그널 · KB Monitor" },
      { name: "description", content: "기술지표 + KB 감성을 결합한 매매 시그널" },
    ],
  }),
  component: SignalsPage,
});

const kindStyle = (k: string) => {
  if (k === "BUY")
    return { cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", Icon: TrendingUp };
  if (k === "SELL")
    return { cls: "text-rose-600 bg-rose-500/10 border-rose-500/30", Icon: TrendingDown };
  return { cls: "text-muted-foreground bg-muted border-border", Icon: Minus };
};

function SignalsPage() {
  const qc = useQueryClient();
  const [ticker, setTicker] = useState("");

  const latest = useQuery({
    queryKey: ["signals-latest"],
    queryFn: () => getLatestSignalPerTicker(),
  });
  const history = useQuery({
    queryKey: ["signals-history"],
    queryFn: () => listSignals({ data: { limit: 100 } }),
  });

  const genOne = useMutation({
    mutationFn: (t: string) => generateSignal({ data: { ticker: t } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals-latest"] });
      qc.invalidateQueries({ queryKey: ["signals-history"] });
    },
  });
  const genAll = useMutation({
    mutationFn: () => generateAllSignals(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals-latest"] });
      qc.invalidateQueries({ queryKey: ["signals-history"] });
    },
  });

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">시그널</h1>
          <p className="text-sm text-muted-foreground">
            기술지표(RSI·MACD·MA)와 KB 감성을 결합한 규칙기반 매매 신호.
          </p>
        </div>
        <Button
          onClick={() => genAll.mutate()}
          disabled={genAll.isPending}
          className="h-9"
        >
          {genAll.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          전체 종목 시그널 생성
        </Button>
      </div>

      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="티커 (예: AAPL)"
            className="h-9 max-w-xs uppercase tabular-nums"
          />
          <Button
            onClick={() => ticker.trim() && genOne.mutate(ticker.trim())}
            disabled={!ticker.trim() || genOne.isPending}
            variant="secondary"
            className="h-9"
          >
            {genOne.isPending ? "생성중…" : "이 종목만 생성"}
          </Button>
        </div>
        {genAll.data && (
          <div className="mt-3 text-xs text-muted-foreground">
            {genAll.data.count}개 종목 처리 완료
          </div>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">최신 시그널 (종목별)</h2>
        {latest.isLoading ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        ) : !latest.data || latest.data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            아직 시그널이 없습니다. 위 버튼으로 생성하세요.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {latest.data.map((s: any) => {
              const { cls, Icon } = kindStyle(s.kind);
              return (
                <div key={s.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-lg font-semibold tabular-nums">{s.ticker}</div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}
                    >
                      <Icon className="h-3 w-3" />
                      {s.kind}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    score{" "}
                    <span className="font-mono tabular-nums text-foreground">{s.score}</span>
                    {" · "}
                    {relativeTime(s.ts)}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {(s.reasons ?? []).map((r: string, i: number) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">시그널 이력</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">시각</th>
                <th className="px-3 py-2 text-left">티커</th>
                <th className="px-3 py-2 text-left">유형</th>
                <th className="px-3 py-2 text-right">score</th>
                <th className="px-3 py-2 text-right">RSI</th>
                <th className="px-3 py-2 text-right">MACD hist</th>
                <th className="px-3 py-2 text-left">근거</th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((s: any) => {
                const { cls } = kindStyle(s.kind);
                return (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {fmtDateTime(s.ts)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{s.ticker}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
                      >
                        {s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {s.score}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {s.rsi14?.toFixed?.(1) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {s.macd_hist?.toFixed?.(3) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {(s.reasons ?? []).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
