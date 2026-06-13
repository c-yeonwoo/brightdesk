import { getServerConfig } from "@/lib/config.server";

type CronStatus = "success" | "failed";

type CronRunContext = {
  namespace: string;
  runKey: string;
  status: CronStatus;
  reason?: string;
  runDurationMs?: number;
};

type FailureCategory = "network" | "parsing" | "llm" | "database" | "validation" | "logic" | "unknown";
type AlertSeverity = "warning" | "critical";

type CronOperationsSnapshot = {
  queueLength: number;
  successRate24h: number;
  cronFailureAll: number;
};
type ConsecutiveFailureSnapshot = {
  count: number;
  threshold: number;
};

type CronAlertMessage = {
  severity: AlertSeverity;
  summary: string;
  escalation?: {
    count: number;
    threshold: number;
    reason: string;
  } | null;
};

const alertCooldowns = new Map<string, number>();
type WebhookChannel = "generic" | "slack" | "discord";
type WebhookTarget = { channel: WebhookChannel; url: string };

function parseNum(envValue: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(envValue ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseWebhookList(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toFailureCategories(reason: string): FailureCategory[] {
  const text = reason.toLowerCase();
  const set = new Set<FailureCategory>();

  const has = (needle: string) => text.includes(needle);

  if (
    has("econn") ||
    has("timeout") ||
    has("timed out") ||
    has("fetch failed") ||
    has("dns") ||
    has("network") ||
    has("socket hang up")
  ) {
    set.add("network");
  }

  if (
    has("parse") ||
    has("json") ||
    has("parser") ||
    has("schema") ||
    has("invalid") ||
    has("rss")
  ) {
    set.add("parsing");
  }

  if (
    has("llm") ||
    has("openai") ||
    has("ai") ||
    has("token") ||
    has("response format") ||
    has("json_object")
  ) {
    set.add("llm");
  }

  if (
    has("supabase") ||
    has("insert") ||
    has("upsert") ||
    has("permission") ||
    has("foreign key") ||
    has("constraint") ||
    has("duplicate key") ||
    has("23505")
  ) {
    set.add("database");
  }

  if (
    has("validate") ||
    has("required") ||
    has("not found") ||
    has("range") ||
    has("malformed") ||
    has("bad request")
  ) {
    set.add("validation");
  }

  if (has("logic") || has("partial failure") || has("runtime") || has("unknown")) {
    set.add("logic");
  }

  if (set.size === 0) {
    set.add("unknown");
  }

  return Array.from(set);
}

function summarizeFailureCategories(categories: FailureCategory[]) {
  if (!categories.length) return "unknown";
  return categories.join(", ");
}

function shouldThrottle(key: string, cooldownMinutes: number) {
  const now = Date.now();
  const cooldownMs = cooldownMinutes * 60_000;
  const last = alertCooldowns.get(key);
  if (last && now - last < cooldownMs) return true;
  alertCooldowns.set(key, now);
  return false;
}

async function loadCronSnapshot() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pending, cronRuns24h, cronFailureAll] = await Promise.all([
    supabaseAdmin.from("raw_documents").select("id", { count: "exact", head: true }).is("processed_at", null),
    supabaseAdmin.from("cron_runs").select("status").gte("started_at", since),
    supabaseAdmin.from("cron_runs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const rows = (cronRuns24h.data ?? []) as Array<{ status: string }>;
  const total = rows.length;
  const success = rows.filter((r) => r.status === "success").length;
  const successRate24h = total > 0 ? Math.round((success / total) * 1000) / 10 : 100;

  return {
    queueLength: pending.count ?? 0,
    successRate24h,
    cronFailureAll: cronFailureAll.count ?? 0,
  } satisfies CronOperationsSnapshot;
}

async function loadConsecutiveFailure(namespace: string): Promise<ConsecutiveFailureSnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const threshold = parseNum(process.env.BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES, 3);
  const { data } = await supabaseAdmin
    .from("cron_runs")
    .select("status")
    .eq("namespace", namespace)
    .order("started_at", { ascending: false })
    .limit(threshold);

  let count = 0;
  for (const row of (data ?? []) as Array<{ status: string }>) {
    if (row.status !== "failed") break;
    count += 1;
  }

  return { count, threshold };
}

async function sendWebhook(webhookUrl: string, payload: Record<string, unknown>) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Webhook failed (${res.status}): ${body}`);
  }
}

function buildTargetsForSeverity(severity: AlertSeverity): WebhookTarget[] {
  const targets: WebhookTarget[] = [];
  const seen = new Set<string>();
  const add = (channel: WebhookChannel, raw: string | undefined) => {
    for (const url of parseWebhookList(raw)) {
      const trimmed = url.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      targets.push({ channel, url: trimmed });
    }
  };

  const baseGeneric = [...parseWebhookList(process.env.BRIGHTDESK_CRON_WEBHOOK_URLS)];
  const fallback = process.env.BRIGHTDESK_CRON_WEBHOOK_URL;
  if (fallback) {
    baseGeneric.push(fallback);
  }

  add("generic", baseGeneric.join(","));
  add("slack", process.env.BRIGHTDESK_SLACK_WEBHOOK_URL);
  add("discord", process.env.BRIGHTDESK_DISCORD_WEBHOOK_URL);

  if (severity === "critical") {
    add("generic", process.env.BRIGHTDESK_CRON_CRITICAL_WEBHOOK_URLS);
    add("slack", process.env.BRIGHTDESK_CRON_CRITICAL_SLACK_WEBHOOK_URL);
    add("discord", process.env.BRIGHTDESK_CRON_CRITICAL_DISCORD_WEBHOOK_URL);
  } else {
    add("generic", process.env.BRIGHTDESK_CRON_WARNING_WEBHOOK_URLS);
    add("slack", process.env.BRIGHTDESK_CRON_WARNING_SLACK_WEBHOOK_URL);
    add("discord", process.env.BRIGHTDESK_CRON_WARNING_DISCORD_WEBHOOK_URL);
  }

  return targets;
}

function buildChannelPayload(channel: WebhookChannel, base: Record<string, unknown>) {
  if (channel === "discord") {
    return { content: base.text, ...base };
  }
  return base;
}

function formatMessage(ctx: CronRunContext, snapshot: CronOperationsSnapshot) {
  const failureCategories = ctx.status === "failed" && ctx.reason ? toFailureCategories(ctx.reason) : [];
  const lines = [
    `[BrightDesk Ops] ${ctx.namespace} ${ctx.status.toUpperCase()}`,
    `run_key: ${ctx.runKey}`,
    `queue: ${snapshot.queueLength}`,
    `24h success: ${snapshot.successRate24h.toFixed(1)}%`,
    `24h failures: ${snapshot.cronFailureAll}`,
  ];
  if (ctx.runDurationMs) {
    lines.push(`duration_ms: ${ctx.runDurationMs}`);
  }
  if (ctx.status === "failed" && failureCategories.length > 0) {
    lines.push(`failure_categories: ${summarizeFailureCategories(failureCategories)}`);
  }
  if (ctx.reason) lines.push(`reason: ${ctx.reason}`);
  return lines.join("\n");
}

function buildDefaultMessage(
  ctx: CronRunContext,
  snapshot: CronOperationsSnapshot,
  consecutiveFailure: ConsecutiveFailureSnapshot,
) {
  const summary = formatMessage(ctx, snapshot);
  if (ctx.status === "failed") {
    return {
      severity: "critical" as const,
      summary,
      escalation: null,
    } satisfies CronAlertMessage;
  }

  if (snapshot.successRate24h < 95 || snapshot.queueLength >= 150 || snapshot.cronFailureAll >= 20) {
    const isEscalated = consecutiveFailure.count >= consecutiveFailure.threshold;
    if (isEscalated) {
      return {
        severity: "critical" as const,
        summary: `🚨 Escalated by consecutive failures (${consecutiveFailure.count}/${consecutiveFailure.threshold})\n${summary}`,
        escalation: {
          count: consecutiveFailure.count,
          threshold: consecutiveFailure.threshold,
          reason: "consecutive_failures",
        },
      } satisfies CronAlertMessage;
    }

    return {
      severity: "warning" as const,
      summary: `⚠️ BrightDesk Ops threshold crossed\n${summary}`,
      escalation: null,
    } satisfies CronAlertMessage;
  }

  return null;
}

export async function notifyCronRunComplete(context: CronRunContext) {
  const cfg = getServerConfig();
  const [snapshot, consecutiveFailure] = await Promise.all([
    loadCronSnapshot(),
    loadConsecutiveFailure(context.namespace),
  ]);

  const alert = buildDefaultMessage(context, snapshot, consecutiveFailure);
  if (!alert) return;

  const targets = buildTargetsForSeverity(alert.severity);
  if (targets.length === 0) return;

  if (cfg.nodeEnv === "development" && !process.env.BRIGHTDESK_CRON_ALERT_ALLOW_IN_DEV) {
    return;
  }

  const cooldownMinutes = parseNum(process.env.BRIGHTDESK_CRON_ALERT_COOLDOWN_MINUTES, 60);
  const finalAlertKey = `cron:${context.namespace}:${alert.severity}:${Math.floor(
    Date.now() / (cooldownMinutes * 60_000),
  )}`;
  if (shouldThrottle(finalAlertKey, cooldownMinutes)) return;

  const payload = {
    text: alert.summary,
    level: alert.severity,
    namespace: context.namespace,
    run_key: context.runKey,
    run_status: context.status,
    escalation: alert.escalation,
  };

  for (const target of targets) {
    try {
      await sendWebhook(target.url, buildChannelPayload(target.channel, payload));
    } catch {
      continue;
    }
  }
}
