import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TickerSchema = z.object({
  ticker: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-^]+$/),
});

export const generateSignal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TickerSchema.parse(d))
  .handler(async ({ data }) => {
    const { generateSignalForTicker } = await import("./signals.server");
    return generateSignalForTicker(data.ticker);
  });

export const generateAllSignals = createServerFn({ method: "POST" }).handler(async () => {
  const { generateSignalsForAll } = await import("./signals.server");
  return generateSignalsForAll();
});

export const listSignals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ticker: z.string().min(1).max(20).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("signals")
      .select("id,ticker,ts,kind,score,reasons,rsi14,macd_hist,fact_ids")
      .order("ts", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.ticker) q = q.eq("ticker", data.ticker.toUpperCase());
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLatestSignalPerTicker = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // get up to 500 recent signals then dedupe per ticker client-side (simple)
  const { data, error } = await supabaseAdmin
    .from("signals")
    .select("id,ticker,ts,kind,score,reasons,rsi14,macd_hist,fact_ids")
    .order("ts", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of data ?? []) {
    if (seen.has((r as any).ticker)) continue;
    seen.add((r as any).ticker);
    out.push(r);
  }
  return out;
});
