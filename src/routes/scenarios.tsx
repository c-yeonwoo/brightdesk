import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, Play, RefreshCw, Trophy } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { Button } from "@/components/ui/button";
import { getLatestScenarioRunInfo, getScenarios, getScenarioRunInfo, runScenarios } from "@/lib/scenarios.functions";
import { useEffect, useState } from "react";

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
  const [runId, setRunId] = useState<string | null>(null);
  const [lastHandledRunId, setLastHandledRunId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["scenarios"], queryFn: () => getScenarios() });
  const { data: scenarioRun, isLoading: runLoading, refetch: refetchRun } = useQuery({
    queryKey: ["scenario-run", runId],
    queryFn: () => (runId ? getScenarioRunInfo({ data: { runId } }) : getLatestScenarioRunInfo()),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const latest = query.state.data as any;
      return latest?.status === "running" ? 2_000 : false;
    },
  });

  const run = useMutation({
    mutationFn: () => runScenarios(),
    onSuccess: (result) => {
      setRunId(result.runId);
      setLastHandledRunId(null);
      qc.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });

  useEffect(() => {
    if (!scenarioRun?.run_id || !lastHandledRunId) return;
    if (scenarioRun.status !== "running" && scenarioRun.run_id === lastHandledRunId) {
      qc.invalidateQueries({ queryKey: ["scenarios"] });
      setLastHandledRunId(null);
    }
  }, [scenarioRun?.status, scenarioRun?.run_id, qc, lastHandledRunId]);

  useEffect(() => {
    if (!runId) return;
    setLastHandledRunId(runId);
  }, [runId]);

  const handleRefreshRun = () => {
    if (runId) {
      void refetchRun();
    }
  };

  const canRun = !run.isPending && scenarioRun?.status !== "running";

  const best = data?.[0];
  const statusMessage = scenarioRun
    ? scenarioRun.status === "running"
      ? `실행 중 · ${scenarioRun.completed_scenarios}/${scenarioRun.total_scenarios}`
      : scenarioRun.status === "success"
        ? `마지막 실행 완료 · ${new Date(scenarioRun.finished_at ?? scenarioRun.started_at).toLocaleString("ko-KR")}`
        : "마지막 실행 실패"
    : "아직 실행 이력이 없습니다.";

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">백테스트 시나리오</h1>
          <p className="text-sm text-muted-foreground">
            과거 6개월 가격 데이터로 10개 파라미터 조합을 시뮬레이션하고 점수화합니다.
          </p>
        </div>
        <Button onClick={() => run.mutate()} disabled={!canRun} className="h-9">
          {run.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
          <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          시나리오 실행
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border bg-card p-3 text-xs">
        <div className="inline-flex items-center gap-2 text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          {statusMessage}
        </div>
        <button
          onClick={handleRefreshRun}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
          disabled={!runId}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${runLoading ? "animate-spin" : ""}`} />
          재조회
        </button>
      </div>

      {scenarioRun?.status === "running" && (
        <div className="mb-4 rounded-xl border border-blue-500/40 bg-blue-500/5 p-3 text-xs text-blue-800">
          진행중: {scenarioRun.completed_scenarios}/{scenarioRun.total_scenarios} · 현재 {scenarioRun.current_scenario}
        </div>
      )}

      {scenarioRun?.status === "failed" && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-800">
          실행 실패: {scenarioRun.error_message}
        </div>
      )}

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
