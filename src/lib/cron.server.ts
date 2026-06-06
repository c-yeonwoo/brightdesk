import { getRequest } from "@tanstack/react-start/server";
import { timingSafeEqual } from "node:crypto";
import { notifyCronRunComplete } from "@/lib/cron-alert.server";

type CronRunOptions = {
  windowMinutes?: number;
  providedRunId?: string;
};

type CronRunResult = {
  runKey: string;
  isDuplicate: boolean;
};

/**
 * Cron 보안을 위한 최소 검증
 * - 헤더 우선순위: Authorization: Bearer <token> 또는 X-BRIGHTDESK-CRON-TOKEN
 * - 운영 환경에서 CRON_SECRET / BRIGHTDESK_CRON_TOKEN 미설정 시 실행 차단
 */
export function requireCronRequest() {
  const req = getRequest();
  const headerToken =
    req.headers.get("x-brightdesk-cron-token") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer /i, "");
  const secret = process.env.CRON_SECRET || process.env.BRIGHTDESK_CRON_TOKEN;

  if (!secret) {
    throw new Error(
      "CRON 인증 설정 미완료: CRON_SECRET 또는 BRIGHTDESK_CRON_TOKEN 환경변수를 설정해 주세요.",
    );
  }

  if (!headerToken) {
    throw new Error(
    "Cron 인증 토큰 누락: X-BRIGHTDESK-CRON-TOKEN, X-CRON-SECRET 또는 Authorization Bearer 헤더가 필요합니다.",
  );
}

  const token = headerToken.trim();
  if (!token) {
    throw new Error("Cron 인증 토큰 길이 오류");
  }

  const tokenBuf = Buffer.from(token, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");
  if (tokenBuf.length !== secretBuf.length) {
    throw new Error("Cron 인증 토큰이 일치하지 않습니다.");
  }

  const ok = timingSafeEqual(tokenBuf, secretBuf);
  if (!ok) {
    throw new Error("Cron 인증 토큰이 일치하지 않습니다.");
  }

  return true;
}

function formatBucketRunKey(namespace: string, windowMinutes: number) {
  const bucketMinutes = Math.max(1, Math.floor(Date.now() / (windowMinutes * 60_000)));
  return `${namespace}:bucket:${bucketMinutes}`;
}

export async function registerCronRun(
  namespace: string,
  options: CronRunOptions = {},
): Promise<CronRunResult> {
  const req = getRequest();
  const { windowMinutes = 60, providedRunId } = options;
  const explicitRunId =
    (providedRunId ?? req.headers.get("x-brightdesk-cron-run-id") ?? "").trim();
  const runKey = explicitRunId
    ? `${namespace}:run:${explicitRunId}`
    : formatBucketRunKey(namespace, windowMinutes);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("cron_runs")
    .insert({
      namespace,
      run_key: runKey,
      request_id: explicitRunId || null,
      status: "running",
      request_method: req.method,
      request_url: req.url,
    });

  if (error) {
    if (String(error.code) === "23505") {
      return { runKey, isDuplicate: true };
    }
    throw error;
  }

  return { runKey, isDuplicate: false };
}

export async function finalizeCronRun(
  runKey: string,
  status: "success" | "failed",
  reason?: string,
  namespace?: string,
  runDurationMs?: number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any)
    .from("cron_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: reason ?? null,
    })
    .eq("run_key", runKey)
    .maybeSingle();

  if (namespace) {
    void notifyCronRunComplete({
      namespace,
      runKey,
      status,
      reason,
      runDurationMs,
    }).catch((error) => {
      console.error("[cron-alert]", error instanceof Error ? error.message : String(error));
    });
  }
}
