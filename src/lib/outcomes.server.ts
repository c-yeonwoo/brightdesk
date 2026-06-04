import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * 시그널 이후 N일 후 가격을 조회해 outcome 기록.
 * BUY: ret > 0 → hit. SELL: ret < 0 → hit (선택회피 적중).
 */
export async function evaluateSignalOutcomes(maxBatch = 200) {
  const sb = supabaseAdmin;
  // 평가되지 않은 시그널 (signal_outcomes에 없는 것)
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: sigs } = await sb
    .from("signals")
    .select("id,ticker,ts,kind,score")
    .gte("ts", since)
    .neq("kind", "HOLD")
    .order("ts", { ascending: false })
    .limit(maxBatch);

  if (!sigs || sigs.length === 0) return { evaluated: 0 };

  const ids = sigs.map((s: any) => s.id);
  const { data: existing } = await sb
    .from("signal_outcomes")
    .select("signal_id")
    .in("signal_id", ids);
  const done = new Set((existing ?? []).map((r: any) => r.signal_id));

  let count = 0;
  for (const s of sigs as any[]) {
    if (done.has(s.id)) continue;
    const tsDate = s.ts.slice(0, 10);
    // 진입가: 시그널 다음 거래일 open
    const { data: entryRows } = await sb
      .from("prices")
      .select("date,open,close")
      .eq("ticker", s.ticker)
      .gt("date", tsDate)
      .order("date", { ascending: true })
      .limit(25);
    if (!entryRows || entryRows.length === 0) continue;
    const entry: any = entryRows[0];
    const entryPrice = Number(entry.open);
    if (!entryPrice) continue;

    const r5: any = entryRows[5];
    const r20: any = entryRows[20];
    const ret5 = r5 ? (Number(r5.close) - entryPrice) / entryPrice : null;
    const ret20 = r20 ? (Number(r20.close) - entryPrice) / entryPrice : null;

    let hit: boolean | null = null;
    if (ret5 != null) {
      if (s.kind === "BUY") hit = ret5 > 0.005;
      else if (s.kind === "SELL") hit = ret5 < -0.005;
    }

    await (sb.from("signal_outcomes") as any).insert({
      signal_id: s.id,
      ticker: s.ticker,
      kind: s.kind,
      score: s.score,
      entry_date: entry.date,
      entry_price: entryPrice,
      ret_5d: ret5,
      ret_20d: ret20,
      hit,
    });
    count++;
  }
  return { evaluated: count };
}

export interface WinrateStats {
  kind: "BUY" | "SELL";
  n: number;
  winrate: number | null;
  avg_ret_5d: number | null;
  avg_ret_20d: number | null;
}

/**
 * 특정 종목/등급별 승률 통계.
 * scoreBin: ['low','mid','high'] 또는 null (전체)
 */
export async function getWinrate(opts: {
  ticker?: string;
  kind: "BUY" | "SELL";
  minScore?: number;
}): Promise<WinrateStats> {
  const sb = supabaseAdmin;
  let q = sb
    .from("signal_outcomes")
    .select("hit,ret_5d,ret_20d,score,ticker,kind")
    .eq("kind", opts.kind)
    .not("hit", "is", null);
  if (opts.ticker) q = q.eq("ticker", opts.ticker.toUpperCase());
  if (opts.minScore != null) q = q.gte("score", opts.minScore);
  const { data } = await q.limit(500);
  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return { kind: opts.kind, n: 0, winrate: null, avg_ret_5d: null, avg_ret_20d: null };
  }
  const hits = rows.filter((r) => r.hit === true).length;
  const ret5 = rows.map((r) => Number(r.ret_5d)).filter((v) => !isNaN(v));
  const ret20 = rows.map((r) => Number(r.ret_20d)).filter((v) => !isNaN(v));
  return {
    kind: opts.kind,
    n: rows.length,
    winrate: hits / rows.length,
    avg_ret_5d: ret5.length ? ret5.reduce((a, b) => a + b, 0) / ret5.length : null,
    avg_ret_20d: ret20.length ? ret20.reduce((a, b) => a + b, 0) / ret20.length : null,
  };
}
