import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TickerSchema = z.object({
  ticker: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-^]+$/),
});

export const refreshTicker = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    TickerSchema.extend({
      range: z.enum(["3mo", "6mo", "1y", "2y"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { refreshTickerPrices } = await import("./prices.server");
    return refreshTickerPrices(data.ticker, data.range ?? "1y");
  });

export const getTickerChart = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => TickerSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = data.ticker.toUpperCase();
    const [pRes, iRes] = await Promise.all([
      supabaseAdmin
        .from("prices")
        .select("date,open,high,low,close,volume")
        .eq("ticker", t)
        .order("date", { ascending: true })
        .limit(500),
      supabaseAdmin
        .from("indicators")
        .select("date,rsi14,macd,macd_signal,macd_hist,ma20,ma60,ma120")
        .eq("ticker", t)
        .order("date", { ascending: true })
        .limit(500),
    ]);
    if (pRes.error) throw new Error(pRes.error.message);
    if (iRes.error) throw new Error(iRes.error.message);
    return {
      ticker: t,
      prices: pRes.data ?? [],
      indicators: iRes.data ?? [],
    };
  });
