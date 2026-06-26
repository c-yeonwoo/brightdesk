import { createFileRoute } from "@tanstack/react-router";
import { finalizeCronRun, registerCronRun, requireCronRequest } from "@/lib/cron.server";

async function runCollectCron() {
  const startedAt = Date.now();
  let runKey = "";
  let isDuplicate = false;

  try {
    requireCronRequest();
    const registered = await registerCronRun("cron.collect", {
      windowMinutes: 60,
    });
    runKey = registered.runKey;
    isDuplicate = registered.isDuplicate;
  } catch (error: any) {
    const message = error?.message ?? String(error);
    const isAuthError =
      message.includes("CRON 인증") ||
      message.includes("Cron 인증") ||
      message.includes("토큰");

    return Response.json(
      {
        ok: false,
        error: message,
        hint: isAuthError
          ? "Vercel Environment Variables의 CRON_SECRET 값과 요청 헤더 x-cron-secret 값을 맞춘 뒤 재배포해 주세요."
          : "크론 실행 이력 등록 전 단계에서 실패했습니다. Supabase env와 cron_runs migration 적용 여부를 확인해 주세요.",
      },
      { status: isAuthError ? 401 : 500 },
    );
  }

  if (isDuplicate) {
    return Response.json({ ok: false, skipped: true, runKey });
  }

  const { runCollection, runRefiner, runTickerResearchCollection } = await import("@/lib/collectors.server");
  const maxAttempts = Math.max(1, Number.parseInt(process.env.BRIGHTDESK_CRON_RETRY_ATTEMPTS ?? "", 10) || 1);
  const retryDelayMs = Math.max(0, Number.parseInt(process.env.BRIGHTDESK_CRON_RETRY_DELAY_MS ?? "", 10) || 10_000);

  const runOnce = async () => {
    const collected = await runCollection({ includeTickerResearch: false });
    const tickerResearch = await runTickerResearchCollection({ runKey });
    const refined = await runRefiner(20);
    return { collected, tickerResearch, refined };
  };

  let attempt = 0;
  let lastError = "크론 실행 실패";
  let result: { collected: any; tickerResearch: any; refined: any } | null = null;

  while (attempt < maxAttempts && !result) {
    attempt += 1;
    try {
      result = await runOnce();
    } catch (error: any) {
      lastError = error?.message ?? String(error);
      if (attempt >= maxAttempts) break;
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  if (!result) {
    await finalizeCronRun(
      runKey,
      "failed",
      `${lastError} (attempt ${attempt}/${maxAttempts})`,
      "cron.collect",
      Date.now() - startedAt,
    );
    return Response.json(
      {
        ok: false,
        skipped: false,
        runKey,
        error: lastError,
        attempts: attempt,
      },
      { status: 500 },
    );
  }

  const { collected, tickerResearch, refined } = result;
  await finalizeCronRun(runKey, "success", undefined, "cron.collect", Date.now() - startedAt);
  const payload = {
    ok: true,
    ts: new Date().toISOString(),
    collected,
    tickerResearch,
    refined,
  } as any;

  if (attempt > 1) {
    payload.attempts = attempt;
    payload.retried = true;
  }

  return Response.json(payload);
}

// Public cron endpoint: hourly crawl/refine path.
export const Route = createFileRoute("/api/public/cron/collect")({
  server: {
    handlers: {
      POST: runCollectCron,
      GET: runCollectCron,
    },
  },
});
