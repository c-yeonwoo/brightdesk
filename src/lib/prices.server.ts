import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeIndicators, type PriceRow } from "./indicators";

// Yahoo Finance chart endpoint (no key required). Range examples: 3mo, 6mo, 1y, 2y.
export async function fetchYahooDaily(
  symbol: string,
  range: "3mo" | "6mo" | "1y" | "2y" = "1y",
): Promise<PriceRow[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KBMonitor/1.0)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const j = (await res.json()) as any;
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: empty result`);
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens: (number | null)[] = q.open ?? [];
  const highs: (number | null)[] = q.high ?? [];
  const lows: (number | null)[] = q.low ?? [];
  const closes: (number | null)[] = q.close ?? [];
  const vols: (number | null)[] = q.volume ?? [];

  const rows: PriceRow[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    if (c == null || o == null || h == null || l == null) continue;
    const d = new Date(ts[i] * 1000);
    const iso = d.toISOString().slice(0, 10);
    rows.push({
      date: iso,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: vols[i] ?? 0,
    });
  }
  return rows;
}

export async function refreshTickerPrices(ticker: string, range: "3mo" | "6mo" | "1y" | "2y" = "1y") {
  const t = ticker.toUpperCase();
  const rows = await fetchYahooDaily(t, range);
  if (rows.length === 0) return { ticker: t, inserted: 0, indicators: 0 };

  // upsert prices
  const priceRows = rows.map((r) => ({
    ticker: t,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    source: "yahoo",
  }));
  const { error: pErr } = await (supabaseAdmin.from("prices") as any).upsert(priceRows, {
    onConflict: "ticker,date",
  });
  if (pErr) throw new Error(`prices upsert: ${pErr.message}`);

  // compute + upsert indicators
  const ind = computeIndicators(rows);
  const indRows = ind.map((r) => ({ ticker: t, ...r }));
  const { error: iErr } = await (supabaseAdmin.from("indicators") as any).upsert(indRows, {
    onConflict: "ticker,date",
  });
  if (iErr) throw new Error(`indicators upsert: ${iErr.message}`);

  return { ticker: t, inserted: rows.length, indicators: ind.length };
}
