import { createFileRoute } from "@tanstack/react-router";
import { finalizeCronRun, registerCronRun, requireCronRequest } from "@/lib/cron.server";

// Public cron endpoint — called hourly by pg_cron.
// and the only side effect is running the same logic the admin UI button runs.
export const Route = createFileRoute("/api/public/cron/collect")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        requireCronRequest();
        const { runKey, isDuplicate } = await registerCronRun("cron.collect", {
          windowMinutes: 60,
        });

        if (isDuplicate) {
          return Response.json({ ok: false, skipped: true, runKey });
        }

        const { runCollection, runRefiner } = await import("@/lib/collectors.server");
        const maxAttempts = Math.max(1, Number.parseInt(process.env.BRIGHTDESK_CRON_RETRY_ATTEMPTS ?? "", 10) || 1);
        const retryDelayMs = Math.max(0, Number.parseInt(process.env.BRIGHTDESK_CRON_RETRY_DELAY_MS ?? "", 10) || 10_000);

        const runOnce = async () => {
          const collected = await runCollection();
          const refined = await runRefiner(20);
          return { collected, refined };
        };

        let attempt = 0;
        let lastError = "크론 실행 실패";
        let result: { collected: any; refined: any } | null = null;

        while (attempt < maxAttempts && !result) {
          attempt += 1;
          try {
            result = await runOnce();
          } catch (error: any) {
            lastError = error?.message ?? String(error);
            if (attempt >= maxAttempts) {
              break;
            }
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

        const { collected, refined } = result;
        await finalizeCronRun(runKey, "success", undefined, "cron.collect", Date.now() - startedAt);
        const payload = {
          ok: true,
          ts: new Date().toISOString(),
          collected,
          refined,
        } as any;

        if (attempt > 1) {
          payload.attempts = attempt;
          payload.retried = true;
        }

        return Response.json(payload);
      },
      GET: async () => {
        requireCronRequest();
        return Response.json({ ok: true, hint: "POST to run" });
      },
    },
  },
});
