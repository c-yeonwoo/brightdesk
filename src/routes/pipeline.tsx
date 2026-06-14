import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AlertTriangle, Loader2, Play, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { DomainBadge } from "@/components/kb/DomainBadge";
import {
  getPipelineStatus,
  triggerCollection,
  triggerRefiner,
} from "@/lib/pipeline.functions";
import { formatSourceLabel, relativeTime } from "@/lib/kb-format";
import type { KbDomain } from "@/lib/kb-client.server";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "파이프라인 · KB Monitor" },
      { name: "description", content: "데이터 수집·정제 파이프라인 수동 실행 및 상태." },
    ],
  }),
  component: PipelinePage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        파이프라인 상태를 불러올 수 없습니다: {error.message}
      </div>
    </AppShell>
  ),
});

function PipelinePage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"user" | "operator">("user");
  const collect = useServerFn(triggerCollection);
  const refine = useServerFn(triggerRefiner);
  const status = useServerFn(getPipelineStatus);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: () => status(),
    refetchInterval: 10_000,
  });

  const collectMut = useMutation({
    mutationFn: () => collect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });
  const refineMut = useMutation({
    mutationFn: () => refine({ data: { limit: 20 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-status"] }),
  });

  const ops = data?.operations;
  const successRate = ops?.cronSuccessRate24h ?? 0;
  const successRateText = `${successRate.toFixed(1)}%`;

  const namespaceRows = (ops?.namespaces ?? []) as Array<{
    namespace: string;
    total: number;
    success: number;
    failed: number;
    running: number;
    successRate: number;
    avgDurationMs: number | null;
    p95DurationMs: number | null;
  }>;

  const labelOfNamespace = (namespace: string) => {
    if (namespace === "cron.collect") return "collect 파이프라인";
    if (namespace === "cron.hourly-rebalance") return "hourly-rebalance";
    return namespace;
  };

  const formatDuration = (valueMs: number | null) => {
    if (!valueMs || valueMs <= 0) return "—";
    const sec = valueMs / 1000;
    return `${Math.round(sec * 10) / 10}s`;
  };

  const alerts: { level: "warn" | "danger"; text: string }[] = [];
  if ((ops?.cronRunning24h ?? 0) > 0) {
    alerts.push({ level: "warn", text: `현재 실행 중인 작업 ${ops?.cronRunning24h}건(대기 없이 정상 진행 중)` });
  }
  if ((ops?.queueLength ?? 0) >= 150) {
    alerts.push({ level: "danger", text: "미처리 원본 큐가 150개를 초과해 파이프라인 지연 위험입니다." });
  }
  if (successRate < 95) {
    alerts.push({ level: "danger", text: "24시간 크론 성공률이 95% 미만입니다." });
  }
  if ((ops?.cronFailureAll ?? 0) >= 20) {
    alerts.push({ level: "warn", text: `누적 크론 실패가 ${ops?.cronFailureAll}건입니다. 운영 확인 필요` });
  }
  for (const n of namespaceRows as Array<{ namespace: string; p95DurationMs: number | null }>) {
    if ((n.p95DurationMs ?? 0) >= 240_000) {
      alerts.push({
        level: "danger",
        text: `${labelOfNamespace(n.namespace)} 24h p95 실행시간이 ${formatDuration(n.p95DurationMs)}로 임계치 초과`,
      });
    } else if ((n.p95DurationMs ?? 0) >= 120_000) {
      alerts.push({
        level: "warn",
        text: `${labelOfNamespace(n.namespace)} 24h p95 실행시간이 ${formatDuration(n.p95DurationMs)} 이상입니다.`,
      });
    }
  }

  const escalations = (ops?.escalations ?? []) as Array<{
    namespace: string;
    status: string;
    runKey: string | null;
    startedAt: string | null;
    errorMessage: string | null;
    consecutiveFailures: number;
    threshold: number;
    isEscalated: boolean;
  }>;

  for (const item of escalations.filter((item) => item.isEscalated)) {
    alerts.push({
      level: "danger",
      text: `${item.namespace} 연속 실패 ${item.consecutiveFailures}/${item.threshold} 도달 (run ${item.runKey ?? "-"}, status ${item.status})`,
    });
  }

  const namespaceRateText = (n: { successRate: number }) => `${n.successRate.toFixed(1)}%`;
  const namespaceHealth = (n: {
    failed: number;
    running: number;
    successRate: number;
    total: number;
  }) => {
    if (n.failed > 0) return "Failure";
    if (n.running > 0) return "Running";
    if (n.total === 0) return "No Data";
    return "Stable";
  };

  const escalationByNamespace = Object.fromEntries(escalations.map((item) => [item.namespace, item]));

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">파이프라인</h1>
          <p className="text-sm text-muted-foreground">
            수집 → 정제 단계를 수동 실행하거나, 장 흐름에 맞춰 하루 4회 실행되는 cron 상태를 확인하세요.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setMode("user")}
          className={`rounded-full border px-3 py-1 text-xs ${mode === "user" ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted"}`}
        >
          사용자 모드
        </button>
        <button
          onClick={() => setMode("operator")}
          className={`rounded-full border px-3 py-1 text-xs ${mode === "operator" ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted"}`}
        >
          운영자 모드
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-2">
          {alerts.map((alert, idx) => {
            const levelClass =
              alert.level === "danger"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-amber-500/40 bg-amber-500/5 text-amber-700";
            return (
              <div key={idx} className={`rounded-xl border p-3 text-xs ${levelClass}`}>
                <div className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {alert.text}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground">큐 길이</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {isLoading ? "—" : ops?.queueLength ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">raw_documents 처리 대기</div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground">24시간 크론 성공률</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {isLoading ? "—" : successRateText}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            성공 {ops?.cronSuccess24h ?? 0} / 실행 {ops?.cronTotal24h ?? 0}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground">누적 크론 실패</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {isLoading ? "—" : ops?.cronFailureAll ?? 0}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">전체 실패 이력</div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground">미처리 원본</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {isLoading ? "—" : data?.pending}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            processed_at = NULL 인 raw_documents
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => collectMut.mutate()}
          disabled={collectMut.isPending}
          className="rounded-xl border bg-card p-5 text-left transition-colors hover:bg-muted disabled:opacity-60"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">1. 수집 실행</span>
            {collectMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 text-[var(--primary)]" />
            )}
          </div>
          <div className="mt-2 text-sm font-medium">4개 소스 collectors 즉시 실행</div>
          {collectMut.data && (
            <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              수집 {collectMut.data.collected} · 신규 {collectMut.data.inserted} · 중복{" "}
              {collectMut.data.skipped}
            </div>
          )}
          {collectMut.error && (
            <div className="mt-2 text-[11px] text-destructive">
              {(collectMut.error as Error).message}
            </div>
          )}
        </button>

        <button
          onClick={() => refineMut.mutate()}
          disabled={refineMut.isPending}
          className={`rounded-xl border bg-card p-5 text-left transition-colors hover:bg-muted disabled:opacity-60 ${mode === "user" ? "hidden" : ""}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">2. LLM 정제</span>
            {refineMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-[var(--domain-theme)]" />
            )}
          </div>
          <div className="mt-2 text-sm font-medium">미처리 큐 → kb_facts upsert</div>
          {refineMut.data && (
            <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              처리 {refineMut.data.processed} · facts {refineMut.data.factsCreated}
              {refineMut.data.errors.length > 0 ? ` · 오류 ${refineMut.data.errors.length}` : ""}
            </div>
          )}
          {refineMut.error && (
            <div className="mt-2 text-[11px] text-destructive">
              {(refineMut.error as Error).message}
            </div>
          )}
        </button>
      </div>

      {mode === "operator" && (
        <>
          {namespaceRows.map((n) => (
            <div key={n.namespace} className="rounded-xl border bg-card p-5">
              <div className="text-xs text-muted-foreground">{labelOfNamespace(n.namespace)}</div>
              <div className="mt-2 flex items-baseline gap-2 text-xl font-semibold tabular-nums">
                <span>{namespaceRateText(n)}</span>
                {n.running > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    실행 {n.running}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                성공 {n.success} / 실패 {n.failed} / 총 {n.total}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                최근 실행시간 avg/p95: {formatDuration(n.avgDurationMs)} / {formatDuration(n.p95DurationMs)}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                상태 {namespaceHealth(n)}
              </div>
              {escalationByNamespace[n.namespace] ? (
                <div className="mt-2 text-[11px] text-amber-600">
                  연속 실패 {escalationByNamespace[n.namespace].consecutiveFailures}/
                  {escalationByNamespace[n.namespace].threshold}
                </div>
              ) : null}
            </div>
          ))}
        </>
      )}

      {!isLoading && mode === "user" && alerts.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">운영 모드에서 실패 히스토리/연속 오류 세부를 확인하세요.</p>
      )}

      <div className={`mt-6 grid gap-4 lg:grid-cols-2 ${mode === "user" ? "hidden" : "grid"}`}>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">최근 수집 원본 (15)</h2>
          <div className="divide-y">
            {(data?.recentDocs ?? []).map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 py-2.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {formatSourceLabel(d.source as string)}
                </span>
                <span className="flex-1 truncate text-sm">{d.title ?? "(제목 없음)"}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    d.processed_at ? "bg-[var(--success)]" : "bg-[var(--warning)]"
                  }`}
                  title={d.processed_at ? "처리됨" : "미처리"}
                />
                <span className="w-20 text-right text-[11px] text-muted-foreground tabular-nums">
                  {relativeTime(d.collected_at)}
                </span>
              </div>
            ))}
            {(data?.recentDocs.length ?? 0) === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                아직 수집된 문서가 없습니다.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">최근 갱신 Facts (10)</h2>
          <div className="divide-y">
            {(data?.recentFacts ?? []).map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 py-2.5">
                <DomainBadge domain={f.domain as KbDomain} />
                <span className="flex-1 truncate text-sm">{f.title}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  s={f.sentiment?.toFixed?.(2) ?? "—"} · r=
                  {f.reliability?.toFixed?.(2) ?? "—"}
                </span>
                <span className="w-20 text-right text-[11px] text-muted-foreground tabular-nums">
                  {relativeTime(f.updated_at)}
                </span>
              </div>
            ))}
            {(data?.recentFacts.length ?? 0) === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                아직 정제된 fact가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`mt-6 rounded-xl border bg-card p-5 ${mode === "user" ? "hidden" : "block"}`}>
        <h2 className="mb-2 text-sm font-semibold">자동 실행 (cron)</h2>
        <p className="text-xs text-muted-foreground">
          KST 08:45, 10:00, 15:00, 17:00에 <code className="rounded bg-muted px-1">POST /api/public/cron/hourly-rebalance</code> (헤더: <code className="rounded bg-muted px-1">X-BRIGHTDESK-CRON-TOKEN</code>)
          호출 → 수집 + 정제 + 시그널 + 레짐 + 스냅샷 갱신. pg_cron 잡 이름: {" "}
          <code className="rounded bg-muted px-1">brightdesk-market-*</code>.
        </p>
      </div>
    </AppShell>
  );
}
