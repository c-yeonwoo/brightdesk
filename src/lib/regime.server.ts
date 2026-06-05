import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * 시장 레짐 필터 (샘플 구현)
 * - 벤치마크(기본: ^KS11) 종가 시계열로 20MA·60MA·5d 수익률을 계산
 * - BULL / NEUTRAL / BEAR 3단계 + 0~1 confidence multiplier
 *
 * 백엔드는 별도로 구축 예정 — 본 모듈은 FE에서 호출 가능한 사양 정의 + 안전한 폴백
 */

export type RegimeKind = "BULL" | "NEUTRAL" | "BEAR";

export interface RegimeReading {
  ticker: string;
  regime: RegimeKind;
  score: number;            // -1 ~ +1
  confidence_multiplier: number; // BUY 신뢰도 보정 (0.3 ~ 1.2)
  last_close: number | null;
  change_1d_pct: number | null;
  change_5d_pct: number | null;
  ma20: number | null;
  ma60: number | null;
  reasons: string[];
  curve: { date: string; close: number }[]; // 최근 90d
}

const FALLBACK: RegimeReading = {
  ticker: "^KS11",
  regime: "NEUTRAL",
  score: 0,
  confidence_multiplier: 1,
  last_close: null,
  change_1d_pct: null,
  change_5d_pct: null,
  ma20: null,
  ma60: null,
  reasons: ["벤치마크 데이터 부족 — 중립으로 가정"],
  curve: [],
};

export async function getMarketRegime(benchmark = "^KS11"): Promise<RegimeReading> {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("date,close")
    .eq("ticker", benchmark)
    .order("date", { ascending: false })
    .limit(90);

  const rows = (data ?? []).slice().reverse();
  if (rows.length < 20) return { ...FALLBACK, ticker: benchmark, curve: rows as any };

  const closes = rows.map((r: any) => Number(r.close));
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2] ?? last;
  const prev5 = closes[Math.max(0, closes.length - 6)] ?? last;
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ma60 = closes.length >= 60 ? closes.slice(-60).reduce((a, b) => a + b, 0) / 60 : ma20;

  const change_1d = (last / prev - 1) * 100;
  const change_5d = (last / prev5 - 1) * 100;
  const aboveMA20 = last > ma20;
  const aboveMA60 = last > ma60;
  const maSlope = ma20 - ma60;

  // 점수: 추세(MA) + 모멘텀(5d)
  let score = 0;
  const reasons: string[] = [];
  if (aboveMA20) { score += 0.3; reasons.push("종가 > 20일 이평"); } else { score -= 0.3; reasons.push("종가 < 20일 이평"); }
  if (aboveMA60) { score += 0.3; reasons.push("종가 > 60일 이평"); } else { score -= 0.3; reasons.push("종가 < 60일 이평"); }
  if (maSlope > 0) { score += 0.2; reasons.push("MA20 > MA60 (정배열)"); } else { score -= 0.2; reasons.push("MA20 ≤ MA60 (역배열)"); }
  if (change_5d > 1) { score += 0.2; reasons.push(`5일 수익 +${change_5d.toFixed(2)}%`); }
  else if (change_5d < -1) { score -= 0.2; reasons.push(`5일 수익 ${change_5d.toFixed(2)}%`); }
  score = Math.max(-1, Math.min(1, score));

  const regime: RegimeKind = score >= 0.4 ? "BULL" : score <= -0.4 ? "BEAR" : "NEUTRAL";
  // BEAR면 매수 신뢰도를 강하게 깎고, BULL이면 살짝 증폭
  const confidence_multiplier =
    regime === "BULL" ? 1.15 : regime === "BEAR" ? 0.4 : 0.85;

  return {
    ticker: benchmark,
    regime,
    score,
    confidence_multiplier,
    last_close: last,
    change_1d_pct: change_1d,
    change_5d_pct: change_5d,
    ma20,
    ma60,
    reasons,
    curve: rows as any,
  };
}

/** 포트폴리오 초기자본에 정규화된 벤치마크 곡선 (자산곡선과 오버레이용) */
export async function getNormalizedBenchmarkCurve(
  initialCash: number,
  benchmark = "^KS11",
  days = 180,
): Promise<{ date: string; benchmark_value: number }[]> {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("date,close")
    .eq("ticker", benchmark)
    .order("date", { ascending: false })
    .limit(days);
  const rows = (data ?? []).slice().reverse();
  if (rows.length === 0) return [];
  const base = Number(rows[0].close);
  return rows.map((r: any) => ({
    date: r.date,
    benchmark_value: Math.round((Number(r.close) / base) * initialCash),
  }));
}
