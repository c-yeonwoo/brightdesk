import { createFileRoute } from "@tanstack/react-router";

// 1시간마다 자동 실행: 수집 → 시그널 생성 → Track A 자동 운용 → 스냅샷.
export const Route = createFileRoute("/api/public/cron/hourly-rebalance")({
  server: {
    handlers: {
      POST: async () => {
        const start = Date.now();
        const log: Record<string, any> = {};
        try {
          const { runCollection, runRefiner } = await import("@/lib/collectors.server");
          log.collected = await runCollection();
          log.refined = await runRefiner(20);
        } catch (e: any) {
          log.collect_error = e?.message ?? String(e);
        }

        try {
          const { generateSignalsForAll } = await import("@/lib/signals.server");
          log.signals = await generateSignalsForAll();
        } catch (e: any) {
          log.signals_error = e?.message ?? String(e);
        }

        try {
          const { getOrCreateSystemPortfolio, applyAllRecentSignals, snapshotPortfolio } =
            await import("@/lib/portfolio.server");
          const pf = await getOrCreateSystemPortfolio();
          // 최근 1시간 내 시그널만 적용 (과매매 방지)
          log.applied = await applyAllRecentSignals(pf.id, 2);
          log.snapshot = await snapshotPortfolio(pf.id);
        } catch (e: any) {
          log.trade_error = e?.message ?? String(e);
        }

        try {
          const { evaluateSignalOutcomes } = await import("@/lib/outcomes.server");
          log.outcomes = await evaluateSignalOutcomes(50);
        } catch (e: any) {
          log.outcomes_error = e?.message ?? String(e);
        }

        return Response.json({
          ok: true,
          ts: new Date().toISOString(),
          duration_ms: Date.now() - start,
          ...log,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run hourly cycle" }),
    },
  },
});
