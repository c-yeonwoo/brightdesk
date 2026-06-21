import { createFileRoute } from "@tanstack/react-router";
import { finalizeCronRun, registerCronRun, requireCronRequest } from "@/lib/cron.server";

// Market session refresh: 수집 → 시그널 생성 → 레짐 점검 → SL/TP 청산 → Track A 자동 운용 → 스냅샷.
// 운영 스케줄은 KST 장 흐름에 맞춰 08:45, 10:00, 15:00, 17:00 하루 4회 실행한다.
type RetryResult<T> = {
  value: T | null;
  attempts: number;
  retried: boolean;
  error?: string;
};

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runWithRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number,
): Promise<RetryResult<T>> {
  let attempt = 0;
  let lastError = "cron 단계 실패";

  while (attempt < attempts) {
    attempt += 1;
    try {
      const value = await fn();
      return {
        value,
        attempts: attempt,
        retried: attempt > 1,
      };
    } catch (error: any) {
      lastError = error?.message ?? String(error);
      if (attempt >= attempts) break;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  return {
    value: null,
    attempts,
    retried: attempts > 1,
    error: lastError,
  };
}

export const Route = createFileRoute("/api/public/cron/hourly-rebalance")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        let runKey = "";
        let isDuplicate = false;

        try {
          requireCronRequest();
          const registered = await registerCronRun("cron.hourly-rebalance", {
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

        const baseAttempts = parsePositiveInt(process.env.BRIGHTDESK_CRON_RETRY_ATTEMPTS, 1);
        const baseDelayMs = parsePositiveInt(process.env.BRIGHTDESK_CRON_RETRY_DELAY_MS, 10_000);
        const tradeSafeAttempts = parsePositiveInt(
          process.env.BRIGHTDESK_HOURLY_REBALANCE_RETRY_ATTEMPTS ?? `${baseAttempts}`,
          baseAttempts,
        );
        const tradeSafeDelayMs = parsePositiveInt(
          process.env.BRIGHTDESK_HOURLY_REBALANCE_RETRY_DELAY_MS ?? `${baseDelayMs}`,
          baseDelayMs,
        );

        const log: Record<string, any> = {};
        let failed = false;
        const retryMeta: Record<string, any> = {};

        // 1) 수집/정제(재시도 허용)
        const collectResult = await runWithRetry(
          async () => {
            const { runCollection, runRefiner, runTickerResearchCollection } = await import("@/lib/collectors.server");
            const collected = await runCollection({ includeTickerResearch: false });
            const tickerResearch = await runTickerResearchCollection({ runKey });
            const refined = await runRefiner(20);
            return { collected, tickerResearch, refined };
          },
          tradeSafeAttempts,
          tradeSafeDelayMs,
        );

        retryMeta.collect = { attempts: collectResult.attempts, retried: collectResult.retried };
        if (collectResult.value) {
          log.collected = collectResult.value.collected;
          log.ticker_research = collectResult.value.tickerResearch;
          log.refined = collectResult.value.refined;
        } else {
          failed = true;
          log.collect_error = `${collectResult.error} (attempt ${collectResult.attempts}/${tradeSafeAttempts})`;
        }

        // 2) 환율 갱신(재시도 허용)
        const fxResult = await runWithRetry(
          async () => {
            const { refreshFxHistory } = await import("@/lib/fx.server");
            return refreshFxHistory();
          },
          tradeSafeAttempts,
          tradeSafeDelayMs,
        );

        retryMeta.fx = { attempts: fxResult.attempts, retried: fxResult.retried };
        if (fxResult.value !== null) {
          log.fx = fxResult.value;
        } else {
          failed = true;
          log.fx_error = `${fxResult.error} (attempt ${fxResult.attempts}/${tradeSafeAttempts})`;
        }

        // 3) 시그널 생성(재시도 허용)
        const priceSeedResult = await runWithRetry(
          async () => {
            const { refreshTickerPrices } = await import("@/lib/prices.server");
            const tickers = (process.env.BRIGHTDESK_PAPER_STARTER_TICKERS ?? "SPY,QQQ,SMH,TLT,GLD")
              .split(",")
              .map((ticker) => ticker.trim().toUpperCase())
              .filter(Boolean)
              .slice(0, 12);
            const results = [];
            for (const ticker of tickers) {
              try {
                results.push(await refreshTickerPrices(ticker, "1y"));
              } catch (error: any) {
                results.push({ ticker, error: error?.message ?? String(error) });
              }
            }
            return { tickers, results };
          },
          tradeSafeAttempts,
          tradeSafeDelayMs,
        );

        retryMeta.price_seed = { attempts: priceSeedResult.attempts, retried: priceSeedResult.retried };
        if (priceSeedResult.value !== null) {
          log.price_seed = priceSeedResult.value;
        } else {
          failed = true;
          log.price_seed_error = `${priceSeedResult.error} (attempt ${priceSeedResult.attempts}/${tradeSafeAttempts})`;
        }

        // 4) 시그널 생성(재시도 허용)
        const signalsResult = await runWithRetry(
          async () => {
            const { generateSignalsForAll } = await import("@/lib/signals.server");
            return generateSignalsForAll();
          },
          tradeSafeAttempts,
          tradeSafeDelayMs,
        );

        retryMeta.signals = { attempts: signalsResult.attempts, retried: signalsResult.retried };
        if (signalsResult.value !== null) {
          log.signals = signalsResult.value;
        } else {
          failed = true;
          log.signals_error = `${signalsResult.error} (attempt ${signalsResult.attempts}/${tradeSafeAttempts})`;
        }

        // 5) 시장 레짐 평가(재시도 허용)
        let regime: any = null;
        const regimeResult = await runWithRetry(
          async () => {
            const { getMarketRegime } = await import("@/lib/regime.server");
            regime = await getMarketRegime("^KS11");
            return { regime };
          },
          tradeSafeAttempts,
          tradeSafeDelayMs,
        );

        retryMeta.regime = { attempts: regimeResult.attempts, retried: regimeResult.retried };
        if (regimeResult.value !== null && regimeResult.value.regime) {
          log.regime = {
            kind: regime.regime,
            score: regime.score,
            mult: regime.confidence_multiplier,
          };
        } else {
          failed = true;
          log.regime_error = `${regimeResult.error} (attempt ${regimeResult.attempts}/${tradeSafeAttempts})`;
        }

        // 6) 트레이드 적용 및 스냅샷(실제 side-effect로 재시도 비권장)
        if (!failed) {
          try {
            const {
              getOrCreateSystemPortfolio,
              applyAllRecentSignals,
              applyStarterPaperAllocation,
              snapshotPortfolio,
              executeSignal,
            } = await import("@/lib/portfolio.server");
            const { checkExits, serializeSellReason } = await import("@/lib/risk.server");
            const pf = await getOrCreateSystemPortfolio();

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

            log.applied = await applyAllRecentSignals(pf.id, 2, {
              blockBuys: regime?.regime === "BEAR",
              confidenceMultiplier: regime?.confidence_multiplier ?? 1,
            } as any);
            if ((log.applied?.applied ?? 0) === 0) {
              log.starter_allocation = await applyStarterPaperAllocation(pf.id, {
                blockBuys: regime?.regime === "BEAR",
              });
            }
            log.snapshot = await snapshotPortfolio(pf.id);
          } catch (e: any) {
            failed = true;
            log.trade_error = e?.message ?? String(e);
          }
        } else {
          log.trade_skipped = true;
          log.trade_skip_reason = "preflight_failures_detected";
          log.outcomes_skipped = true;
          log.outcomes_skip_reason = "preflight_failures_detected";
        }

        // 6) 성과 산정(신규 평가 기준이 선행 단계를 의존)
        if (!failed) {
          try {
            const { evaluateSignalOutcomes } = await import("@/lib/outcomes.server");
            log.outcomes = await evaluateSignalOutcomes(50);
          } catch (e: any) {
            failed = true;
            log.outcomes_error = e?.message ?? String(e);
          }
        }

        if (!failed) {
          try {
            const { recordMarketDeskSnapshot } = await import("@/lib/market.functions");
            log.dashboard_snapshot = await recordMarketDeskSnapshot(runKey);
          } catch (e: any) {
            failed = true;
            log.dashboard_snapshot_error = e?.message ?? String(e);
          }
        }

        try {
          await finalizeCronRun(
            runKey,
            failed ? "failed" : "success",
            failed ? `Hourly-rebalance preflight/trade check failed (retry plan: attempts=${tradeSafeAttempts})` : undefined,
            "cron.hourly-rebalance",
            Date.now() - startedAt,
          );
        } catch (e) {
          failed = true;
          log.finalize_error = e instanceof Error ? e.message : String(e);
        }

        if (failed) {
          return Response.json(
            {
              ok: false,
              skipped: false,
              runKey,
              ts: new Date().toISOString(),
              duration_ms: Date.now() - startedAt,
              retry_meta: retryMeta,
              ...log,
            },
            { status: 500 },
          );
        }

        return Response.json({
          ok: true,
          runKey,
          ts: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          retry_meta: retryMeta,
          ...log,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run hourly cycle" }),
    },
  },
});
