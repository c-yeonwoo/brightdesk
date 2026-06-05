import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeSignalForTicker } from "./signals.server";
import { getWinrate } from "./outcomes.server";
import { isUsTicker, getUsdKrwSpot } from "./fx.server";

export interface RecAction {
  action: "BUY" | "SELL" | "HOLD" | "REDUCE" | "ADD";
  ticker: string;
  current_qty: number;
  current_weight: number;
  target_weight: number;
  confidence: number;
  winrate: number | null;
  winrate_n: number;
  reasons: string[];
  technical_score: number;
  fundamental_score: number;
  kb_score: number;
  total_score: number;
  fact_ids: string[];
}

async function getLatestPrice(ticker: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("close")
    .eq("ticker", ticker.toUpperCase())
    .order("date", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return Number((data[0] as any).close);
}

/**
 * 유저 포트폴리오를 입력받아 KB+기술+기본 시그널 + 승률을 근거로
 * 재구성 추천을 생성. (read-only, 실거래 X)
 */
export async function generateRecommendation(opts: {
  holdings: { ticker: string; qty: number; avg_price?: number | null }[];
  candidateTickers?: string[]; // 추가 매수 후보 (선택). 미입력시 prices 테이블 전체 종목 중 점수 상위
}) {
  const holdings = opts.holdings.filter((h) => h.qty > 0);

  // 현재 보유 평가 — 모든 가치는 KRW 기준으로 환산
  const fx = await getUsdKrwSpot();
  const holdingValues: { ticker: string; qty: number; price: number; value: number; currency: "USD" | "KRW" }[] = [];
  for (const h of holdings) {
    const price = await getLatestPrice(h.ticker);
    if (price == null) continue;
    const us = isUsTicker(h.ticker);
    const priceKrw = us ? price * fx : price;
    holdingValues.push({
      ticker: h.ticker.toUpperCase(),
      qty: h.qty,
      price,
      value: h.qty * priceKrw,
      currency: us ? "USD" : "KRW",
    });
  }
  const totalValue = holdingValues.reduce((s, h) => s + h.value, 0);

  // 후보 종목 수집 (보유 + 추가)
  let candidates: string[] = [];
  if (opts.candidateTickers && opts.candidateTickers.length > 0) {
    candidates = opts.candidateTickers.map((t) => t.toUpperCase());
  } else {
    const { data } = await supabaseAdmin.from("prices").select("ticker").limit(500);
    candidates = Array.from(new Set((data ?? []).map((r: any) => r.ticker as string)));
  }
  const universe = Array.from(
    new Set([...holdingValues.map((h) => h.ticker), ...candidates]),
  );

  // 각 종목 시그널 계산
  const scored: (RecAction & { value: number })[] = [];
  for (const t of universe) {
    const sig = await computeSignalForTicker(t);
    if (!sig) continue;
    const wr = await getWinrate({
      ticker: t,
      kind: sig.kind === "SELL" ? "SELL" : "BUY",
      minScore: undefined,
    });
    const held = holdingValues.find((h) => h.ticker === t);
    const currentWeight = held && totalValue > 0 ? held.value / totalValue : 0;
    scored.push({
      action: "HOLD",
      ticker: t,
      current_qty: held?.qty ?? 0,
      current_weight: currentWeight,
      target_weight: currentWeight,
      confidence: sig.confidence,
      winrate: wr.winrate,
      winrate_n: wr.n,
      reasons: sig.reasons,
      technical_score: sig.technical_score,
      fundamental_score: sig.fundamental_score,
      kb_score: sig.kb_score,
      total_score: sig.score,
      fact_ids: sig.fact_ids,
      value: held?.value ?? 0,
    });
  }

  // 비중 산정: 보유종목 SELL → 비중 0, BUY 후보 중 confidence*승률 상위 → 비중 배분
  const MAX_PER_STOCK = 0.25;
  const CONFIDENCE_THRESHOLD = 0.35;

  // 1. 보유종목 매도/축소
  const sellList: typeof scored = [];
  for (const r of scored) {
    if (r.current_qty <= 0) continue;
    if (r.total_score <= -1.2) {
      r.action = "SELL"; r.target_weight = 0;
      sellList.push(r);
    } else if (r.total_score <= -0.5) {
      r.action = "REDUCE";
      r.target_weight = r.current_weight * 0.5;
    } else if (r.total_score >= 1.2 && r.current_weight < MAX_PER_STOCK) {
      r.action = "ADD";
      r.target_weight = Math.min(MAX_PER_STOCK, r.current_weight * 1.5 + 0.05);
    } else {
      r.action = "HOLD";
      r.target_weight = r.current_weight;
    }
  }

  // 2. 신규 매수 후보 (미보유 + 강한 BUY)
  const buyPool = scored
    .filter((r) => r.current_qty === 0 && r.total_score >= 1.2 && r.confidence >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => {
      const aScore = a.confidence * (a.winrate ?? 0.5);
      const bScore = b.confidence * (b.winrate ?? 0.5);
      return bScore - aScore;
    })
    .slice(0, 5);

  // 남은 비중 = 1 - sum(목표비중 of held)
  const heldTargetSum = scored
    .filter((r) => r.current_qty > 0)
    .reduce((s, r) => s + r.target_weight, 0);
  const remainingForBuys = Math.max(0, Math.min(1, 1 - heldTargetSum));

  if (buyPool.length > 0 && remainingForBuys > 0.05) {
    const totalConfWr = buyPool.reduce(
      (s, r) => s + r.confidence * (r.winrate ?? 0.5),
      0,
    );
    for (const r of buyPool) {
      const w = r.confidence * (r.winrate ?? 0.5);
      const alloc = totalConfWr > 0
        ? Math.min(MAX_PER_STOCK, (w / totalConfWr) * remainingForBuys)
        : 0;
      r.action = "BUY";
      r.target_weight = alloc;
    }
  }

  // 액션이 있는 것만 추리고 정렬
  const actions = scored
    .filter((r) => r.action !== "HOLD" || r.current_qty > 0)
    .sort((a, b) => {
      const order = { SELL: 0, REDUCE: 1, BUY: 2, ADD: 3, HOLD: 4 };
      return order[a.action] - order[b.action];
    });

  const expectedReturn = actions.reduce((s, r) => {
    const wr = r.winrate ?? 0.5;
    const delta = r.target_weight - r.current_weight;
    // 거칠게: BUY/ADD는 +기대값, SELL/REDUCE는 손실회피
    return s + delta * (wr * 0.05); // 5% 추정 평균수익률
  }, 0);

  const rationale = buildRationale(actions);

  return {
    actions,
    rationale,
    expected_return: Math.round(expectedReturn * 10000) / 100, // %
    expected_risk: null as number | null,
    total_value: totalValue,
  };
}

function buildRationale(actions: any[]): string {
  const sells = actions.filter((a) => a.action === "SELL" || a.action === "REDUCE");
  const buys = actions.filter((a) => a.action === "BUY" || a.action === "ADD");
  const parts: string[] = [];
  if (sells.length) {
    parts.push(`매도/축소 ${sells.length}건: ${sells.map((s) => s.ticker).join(", ")} — 기술/기본/KB 종합 약세`);
  }
  if (buys.length) {
    parts.push(`매수/추가 ${buys.length}건: ${buys.map((s) => s.ticker).join(", ")} — confidence × 승률 상위`);
  }
  if (parts.length === 0) parts.push("뚜렷한 재구성 신호 없음 — 현 비중 유지 권장");
  return parts.join(" / ");
}

export async function saveRecommendation(portfolioId: string, rec: any) {
  const { data, error } = await (supabaseAdmin.from("rebalance_recommendations") as any)
    .insert({
      portfolio_id: portfolioId,
      actions: rec.actions,
      rationale: rec.rationale,
      expected_return: rec.expected_return,
      expected_risk: rec.expected_risk,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
