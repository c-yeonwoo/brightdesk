import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { finalizeCronRun, registerCronRun, requireCronRequest } from "@/lib/cron.server";
import { getMonitoringUniverseAsync, getMonitoringUniverseStats } from "@/lib/monitoring-universe.server";

type BackfillRange = "3mo" | "6mo" | "1y" | "2y";

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRange(raw: string | null | undefined): BackfillRange {
  if (raw === "3mo" || raw === "6mo" || raw === "1y" || raw === "2y") return raw;
  return (process.env.BRIGHTDESK_MARKET_BACKFILL_RANGE as BackfillRange) || "3mo";
}

function parseTickerList(raw: string | null | undefined) {
  return (raw ?? "")
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

async function runBatched<T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((item) => worker(item)));
    out.push(...results);
  }
  return out;
}

export const Route = createFileRoute("/api/public/cron/backfill-market")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        let runKey = "";
        let failed = false;
        const log: Record<string, any> = {};

        try {
          requireCronRequest();
          const registered = await registerCronRun("cron.backfill-market", {
            windowMinutes: parsePositiveInt(process.env.BRIGHTDESK_MARKET_BACKFILL_WINDOW_MINUTES, 720),
          });
          runKey = registered.runKey;
          if (registered.isDuplicate) {
            return Response.json({ ok: false, skipped: true, runKey });
          }
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
                ? "CRON_SECRET 값과 요청 헤더 x-cron-secret 값을 맞춘 뒤 다시 실행해 주세요."
                : "백필 실행 이력 등록 전 단계에서 실패했습니다. Supabase env와 cron_runs migration을 확인해 주세요.",
            },
            { status: isAuthError ? 401 : 500 },
          );
        }

        try {
          const requestUrl = new URL(getRequest().url);
          const range = parseRange(requestUrl.searchParams.get("range"));
          const explicitTickers = parseTickerList(requestUrl.searchParams.get("tickers"));
          const limit = parsePositiveInt(
            requestUrl.searchParams.get("limit") ?? process.env.BRIGHTDESK_MARKET_BACKFILL_LIMIT,
            220,
          );
          const batchSize = parsePositiveInt(process.env.BRIGHTDESK_MARKET_BACKFILL_BATCH_SIZE, 8);
          const tickers = (explicitTickers.length > 0 ? explicitTickers : await getMonitoringUniverseAsync()).slice(0, limit);

          log.universe = getMonitoringUniverseStats();
          log.range = range;
          log.limit = limit;
          log.batch_size = batchSize;
          log.tickers = tickers;

          const { refreshTickerPrices } = await import("@/lib/prices.server");
          const priceResults = await runBatched(tickers, batchSize, async (ticker) => {
            try {
              return await refreshTickerPrices(ticker, range);
            } catch (error: any) {
              return { ticker, inserted: 0, indicators: 0, error: error?.message ?? String(error) };
            }
          });

          const priceErrors = priceResults.filter((r: any) => r.error);
          log.prices = {
            requested: tickers.length,
            succeeded: priceResults.length - priceErrors.length,
            failed: priceErrors.length,
            rows: priceResults.reduce((sum: number, r: any) => sum + (Number(r.inserted) || 0), 0),
            indicators: priceResults.reduce((sum: number, r: any) => sum + (Number(r.indicators) || 0), 0),
            errors: priceErrors.slice(0, 20),
          };

          const { runCollection, runRefiner, runTickerResearchCollection } = await import("@/lib/collectors.server");
          log.collection = await runCollection({ includeTickerResearch: false });
          log.ticker_research = await runTickerResearchCollection({ runKey });
          log.refined = await runRefiner(parsePositiveInt(process.env.BRIGHTDESK_MARKET_BACKFILL_REFINE_LIMIT, 40));

          const { generateSignalsForAll } = await import("@/lib/signals.server");
          log.signals = await generateSignalsForAll();

          const { evaluateSignalOutcomes } = await import("@/lib/outcomes.server");
          log.outcomes = await evaluateSignalOutcomes(parsePositiveInt(process.env.BRIGHTDESK_MARKET_BACKFILL_OUTCOME_LIMIT, 300));

          const { recordMarketDeskSnapshot } = await import("@/lib/market.functions");
          log.dashboard_snapshot = await recordMarketDeskSnapshot(runKey);
        } catch (error: any) {
          failed = true;
          log.error = error?.message ?? String(error);
        }

        try {
          await finalizeCronRun(
            runKey,
            failed ? "failed" : "success",
            failed ? "Market backfill failed" : undefined,
            "cron.backfill-market",
            Date.now() - startedAt,
          );
        } catch (error: any) {
          failed = true;
          log.finalize_error = error?.message ?? String(error);
        }

        return Response.json(
          {
            ok: !failed,
            skipped: false,
            runKey,
            ts: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            ...log,
          },
          { status: failed ? 500 : 200 },
        );
      },
      GET: async () => Response.json({ ok: true, hint: "POST to backfill market prices, indicators, signals and dashboard snapshot" }),
    },
  },
});
