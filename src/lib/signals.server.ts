import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SignalKind = "BUY" | "SELL" | "HOLD";

export interface SignalRow {
  ticker: string;
  ts: string;
  kind: SignalKind;
  score: number;
  reasons: string[];
  rsi14: number | null;
  macd_hist: number | null;
  fact_ids: string[];
}

interface IndicatorRow {
  date: string;
  rsi14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
}

interface PriceRow {
  date: string;
  close: number;
}

interface FactRow {
  id: string;
  title: string;
  sentiment: number | null;
  reliability: number | null;
  updated_at: string;
}

// Rule-based scoring: combine technicals + KB sentiment.
// Returns one signal per ticker for "now" using the latest indicator + recent facts.
export function computeSignal(args: {
  ticker: string;
  latestPrice: PriceRow | null;
  latestInd: IndicatorRow | null;
  prevInd: IndicatorRow | null;
  facts: FactRow[];
}): SignalRow | null {
  const { ticker, latestPrice, latestInd, prevInd, facts } = args;
  if (!latestPrice || !latestInd) return null;

  const reasons: string[] = [];
  let score = 0;

  // --- Technical signals (range roughly -3..+3) ---
  const rsi = latestInd.rsi14;
  if (rsi != null) {
    if (rsi < 30) {
      score += 1.5;
      reasons.push(`RSI 과매도 (${rsi.toFixed(1)})`);
    } else if (rsi > 70) {
      score -= 1.5;
      reasons.push(`RSI 과매수 (${rsi.toFixed(1)})`);
    }
  }

  const mh = latestInd.macd_hist;
  const pmh = prevInd?.macd_hist ?? null;
  if (mh != null && pmh != null) {
    if (pmh <= 0 && mh > 0) {
      score += 1;
      reasons.push("MACD 골든크로스");
    } else if (pmh >= 0 && mh < 0) {
      score -= 1;
      reasons.push("MACD 데드크로스");
    }
  }

  // MA trend: price vs MA20 / MA60
  if (latestInd.ma20 != null && latestInd.ma60 != null) {
    if (latestInd.ma20 > latestInd.ma60 && latestPrice.close > latestInd.ma20) {
      score += 0.5;
      reasons.push("상승추세 (MA20>MA60)");
    } else if (latestInd.ma20 < latestInd.ma60 && latestPrice.close < latestInd.ma20) {
      score -= 0.5;
      reasons.push("하락추세 (MA20<MA60)");
    }
  }

  // --- KB sentiment (range roughly -2..+2) ---
  let factIds: string[] = [];
  if (facts.length > 0) {
    // weighted average sentiment by reliability
    let num = 0;
    let den = 0;
    for (const f of facts) {
      const s = f.sentiment ?? 0;
      const w = f.reliability ?? 0.5;
      num += s * w;
      den += w;
    }
    const weighted = den > 0 ? num / den : 0;
    const factor = Math.min(facts.length / 3, 1); // need 3+ facts for full weight
    const contrib = weighted * 2 * factor;
    score += contrib;
    factIds = facts.slice(0, 8).map((f) => f.id);
    if (Math.abs(weighted) >= 0.3 && facts.length >= 2) {
      reasons.push(
        `KB 감성 ${weighted >= 0 ? "긍정" : "부정"} ${weighted.toFixed(2)} (${facts.length}건)`,
      );
    }
  }

  // --- Decision ---
  let kind: SignalKind = "HOLD";
  if (score >= 1.5) kind = "BUY";
  else if (score <= -1.5) kind = "SELL";

  if (reasons.length === 0) reasons.push("뚜렷한 시그널 없음 — 관망");

  return {
    ticker,
    ts: new Date().toISOString(),
    kind,
    score: Math.round(score * 100) / 100,
    reasons,
    rsi14: rsi,
    macd_hist: mh,
    fact_ids: factIds,
  };
}

async function loadTickerInputs(ticker: string) {
  const t = ticker.toUpperCase();
  const [priceRes, indRes, factRes] = await Promise.all([
    supabaseAdmin
      .from("prices")
      .select("date,close")
      .eq("ticker", t)
      .order("date", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("indicators")
      .select("date,rsi14,macd,macd_signal,macd_hist,ma20,ma60,ma120")
      .eq("ticker", t)
      .order("date", { ascending: false })
      .limit(2),
    supabaseAdmin
      .from("kb_facts")
      .select("id,title,sentiment,reliability,updated_at,is_active,related_tickers")
      .eq("is_active", true)
      .contains("related_tickers", [t])
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  if (priceRes.error) throw new Error(priceRes.error.message);
  if (indRes.error) throw new Error(indRes.error.message);
  if (factRes.error) throw new Error(factRes.error.message);

  const ind = (indRes.data ?? []) as IndicatorRow[];
  // facts within 14d
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  const facts = ((factRes.data ?? []) as FactRow[]).filter(
    (f) => new Date(f.updated_at).getTime() >= cutoff,
  );

  return {
    latestPrice: (priceRes.data?.[0] as PriceRow | undefined) ?? null,
    latestInd: ind[0] ?? null,
    prevInd: ind[1] ?? null,
    facts,
  };
}

export async function generateSignalForTicker(ticker: string) {
  const t = ticker.toUpperCase();
  const inputs = await loadTickerInputs(t);
  const sig = computeSignal({ ticker: t, ...inputs });
  if (!sig) return { ticker: t, inserted: false, reason: "no price/indicator data" };

  const { error } = await (supabaseAdmin.from("signals") as any).insert({
    ticker: sig.ticker,
    ts: sig.ts,
    kind: sig.kind,
    score: sig.score,
    reasons: sig.reasons,
    rsi14: sig.rsi14,
    macd_hist: sig.macd_hist,
    fact_ids: sig.fact_ids,
  });
  if (error) throw new Error(`signals insert: ${error.message}`);
  return { ticker: t, inserted: true, kind: sig.kind, score: sig.score };
}

export async function generateSignalsForAll() {
  // distinct tickers with prices
  const { data, error } = await supabaseAdmin
    .from("prices")
    .select("ticker")
    .limit(1000);
  if (error) throw new Error(error.message);
  const tickers = Array.from(new Set((data ?? []).map((r: any) => r.ticker as string)));
  const out: { ticker: string; kind?: string; score?: number; reason?: string }[] = [];
  for (const t of tickers) {
    try {
      const r = await generateSignalForTicker(t);
      out.push(r as any);
    } catch (e: any) {
      out.push({ ticker: t, reason: e?.message ?? String(e) });
    }
  }
  return { count: tickers.length, results: out };
}
