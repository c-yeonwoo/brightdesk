import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminUser } from "./auth.server";

export const triggerCollection = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdminUser();
  const { runCollection } = await import("./collectors.server");
  return runCollection();
});

export const triggerRefiner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { runRefiner } = await import("./collectors.server");
    return runRefiner(data.limit ?? 10);
  });

export const getPipelineStatus = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminUser();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const namespaceEscalationThreshold = Math.max(
    1,
    Number.parseInt(process.env.BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES ?? "", 10) || 3,
  );

  const namespaceList = ["cron.collect", "cron.hourly-rebalance"] as const;

  const loadNamespaceEscalations = async () => {
    const rows = await Promise.all(
      namespaceList.map(async (namespace) => {
        const latestRunQuery = supabaseAdmin
          .from("cron_runs")
          .select("namespace,status,run_key,started_at,error_message")
          .eq("namespace", namespace)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const recentStatusesQuery = supabaseAdmin
          .from("cron_runs")
          .select("status")
          .eq("namespace", namespace)
          .order("started_at", { ascending: false })
          .limit(namespaceEscalationThreshold);

        const [latestRun, recentStatuses] = await Promise.all([latestRunQuery, recentStatusesQuery]);

        let consecutiveFailure = 0;
        for (const row of (recentStatuses.data ?? []) as Array<{ status: string }>) {
          if (row.status !== "failed") break;
          consecutiveFailure += 1;
        }

        return {
          namespace,
          latestRun: latestRun.data as
            | {
                namespace: string;
                status: string;
                run_key: string | null;
                started_at: string | null;
                error_message: string | null;
              }
            | null,
          consecutiveFailure,
        };
      }),
    );

    return rows;
  };

  const [pending, recent, lastFacts, cronRuns24h, cronFailureAll, namespaceEscalations] = await Promise.all([
    supabaseAdmin
      .from("raw_documents")
      .select("id", { count: "exact", head: true })
      .is("processed_at", null),
    supabaseAdmin
      .from("raw_documents")
      .select("id,title,source,collected_at,processed_at,reliability")
      .order("collected_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("kb_facts")
      .select("id,title,domain,updated_at,sentiment,reliability")
      .order("updated_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("cron_runs")
      .select("namespace,status,started_at,finished_at")
      .gte("started_at", since),
    supabaseAdmin
      .from("cron_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    loadNamespaceEscalations(),
  ]);

  const cronRows = (cronRuns24h.data ?? []) as Array<{
    namespace: string;
    status: string;
    started_at: string;
    finished_at?: string | null;
  }>;

  const percentile = (values: number[], ratio: number) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((ratio / 100) * (sorted.length - 1))),
    );
    return sorted[idx];
  };

  const total24h = cronRows.length;
  const success24h = cronRows.filter((row) => row.status === "success").length;
  const running24h = cronRows.filter((row) => row.status === "running").length;

  const namespaceStats: Record<string, {
    total: number;
    success: number;
    failed: number;
    running: number;
    durationsMs: number[];
  }> = {};
  for (const ns of namespaceList) {
    namespaceStats[ns] = { total: 0, success: 0, failed: 0, running: 0, durationsMs: [] };
  }

  for (const row of cronRows) {
    if (!namespaceStats[row.namespace]) {
      namespaceStats[row.namespace] = { total: 0, success: 0, failed: 0, running: 0, durationsMs: [] };
    }
    namespaceStats[row.namespace].total += 1;
    if (row.status === "success") namespaceStats[row.namespace].success += 1;
    if (row.status === "failed") namespaceStats[row.namespace].failed += 1;
    if (row.status === "running") namespaceStats[row.namespace].running += 1;

    if (row.finished_at && row.started_at) {
      const start = Date.parse(row.started_at);
      const finish = Date.parse(row.finished_at);
      if (Number.isFinite(start) && Number.isFinite(finish) && finish >= start) {
        namespaceStats[row.namespace].durationsMs.push(finish - start);
      }
    }
  }

  const namespaces = Object.entries(namespaceStats)
    .map(([namespace, stat]) => {
      const total = stat.total;
      const successRate = total > 0 ? Math.round((stat.success / total) * 1000) / 10 : 100;
      const avgDurationMs =
        stat.durationsMs.length > 0
          ? Math.round(stat.durationsMs.reduce((sum, x) => sum + x, 0) / stat.durationsMs.length)
          : null;
      const p95DurationMs = percentile(stat.durationsMs, 95);
      return {
        namespace,
        total,
        success: stat.success,
        failed: stat.failed,
        running: stat.running,
        successRate,
        avgDurationMs,
        p95DurationMs,
      };
    })
    .sort((a, b) => a.namespace.localeCompare(b.namespace));

  const successRate = total24h > 0 ? Math.round((success24h / total24h) * 1000) / 10 : 100;
  const escalations = namespaceEscalations
    .map((entry) => {
      const run = entry.latestRun ?? {
        namespace: entry.namespace,
        status: "idle",
        run_key: null,
        started_at: null,
        error_message: null,
      };

      return {
        namespace: entry.namespace,
        status: run.status,
        runKey: run.run_key,
        startedAt: run.started_at,
        errorMessage: run.error_message,
        consecutiveFailures: entry.consecutiveFailure,
        threshold: namespaceEscalationThreshold,
        isEscalated: entry.consecutiveFailure >= namespaceEscalationThreshold,
      };
    })
    .filter((entry) => entry.status !== "idle");

  return {
    pending: pending.count ?? 0,
    recentDocs: recent.data ?? [],
    recentFacts: lastFacts.data ?? [],
    operations: {
      queueLength: pending.count ?? 0,
      cronSuccessRate24h: successRate,
      cronTotal24h: total24h,
      cronSuccess24h: success24h,
      cronRunning24h: running24h,
      cronFailureAll: cronFailureAll.count ?? 0,
      namespaces,
      escalations,
      escalationThreshold: namespaceEscalationThreshold,
    },
  };
});
