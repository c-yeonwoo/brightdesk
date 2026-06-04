import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, RefreshCw, Sparkles } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { DomainBadge } from "@/components/kb/DomainBadge";
import {
  getPipelineStatus,
  triggerCollection,
  triggerRefiner,
} from "@/lib/pipeline.functions";
import { SOURCE_LABEL, relativeTime } from "@/lib/kb-format";
import type { KbDomain, SourceType } from "@/lib/kb-client.server";

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

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">파이프라인</h1>
          <p className="text-sm text-muted-foreground">
            수집 → 정제 단계를 수동 실행하거나, 매 시간 자동 실행되는 cron 상태를 확인하세요.
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-xs text-muted-foreground">미처리 원본</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">
            {isLoading ? "—" : data?.pending}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            processed_at = NULL 인 raw_documents
          </div>
        </div>

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
          className="rounded-xl border bg-card p-5 text-left transition-colors hover:bg-muted disabled:opacity-60"
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">최근 수집 원본 (15)</h2>
          <div className="divide-y">
            {(data?.recentDocs ?? []).map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 py-2.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {SOURCE_LABEL[d.source as SourceType] ?? d.source}
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

      <div className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold">자동 실행 (cron)</h2>
        <p className="text-xs text-muted-foreground">
          매 시간 정각 <code className="rounded bg-muted px-1">POST /api/public/cron/collect</code>{" "}
          호출 → 수집 + 최대 20건 정제. pg_cron 잡 이름:{" "}
          <code className="rounded bg-muted px-1">kb-hourly-collect</code>.
        </p>
      </div>
    </AppShell>
  );
}
