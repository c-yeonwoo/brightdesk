import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ScenarioParams {
  rsiBuy: number; // BUY threshold (e.g. 30)
  rsiSell: number; // SELL threshold (e.g. 70)
  allocPctPerTrade: number; // 0.05..0.3
  stopLossPct: number; // 0.05 (=5%)
  takeProfitPct: number; // 0.15
  maPeriod: 20 | 60;
}

const DEFAULT_TICKERS = ["AAPL", "NVDA", "MSFT", "TSLA", "GOOGL"];

interface DailyRow {
  date: string;
  open: number;
  close: number;
  rsi14: number | null;
  ma: number | null;
}

async function loadHistory(ticker: string, days: number): Promise<DailyRow[]> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data: prices } = await supabaseAdmin
    .from("prices")
    .select("date, open, close")
    .eq("ticker", ticker)
    .gte("date", cutoff)
    .order("date", { ascending: true });
  const { data: inds } = await supabaseAdmin
    .from("indicators")
    .select("date, rsi14, ma20, ma60")
    .eq("ticker", ticker)
    .gte("date", cutoff)
    .order("date", { ascending: true });
  const indMap = new Map<string, any>();
  for (const i of (inds ?? []) as any[]) indMap.set(i.date, i);
  return (prices ?? []).map((p: any) => {
    const i = indMap.get(p.date);
    return {
      date: p.date,
      open: Number(p.open),
      close: Number(p.close),
      rsi14: i?.rsi14 != null ? Number(i.rsi14) : null,
      ma: i?.ma20 != null ? Number(i.ma20) : null,
    };
  });
}

interface SimResult {
  totalReturn: number;
  sharpe: number;
  mdd: number;
  finalValue: number;
  trades: number;
}

function simulate(history: Record<string, DailyRow[]>, params: ScenarioParams, initial = 10_000_000): SimResult {
  let cash = initial;
  const pos: Record<string, { qty: number; avg: number }> = {};
  const tickers = Object.keys(history);
  // collect all unique dates sorted
  const dateSet = new Set<string>();
  for (const t of tickers) history[t].forEach((d) => dateSet.add(d.date));
  const dates = Array.from(dateSet).sort();

  const equity: number[] = [];
  let trades = 0;

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const nextDate = dates[di + 1];
    // signals computed on close of `date`, executed at open of nextDate
    for (const t of tickers) {
      const row = history[t].find((r) => r.date === date);
      if (!row || row.rsi14 == null) continue;
      const nextRow = nextDate ? history[t].find((r) => r.date === nextDate) : null;
      if (!nextRow) continue;
      const fillPrice = nextRow.open;
      const p = pos[t];

      // stop loss / take profit
      if (p && p.qty > 0) {
        const ret = fillPrice / p.avg - 1;
        if (ret <= -params.stopLossPct || ret >= params.takeProfitPct) {
          cash += p.qty * fillPrice * (1 - 0.0018 - 0.00015);
          delete pos[t];
          trades++;
          continue;
        }
      }

      const trendOk = row.ma == null || row.close > row.ma;
      if (row.rsi14 < params.rsiBuy && trendOk && !p) {
        const alloc = cash * params.allocPctPerTrade;
        const qty = Math.floor(alloc / (fillPrice * 1.00015));
        if (qty > 0) {
          const cost = qty * fillPrice * 1.00015;
          cash -= cost;
          pos[t] = { qty, avg: fillPrice };
          trades++;
        }
      } else if (row.rsi14 > params.rsiSell && p && p.qty > 0) {
        cash += p.qty * fillPrice * (1 - 0.0018 - 0.00015);
        delete pos[t];
        trades++;
      }
    }

    // mark to market end of day
    let mv = cash;
    for (const t of tickers) {
      const p = pos[t];
      if (!p) continue;
      const row = history[t].find((r) => r.date === date);
      if (row) mv += p.qty * row.close;
    }
    equity.push(mv);
  }

  if (equity.length < 2) return { totalReturn: 0, sharpe: 0, mdd: 0, finalValue: initial, trades };

  const final = equity[equity.length - 1];
  const totalReturn = final / initial - 1;
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i] / equity[i - 1] - 1);
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  let peak = equity[0];
  let mdd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < mdd) mdd = dd;
  }

  return { totalReturn, sharpe, mdd: Math.abs(mdd), finalValue: final, trades };
}

export function generateScenarioGrid(): { name: string; params: ScenarioParams }[] {
  const grid: { name: string; params: ScenarioParams }[] = [];
  let i = 1;
  for (const rsiBuy of [25, 30, 35]) {
    for (const allocPct of [0.1, 0.2]) {
      grid.push({
        name: `S${i++} RSI<${rsiBuy} alloc${allocPct * 100}%`,
        params: {
          rsiBuy,
          rsiSell: 70,
          allocPctPerTrade: allocPct,
          stopLossPct: 0.07,
          takeProfitPct: 0.2,
          maPeriod: 20,
        },
      });
    }
  }
  // some aggressive / conservative variants
  grid.push({
    name: `S${i++} 보수 MA60`,
    params: { rsiBuy: 30, rsiSell: 65, allocPctPerTrade: 0.1, stopLossPct: 0.05, takeProfitPct: 0.12, maPeriod: 60 },
  });
  grid.push({
    name: `S${i++} 공격 빠른익절`,
    params: { rsiBuy: 35, rsiSell: 60, allocPctPerTrade: 0.25, stopLossPct: 0.1, takeProfitPct: 0.1, maPeriod: 20 },
  });
  grid.push({
    name: `S${i++} 장기보유`,
    params: { rsiBuy: 28, rsiSell: 75, allocPctPerTrade: 0.15, stopLossPct: 0.12, takeProfitPct: 0.3, maPeriod: 60 },
  });
  grid.push({
    name: `S${i++} 균형`,
    params: { rsiBuy: 32, rsiSell: 68, allocPctPerTrade: 0.15, stopLossPct: 0.08, takeProfitPct: 0.18, maPeriod: 20 },
  });
  return grid.slice(0, 10);
}

export async function runAllScenarios(tickers: string[] = DEFAULT_TICKERS, days = 180) {
  // load history once
  const history: Record<string, DailyRow[]> = {};
  for (const t of tickers) {
    history[t] = await loadHistory(t, days);
  }
  const grid = generateScenarioGrid();
  // clear previous
  await supabaseAdmin.from("scenarios").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const results: any[] = [];
  for (const g of grid) {
    const r = simulate(history, g.params);
    // composite score: weighted
    const score = r.sharpe * 0.4 + r.totalReturn * 100 * 0.4 - r.mdd * 100 * 0.2;
    const { data } = await (supabaseAdmin.from("scenarios") as any)
      .insert({
        name: g.name,
        params: g.params as any,
        sharpe: r.sharpe,
        total_return: r.totalReturn,
        mdd: r.mdd,
        score,
        ran_at: new Date().toISOString(),
      })
      .select()
      .single();
    results.push(data);
  }
  results.sort((a: any, b: any) => Number(b.score) - Number(a.score));
  return { count: results.length, scenarios: results, best: results[0] };
}

export async function getBestScenario() {
  const { data } = await supabaseAdmin
    .from("scenarios")
    .select("*")
    .order("score", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export async function listScenarios() {
  const { data } = await supabaseAdmin
    .from("scenarios")
    .select("*")
    .order("score", { ascending: false });
  return data ?? [];
}

/**
 * 특정 시나리오 파라미터로 다시 시뮬레이션 + 일자별 자산곡선 + 벤치마크(KOSPI 정규화) 동봉
 */
export async function simulateScenarioCurve(
  params: ScenarioParams,
  tickers: string[] = DEFAULT_TICKERS,
  days = 180,
  initial = 10_000_000,
) {
  const history: Record<string, DailyRow[]> = {};
  for (const t of tickers) history[t] = await loadHistory(t, days);

  // 재구성: simulate를 변형하여 일자/equity 페어 반환
  let cash = initial;
  const pos: Record<string, { qty: number; avg: number }> = {};
  const ts = Object.keys(history);
  const dateSet = new Set<string>();
  for (const t of ts) history[t].forEach((d) => dateSet.add(d.date));
  const dates = Array.from(dateSet).sort();
  const curve: { date: string; equity: number }[] = [];

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const nextDate = dates[di + 1];
    for (const t of ts) {
      const row = history[t].find((r) => r.date === date);
      if (!row || row.rsi14 == null) continue;
      const nextRow = nextDate ? history[t].find((r) => r.date === nextDate) : null;
      if (!nextRow) continue;
      const fill = nextRow.open;
      const p = pos[t];
      if (p && p.qty > 0) {
        const ret = fill / p.avg - 1;
        if (ret <= -params.stopLossPct || ret >= params.takeProfitPct) {
          cash += p.qty * fill * (1 - 0.0018 - 0.00015);
          delete pos[t];
          continue;
        }
      }
      const trendOk = row.ma == null || row.close > row.ma;
      if (row.rsi14 < params.rsiBuy && trendOk && !p) {
        const alloc = cash * params.allocPctPerTrade;
        const qty = Math.floor(alloc / (fill * 1.00015));
        if (qty > 0) {
          cash -= qty * fill * 1.00015;
          pos[t] = { qty, avg: fill };
        }
      } else if (row.rsi14 > params.rsiSell && p && p.qty > 0) {
        cash += p.qty * fill * (1 - 0.0018 - 0.00015);
        delete pos[t];
      }
    }
    let mv = cash;
    for (const t of ts) {
      const p = pos[t];
      if (!p) continue;
      const row = history[t].find((r) => r.date === date);
      if (row) mv += p.qty * row.close;
    }
    curve.push({ date, equity: mv });
  }

  // 벤치마크: KOSPI 정규화
  const { data: bench } = await supabaseAdmin
    .from("prices")
    .select("date,close")
    .eq("ticker", "^KS11")
    .gte("date", dates[0] ?? new Date().toISOString().slice(0, 10))
    .order("date", { ascending: true });
  const benchRows = (bench ?? []) as any[];
  const benchBase = benchRows[0] ? Number(benchRows[0].close) : null;
  const benchMap = new Map<string, number>();
  if (benchBase) {
    for (const b of benchRows) {
      benchMap.set(b.date, (Number(b.close) / benchBase) * initial);
    }
  }
  const merged = curve.map((c) => ({
    date: c.date,
    equity: c.equity,
    benchmark: benchMap.get(c.date) ?? null,
  }));

  return merged;
}
