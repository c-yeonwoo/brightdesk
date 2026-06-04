import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeFundamentalScore } from "./fundamentals.server";

export type SignalKind = "BUY" | "SELL" | "HOLD";

export interface ScoreComponent {
  score: number;
  reasons: string[];
}

export interface SignalRow {
  ticker: string;
  ts: string;
  kind: SignalKind;
  score: number;
  technical_score: number;
  fundamental_score: number;
  kb_score: number;
  weights: { technical: number; fundamental: number; kb: number };
  confidence: number;
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

interface PriceRow { date: string; close: number }
interface FactRow {
  id: string;
  title: string;
  sentiment: number | null;
  reliability: number | null;
  updated_at: string;
}

export const DEFAULT_WEIGHTS = { technical: 0.35, fundamental: 0.30, kb: 0.35 };

// 기술적 분석 점수 (-3 ~ +3)
export function computeTechnicalScore(args: {
  latestPrice: PriceRow;
  latestInd: IndicatorRow;
  prevInd: IndicatorRow | null;
}): ScoreComponent {
  const { latestPrice, latestInd, prevInd } = args;
  const reasons: string[] = [];
  let score = 0;

  const rsi = latestInd.rsi14;
  if (rsi != null) {
    if (rsi < 30) { score += 1.5; reasons.push(`RSI 과매도 ${rsi.toFixed(1)}`); }
    else if (rsi > 70) { score -= 1.5; reasons.push(`RSI 과매수 ${rsi.toFixed(1)}`); }
    else if (rsi < 45) { score += 0.3; reasons.push(`RSI 약세권 ${rsi.toFixed(1)}`); }
    else if (rsi > 55) { score -= 0.3; reasons.push(`RSI 강세권 ${rsi.toFixed(1)}`); }
  }
  const mh = latestInd.macd_hist;
  const pmh = prevInd?.macd_hist ?? null;
  if (mh != null && pmh != null) {
    if (pmh <= 0 && mh > 0) { score += 1; reasons.push("MACD 골든크로스"); }
    else if (pmh >= 0 && mh < 0) { score -= 1; reasons.push("MACD 데드크로스"); }
    else if (mh > 0) { score += 0.2; }
    else if (mh < 0) { score -= 0.2; }
  }
  if (latestInd.ma20 != null && latestInd.ma60 != null) {
    if (latestInd.ma20 > latestInd.ma60 && latestPrice.close > latestInd.ma20) {
      score += 0.5; reasons.push("상승추세 (MA20>MA60, 종가>MA20)");
    } else if (latestInd.ma20 < latestInd.ma60 && latestPrice.close < latestInd.ma20) {
      score -= 0.5; reasons.push("하락추세 (MA20<MA60, 종가<MA20)");
    }
  }
  if (reasons.length === 0) reasons.push("기술적 중립");
  return { score: Math.round(score * 100) / 100, reasons };
}

// KB 감성 점수 (-2 ~ +2) + fact_ids
export function computeKbScore(facts: FactRow[]): ScoreComponent & { fact_ids: string[] } {
  if (facts.length === 0) {
    return { score: 0, reasons: ["관련 KB Fact 없음"], fact_ids: [] };
  }
  let num = 0, den = 0;
  for (const f of facts) {
    const s = f.sentiment ?? 0;
    const w = f.reliability ?? 0.5;
    num += s * w;
    den += w;
  }
  const weighted = den > 0 ? num / den : 0;
  const factor = Math.min(facts.length / 3, 1);
  const score = weighted * 2 * factor;
  const reasons: string[] = [];
  if (Math.abs(weighted) >= 0.3 && facts.length >= 2) {
    reasons.push(`KB 감성 ${weighted >= 0 ? "긍정" : "부정"} ${weighted.toFixed(2)} · ${facts.length}건`);
  } else {
    reasons.push(`KB 감성 약함 ${weighted.toFixed(2)} · ${facts.length}건`);
  }
  return {
    score: Math.round(score * 100) / 100,
    reasons,
    fact_ids: facts.slice(0, 8).map((f) => f.id),
  };
}

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)); }

async function loadInputs(ticker: string) {
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

export async function computeSignalForTicker(
  ticker: string,
  weights = DEFAULT_WEIGHTS,
): Promise<SignalRow | null> {
  const t = ticker.toUpperCase();
  const inputs = await loadInputs(t);
  if (!inputs.latestPrice || !inputs.latestInd) return null;

  const tech = computeTechnicalScore({
    latestPrice: inputs.latestPrice,
    latestInd: inputs.latestInd,
    prevInd: inputs.prevInd,
  });
  const fund = await computeFundamentalScore(t);
  const kb = computeKbScore(inputs.facts);

  // weighted total: 각 컴포넌트의 평균 max 범위 ~3,2,2 → 정규화
  const total =
    weights.technical * (tech.score / 3) +
    weights.fundamental * (fund.score / 2) +
    weights.kb * (kb.score / 2);
  // total ~ -1 .. +1
  const score = Math.round(total * 300) / 100; // 다시 -3..+3 스케일로 표시

  let kind: SignalKind = "HOLD";
  if (score >= 1.2) kind = "BUY";
  else if (score <= -1.2) kind = "SELL";

  const confidence = Math.round(Math.abs(2 * sigmoid(score) - 1) * 100) / 100; // 0..1

  const reasons = [
    ...tech.reasons.map((r) => `[기술] ${r}`),
    ...fund.reasons.map((r) => `[기본] ${r}`),
    ...kb.reasons.map((r) => `[KB] ${r}`),
  ];

  return {
    ticker: t,
    ts: new Date().toISOString(),
    kind,
    score,
    technical_score: tech.score,
    fundamental_score: fund.score,
    kb_score: kb.score,
    weights,
    confidence,
    reasons,
    rsi14: inputs.latestInd.rsi14,
    macd_hist: inputs.latestInd.macd_hist,
    fact_ids: kb.fact_ids,
  };
}

export async function generateSignalForTicker(ticker: string) {
  const sig = await computeSignalForTicker(ticker);
  if (!sig) return { ticker: ticker.toUpperCase(), inserted: false, reason: "no price/indicator data" };
  const { error } = await (supabaseAdmin.from("signals") as any).insert({
    ticker: sig.ticker,
    ts: sig.ts,
    kind: sig.kind,
    score: sig.score,
    technical_score: sig.technical_score,
    fundamental_score: sig.fundamental_score,
    kb_score: sig.kb_score,
    weights: sig.weights,
    confidence: sig.confidence,
    reasons: sig.reasons,
    rsi14: sig.rsi14,
    macd_hist: sig.macd_hist,
    fact_ids: sig.fact_ids,
  });
  if (error) throw new Error(`signals insert: ${error.message}`);
  return { ticker: sig.ticker, inserted: true, kind: sig.kind, score: sig.score, confidence: sig.confidence };
}

export async function generateSignalsForAll() {
  const { data, error } = await supabaseAdmin.from("prices").select("ticker").limit(1000);
  if (error) throw new Error(error.message);
  const tickers = Array.from(new Set((data ?? []).map((r: any) => r.ticker as string)));
  const out: any[] = [];
  for (const t of tickers) {
    try {
      out.push(await generateSignalForTicker(t));
    } catch (e: any) {
      out.push({ ticker: t, reason: e?.message ?? String(e) });
    }
  }
  return { count: tickers.length, results: out };
}
