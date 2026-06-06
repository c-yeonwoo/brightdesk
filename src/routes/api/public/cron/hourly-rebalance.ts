import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret } from "@/lib/cron-auth";

// 1시간마다 자동 실행: 수집 → 시그널 생성 → 레짐 점검 → SL/TP 청산 → Track A 자동 운용 → 스냅샷.
// Requires `x-cron-secret` header matching the CRON_SECRET project secret.
export const Route = createFileRoute("/api/public/cron/hourly-rebalance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = verifyCronSecret(request);
        if (unauthorized) return unauthorized;
        const start = Date.now();
        const log: Record<string, any> = {};

        try {
          const { runCollection, runRefiner } = await import("@/lib/collectors.server");
          log.collected = await runCollection();
          log.refined = await runRefiner(20);
        } catch (e: any) {
          log.collect_error = e?.message ?? String(e);
        }

        // 환율(USD/KRW) 갱신 — 미국주 KRW 환산용
        try {
          const { refreshFxHistory } = await import("@/lib/fx.server");
          log.fx = await refreshFxHistory();
        } catch (e: any) {
          log.fx_error = e?.message ?? String(e);
        }

        try {
          const { generateSignalsForAll } = await import("@/lib/signals.server");
          log.signals = await generateSignalsForAll();
        } catch (e: any) {
          log.signals_error = e?.message ?? String(e);
        }

        // 시장 레짐 평가 (BUY 신뢰도 보정에 사용)
        let regime: any = null;
        try {
          const { getMarketRegime } = await import("@/lib/regime.server");
          regime = await getMarketRegime("^KS11");
          log.regime = { kind: regime.regime, score: regime.score, mult: regime.confidence_multiplier };
        } catch (e: any) {
          log.regime_error = e?.message ?? String(e);
        }

        try {
          const {
            getOrCreateSystemPortfolio,
            applyAllRecentSignals,
            snapshotPortfolio,
            executeSignal,
          } = await import("@/lib/portfolio.server");
          const { checkExits, serializeSellReason } = await import("@/lib/risk.server");
          const pf = await getOrCreateSystemPortfolio();

          // 1) 손절/익절 자동 청산 — sell_reason 라벨을 note로 동봉
          const exits = await checkExits(pf.id);
          const exitResults: any[] = [];
          for (const e of exits) {
            if (!e.triggered || !e.reason) continue;
            const r = await executeSignal({
              portfolioId: pf.id,
              ticker: e.ticker,
              kind: "SELL",
              signalDate: new Date().toISOString(),
              note: serializeSellReason(e.reason, e.message),
            } as any);
            exitResults.push({ ticker: e.ticker, reason: e.reason, ...r });
          }
          log.exits = { checked: exits.length, executed: exitResults.length, results: exitResults };

          // 2) 일반 시그널 적용 (BEAR 레짐이면 신규 BUY 차단)
          log.applied = await applyAllRecentSignals(pf.id, 2, {
            blockBuys: regime?.regime === "BEAR",
            confidenceMultiplier: regime?.confidence_multiplier ?? 1,
          } as any);
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
