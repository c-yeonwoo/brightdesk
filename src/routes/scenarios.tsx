import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Trophy } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { Button } from "@/components/ui/button";
import { getScenarios, runScenarios } from "@/lib/scenarios.functions";

export const Route = createFileRoute("/scenarios")({
  head: () => ({
    meta: [
      { title: "백테스트 시나리오 · Sentinel" },
      { name: "description", content: "10개 파라미터 grid 백테스트와 Sharpe/MDD 비교" },
    ],
  }),
  component: ScenariosPage,
});

function ScenariosPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["scenarios"], queryFn: () => getScenarios() });

  const run = useMutation({
    mutationFn: () => runScenarios(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  });

  const best = data?.[0];

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">백테스트 시나리오</h1>
          <p className="text-sm text-muted-foreground">
            과거 6개월 가격 데이터로 10개 파라미터 조합을 시뮬레이션하고 점수화합니다.
          </p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending} className="h-9">
          {run.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          시나리오 실행
        </Button>
      </div>

      {best && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <Trophy className="h-4 w-4" /> 최적 시나리오: {best.name}
          </div>
          <div className="mt-2 grid gap-3 text-xs sm:grid-cols-4">
            <div>
              누적수익{" "}
              <span className="font-mono tabular-nums text-foreground">
                {(Number(best.total_return) * 100).toFixed(2)}%
              </span>
            </div>
            <div>
              Sharpe{" "}
              <span className="font-mono tabular-nums text-foreground">
                {Number(best.sharpe).toFixed(2)}
              </span>
            </div>
            <div>
              MDD{" "}
              <span className="font-mono tabular-nums text-foreground">
                -{(Number(best.mdd) * 100).toFixed(2)}%
              </span>
            </div>
            <div>
              Score{" "}
              <span className="font-mono tabular-nums text-foreground">
                {Number(best.score).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">시나리오</th>
              <th className="px-3 py-2 text-left">파라미터</th>
              <th className="px-3 py-2 text-right">누적수익</th>
              <th className="px-3 py-2 text-right">Sharpe</th>
              <th className="px-3 py-2 text-right">MDD</th>
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!isLoading && (!data || data.length === 0) && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  아직 결과가 없습니다. "시나리오 실행"을 눌러주세요.
                </td>
              </tr>
            )}
            {(data ?? []).map((s: any, i: number) => {
              const p = s.params as any;
              return (
                <tr
                  key={s.id}
                  className={"border-t " + (i === 0 ? "bg-amber-500/5" : "")}
                >
                  <td className="px-3 py-2 font-medium">
                    {i === 0 && <span className="mr-1">🏆</span>}
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    RSI {p.rsiBuy}/{p.rsiSell} · 배분 {(p.allocPctPerTrade * 100).toFixed(0)}% ·
                    손절 {(p.stopLossPct * 100).toFixed(0)}% · 익절 {(p.takeProfitPct * 100).toFixed(0)}%
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono tabular-nums ${
                      Number(s.total_return) >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {(Number(s.total_return) * 100).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {Number(s.sharpe).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-rose-600">
                    -{(Number(s.mdd) * 100).toFixed(2)}%
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
    </AppShell>
  );
}
