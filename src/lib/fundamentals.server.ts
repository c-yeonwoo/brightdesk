import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface FundamentalScore {
  score: number; // -2..+2
  reasons: string[];
  hasData: boolean;
  metrics: {
    per: number | null;
    pbr: number | null;
    roe: number | null;
    revenue_growth: number | null;
    debt_ratio: number | null;
    dividend_yield: number | null;
  } | null;
}

/**
 * 기본적 분석 점수 (-2 ~ +2).
 * - ROE > 15 → +1, > 10 → +0.5, < 5 → -0.5
 * - PER < 10 → +0.7, < 15 → +0.3, > 25 → -0.5
 * - PBR < 1 → +0.5, > 3 → -0.3
 * - 매출성장률 > 15% → +0.7, > 5% → +0.3, < 0 → -0.5
 * - 부채비율 > 200% → -0.5
 * - 배당수익률 > 3% → +0.2
 *
 * 데이터 없으면 hasData=false, score=0 (중립).
 */
export async function computeFundamentalScore(ticker: string): Promise<FundamentalScore> {
  const { data } = await supabaseAdmin
    .from("fundamentals")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .order("as_of", { ascending: false })
    .limit(1);

  const row: any = (data ?? [])[0];
  if (!row) {
    return {
      score: 0,
      reasons: ["재무 데이터 미수집 — 중립 처리"],
      hasData: false,
      metrics: null,
    };
  }

  let score = 0;
  const reasons: string[] = [];

  const per = row.per != null ? Number(row.per) : null;
  const pbr = row.pbr != null ? Number(row.pbr) : null;
  const roe = row.roe != null ? Number(row.roe) : null;
  const growth = row.revenue_growth != null ? Number(row.revenue_growth) : null;
  const debt = row.debt_ratio != null ? Number(row.debt_ratio) : null;
  const div = row.dividend_yield != null ? Number(row.dividend_yield) : null;

  if (roe != null) {
    if (roe >= 15) { score += 1; reasons.push(`ROE 우수 ${roe.toFixed(1)}%`); }
    else if (roe >= 10) { score += 0.5; reasons.push(`ROE 양호 ${roe.toFixed(1)}%`); }
    else if (roe < 5) { score -= 0.5; reasons.push(`ROE 저조 ${roe.toFixed(1)}%`); }
  }
  if (per != null && per > 0) {
    if (per < 10) { score += 0.7; reasons.push(`PER 저평가 ${per.toFixed(1)}`); }
    else if (per < 15) { score += 0.3; reasons.push(`PER 적정 ${per.toFixed(1)}`); }
    else if (per > 25) { score -= 0.5; reasons.push(`PER 고평가 ${per.toFixed(1)}`); }
  }
  if (pbr != null && pbr > 0) {
    if (pbr < 1) { score += 0.5; reasons.push(`PBR ${pbr.toFixed(2)} (자산가치 이하)`); }
    else if (pbr > 3) { score -= 0.3; reasons.push(`PBR ${pbr.toFixed(2)} (고평가)`); }
  }
  if (growth != null) {
    if (growth > 15) { score += 0.7; reasons.push(`매출 고성장 ${growth.toFixed(1)}%`); }
    else if (growth > 5) { score += 0.3; reasons.push(`매출 성장 ${growth.toFixed(1)}%`); }
    else if (growth < 0) { score -= 0.5; reasons.push(`매출 역성장 ${growth.toFixed(1)}%`); }
  }
  if (debt != null && debt > 200) { score -= 0.5; reasons.push(`부채비율 ${debt.toFixed(0)}% 과다`); }
  if (div != null && div >= 3) { score += 0.2; reasons.push(`배당수익률 ${div.toFixed(1)}%`); }

  if (reasons.length === 0) reasons.push("재무지표 중립");

  // clamp -2..+2
  score = Math.max(-2, Math.min(2, score));

  return {
    score: Math.round(score * 100) / 100,
    reasons,
    hasData: true,
    metrics: { per, pbr, roe, revenue_growth: growth, debt_ratio: debt, dividend_yield: div },
  };
}
