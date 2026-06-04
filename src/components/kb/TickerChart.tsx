import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { getTickerChart, refreshTicker } from "@/lib/prices.functions";

interface ChartRow {
  date: string;
  close: number;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  rsi14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
}

export function TickerChart({ ticker }: { ticker: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ticker-chart", ticker],
    queryFn: () => getTickerChart({ data: { ticker } }),
  });

  const refresh = useMutation({
    mutationFn: () => refreshTicker({ data: { ticker, range: "1y" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticker-chart", ticker] }),
  });

  const merged: ChartRow[] = (() => {
    if (!data) return [];
    const indByDate = new Map(data.indicators.map((i: any) => [i.date, i]));
    return data.prices.map((p: any) => {
      const ind = (indByDate.get(p.date) as any) ?? {};
      return {
        date: p.date,
        close: Number(p.close),
        ma20: ind.ma20 != null ? Number(ind.ma20) : null,
        ma60: ind.ma60 != null ? Number(ind.ma60) : null,
        ma120: ind.ma120 != null ? Number(ind.ma120) : null,
        rsi14: ind.rsi14 != null ? Number(ind.rsi14) : null,
        macd: ind.macd != null ? Number(ind.macd) : null,
        macd_signal: ind.macd_signal != null ? Number(ind.macd_signal) : null,
        macd_hist: ind.macd_hist != null ? Number(ind.macd_hist) : null,
      };
    });
  })();

  const last = merged[merged.length - 1];
  const prev = merged[merged.length - 2];
  const chg = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;

  return (
    <div className="mb-4 rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="text-base font-semibold">가격 & 기술 지표</h3>
          {last && (
            <>
              <span className="text-lg font-semibold tabular-nums">
                {last.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              {chg != null && (
                <span
                  className={
                    "text-xs font-medium tabular-nums " +
                    (chg >= 0 ? "text-success" : "text-destructive")
                  }
                >
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(2)}%
                </span>
              )}
              <span className="text-[11px] text-muted-foreground tabular-nums">
                · {last.date}
              </span>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          <RefreshCw
            className={"h-3.5 w-3.5 " + (refresh.isPending ? "animate-spin" : "")}
          />
          {refresh.isPending ? "수집 중…" : "Yahoo에서 새로고침"}
        </Button>
      </div>

      {refresh.isError && (
        <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {(refresh.error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">로딩…</div>
      ) : merged.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 py-10 text-center text-xs text-muted-foreground">
          저장된 가격 데이터가 없습니다. 우측 상단 "Yahoo에서 새로고침"을 눌러 수집하세요.
          <div className="mt-1">예: AAPL, NVDA, TSM, 005930.KS</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="h-[260px] w-full">
            <ResponsiveContainer>
              <ComposedChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  domain={["auto", "auto"]}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  dot={false}
                  name="Close"
                />
                <Line type="monotone" dataKey="ma20" stroke="#f59e0b" strokeWidth={1} dot={false} name="MA20" />
                <Line type="monotone" dataKey="ma60" stroke="#10b981" strokeWidth={1} dot={false} name="MA60" />
                <Line type="monotone" dataKey="ma120" stroke="#6366f1" strokeWidth={1} dot={false} name="MA120" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">RSI(14)</div>
              <div className="h-[100px] w-full">
                <ResponsiveContainer>
                  <AreaChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} minTickGap={40} />
                    <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fontSize: 9 }} width={28} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: "11px" }} />
                    <Area type="monotone" dataKey="rsi14" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">MACD</div>
              <div className="h-[100px] w-full">
                <ResponsiveContainer>
                  <ComposedChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 9 }} width={36} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: "11px" }} />
                    <Bar dataKey="macd_hist" fill="var(--muted-foreground)" opacity={0.5} />
                    <Line type="monotone" dataKey="macd" stroke="var(--primary)" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="macd_signal" stroke="#f59e0b" strokeWidth={1} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
