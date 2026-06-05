import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * 손절(Stop-Loss) / 익절(Take-Profit) 자동 청산 엔진 (샘플)
 *
 * - 보유 포지션을 순회하면서 평단 대비 손익률이 임계치를 넘으면
 *   SELL 시그널을 만들고(reason 포함), 포지션을 청산하는 거래를 발행한다.
 * - 모든 SELL 거래에는 sell_reason 라벨(`STOP_LOSS` | `TAKE_PROFIT` | `TRAILING` | `SIGNAL`)이 붙는다.
 * - DB 구축은 별도이므로 본 파일은 인터페이스/샘플 구현이며,
 *   transactions.note 컬럼에 `sell_reason:...` 형식으로 라벨을 적재한다.
 */

export type SellReason = "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING" | "SIGNAL" | "REGIME_DOWNGRADE";

export interface RiskRule {
  stopLossPct: number;      // ex) -0.07 → -7% 손절
  takeProfitPct: number;    // ex) 0.15 → +15% 익절
  trailingFromPeak: number; // ex) -0.05 → 고점 대비 -5% 트레일링
}

export const DEFAULT_RULES: RiskRule = {
  stopLossPct: -0.07,
  takeProfitPct: 0.15,
  trailingFromPeak: -0.05,
};

async function getLastClose(ticker: string) {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("date,close")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return { date: data[0].date as string, close: Number(data[0].close) };
}

async function getPeakSinceEntry(ticker: string, sinceDate: string) {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("high")
    .eq("ticker", ticker)
    .gte("date", sinceDate)
    .order("high", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return Number(data[0].high);
}

export interface ExitCheckResult {
  ticker: string;
  triggered: boolean;
  reason: SellReason | null;
  pl_pct: number;
  message: string;
  avg_price: number;
  last_close: number | null;
}

/** 포트폴리오의 모든 포지션을 검사하여 SL/TP 트리거 여부 반환 (실제 청산은 별도) */
export async function checkExits(
  portfolioId: string,
  rules: RiskRule = DEFAULT_RULES,
): Promise<ExitCheckResult[]> {
  const sb = supabaseAdmin;
  const { data: positions } = await sb
    .from("positions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .gt("qty", 0);

  const results: ExitCheckResult[] = [];
  for (const p of (positions ?? []) as any[]) {
    const last = await getLastClose(p.ticker);
    if (!last) continue;
    const avg = Number(p.avg_price);
    const pl = avg > 0 ? last.close / avg - 1 : 0;

    let reason: SellReason | null = null;
    let message = "";
    if (pl <= rules.stopLossPct) {
      reason = "STOP_LOSS";
      message = `손절: 평단 대비 ${(pl * 100).toFixed(2)}% (임계 ${rules.stopLossPct * 100}%)`;
    } else if (pl >= rules.takeProfitPct) {
      reason = "TAKE_PROFIT";
      message = `익절: 평단 대비 +${(pl * 100).toFixed(2)}% (임계 +${rules.takeProfitPct * 100}%)`;
    } else {
      const updatedSince = (p.updated_at ?? p.created_at ?? new Date().toISOString()).slice(0, 10);
      const peak = await getPeakSinceEntry(p.ticker, updatedSince);
      if (peak && peak > avg) {
        const drawdown = last.close / peak - 1;
        if (drawdown <= rules.trailingFromPeak) {
          reason = "TRAILING";
          message = `트레일링: 고점 ${peak.toFixed(0)} 대비 ${(drawdown * 100).toFixed(2)}%`;
        }
      }
    }

    results.push({
      ticker: p.ticker,
      triggered: !!reason,
      reason,
      pl_pct: pl * 100,
      message,
      avg_price: avg,
      last_close: last.close,
    });
  }
  return results;
}

/** SELL 시그널 + 거래에 사용할 사유 라벨 직렬화 */
export function serializeSellReason(reason: SellReason, detail?: string) {
  return detail ? `sell_reason:${reason}|${detail}` : `sell_reason:${reason}`;
}

/** transactions.note 또는 signals.reasons[0]에서 sell_reason 라벨 파싱 */
export function parseSellReason(note?: string | null): { reason: SellReason | null; detail: string | null } {
  if (!note) return { reason: null, detail: null };
  const m = note.match(/sell_reason:([A-Z_]+)(?:\|(.+))?/);
  if (!m) return { reason: null, detail: null };
  return { reason: m[1] as SellReason, detail: m[2] ?? null };
}
