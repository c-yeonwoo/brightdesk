import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isUsTicker, getUsdKrwSpot, getUsdKrwOn } from "./fx.server";

export const FEE_RATE = 0.00015; // 0.015%
export const TAX_RATE = 0.0018; // 0.18% sell-only (KR)
// 미국 주식 거래수수료(국내 증권사 일반 수준): 0.25%
export const US_FEE_RATE = 0.0025;

export async function getOrCreateDefaultPortfolio() {
  return getOrCreateSystemPortfolio();
}

export async function getOrCreateUserPortfolioForUser(userId: string) {
  const sb = supabaseAdmin;
  const { data: existing } = await sb
    .from("portfolios")
    .select("*")
    .eq("kind", "user")
    .eq("owner_id", userId)
    .maybeSingle();
  if (existing) return existing;

  const fallbackName = `user-${userId}`;
  const { data: legacy } = await sb.from("portfolios").select("*").eq("name", fallbackName).maybeSingle();
  if (legacy) return legacy;

  const { data: created, error } = await (sb.from("portfolios") as any)
    .insert({ name: fallbackName, kind: "user", owner_id: userId, initial_cash: 0, cash: 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export async function getOrCreateSystemPortfolio() {
  const sb = supabaseAdmin;
  const { data } = await sb.from("portfolios").select("*").eq("name", "default").maybeSingle();
  if (data) return data;
  const { data: created, error } = await (sb.from("portfolios") as any)
    .insert({ name: "default", kind: "system", initial_cash: 10000000, cash: 10000000 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export async function getOrCreateUserPortfolio() {
  const sb = supabaseAdmin;
  const { data } = await sb.from("portfolios").select("*").eq("name", "user-default").maybeSingle();
  if (data) return data;
  const { data: created, error } = await (sb.from("portfolios") as any)
    .insert({ name: "user-default", kind: "user", initial_cash: 0, cash: 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

async function getNextDayOpen(ticker: string, afterDate: string): Promise<{ date: string; open: number } | null> {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("date, open")
    .eq("ticker", ticker)
    .gt("date", afterDate)
    .order("date", { ascending: true })
    .limit(1);
  if (!data || data.length === 0) return null;
  return { date: data[0].date as string, open: Number(data[0].open) };
}

async function getLatestPrice(ticker: string): Promise<{ date: string; close: number } | null> {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("date, close")
    .eq("ticker", ticker)
    .order("date", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return { date: data[0].date as string, close: Number(data[0].close) };
}

async function getLatestPaperFill(ticker: string): Promise<{ date: string; open: number; fallback: true } | null> {
  const latest = await getLatestPrice(ticker);
  if (!latest) return null;
  return { date: latest.date, open: latest.close, fallback: true };
}

async function getLatestPriceKrw(ticker: string): Promise<number | null> {
  const latest = await getLatestPrice(ticker);
  if (!latest) return null;
  const us = isUsTicker(ticker);
  const fx = us ? await getUsdKrwOn(latest.date) : 1;
  return latest.close * fx;
}

export async function executeSignal(opts: {
  portfolioId: string;
  ticker: string;
  kind: "BUY" | "SELL" | "HOLD";
  signalDate: string; // ISO date or timestamptz
  signalId?: string;
  allocationKrw?: number; // for BUY (항상 KRW 기준)
  note?: string; // sell_reason / 비고
}) {
  const { portfolioId, ticker, kind, signalDate, signalId, note } = opts;
  if (kind === "HOLD") return { skipped: "HOLD" };


  const dateOnly = signalDate.slice(0, 10);
  const fill = await getNextDayOpen(ticker, dateOnly) ?? await getLatestPaperFill(ticker);
  if (!fill) return { skipped: "no next-day price" };

  const sb = supabaseAdmin;
  const { data: pf } = await sb.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!pf) throw new Error("portfolio not found");

  const { data: pos } = await sb
    .from("positions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .eq("ticker", ticker)
    .maybeSingle();

  const price = fill.open; // native (USD/KRW)
  const us = isUsTicker(ticker);
  const fxRate = us ? await getUsdKrwOn(fill.date) : 1;
  const priceKrw = price * fxRate; // 원화 환산 단가
  const feeRate = us ? US_FEE_RATE : FEE_RATE;

  if (kind === "BUY") {
    const cash = Number(pf.cash); // KRW
    const allocKrw = Math.min(opts.allocationKrw ?? cash * 0.1, cash);
    if (cash < priceKrw) return { skipped: "insufficient cash", price_krw: priceKrw, cash };
    if (allocKrw < priceKrw) return { skipped: "price_above_allocation", price_krw: priceKrw, allocation_krw: allocKrw };
    const qty = Math.floor(allocKrw / (priceKrw * (1 + feeRate)));
    if (qty <= 0) return { skipped: "qty 0" };
    const costKrw = qty * priceKrw;
    const feeKrw = costKrw * feeRate;
    const totalKrw = costKrw + feeKrw;

    await (sb.from("transactions") as any).insert({
      portfolio_id: portfolioId,
      ticker,
      side: "BUY",
      qty,
      price, // native 가격 보존
      fee: feeKrw, // KRW
      tax: 0,
      signal_id: signalId,
      executed_at: new Date(fill.date).toISOString(),
      note: [note, (fill as any).fallback ? "paper_fill:latest_close" : null, us ? `fx=${fxRate.toFixed(2)}` : null]
        .filter(Boolean)
        .join(";") || null,
    });


    const newQty = Number(pos?.qty ?? 0) + qty;
    // avg_price는 native 통화 기준으로 유지 (KR=KRW, US=USD)
    const newAvg = pos
      ? (Number(pos.qty) * Number(pos.avg_price) + qty * price) / newQty
      : price;

    if (pos) {
      await (sb.from("positions") as any)
        .update({ qty: newQty, avg_price: newAvg, updated_at: new Date().toISOString() })
        .eq("id", pos.id);
    } else {
      await (sb.from("positions") as any).insert({
        portfolio_id: portfolioId,
        ticker,
        qty: newQty,
        avg_price: newAvg,
      });
    }

    await (sb.from("portfolios") as any)
      .update({ cash: cash - totalKrw, updated_at: new Date().toISOString() })
      .eq("id", portfolioId);

    return { side: "BUY", qty, price, fee: feeKrw, total: totalKrw, fx: fxRate };
  }

  // SELL
  if (!pos || Number(pos.qty) <= 0) return { skipped: "no position" };
  const qty = Number(pos.qty);
  const grossKrw = qty * priceKrw;
  const feeKrw = grossKrw * feeRate;
  const taxKrw = us ? 0 : grossKrw * TAX_RATE; // 미국은 양도세 일괄 X (모의)
  const netKrw = grossKrw - feeKrw - taxKrw;

  await (sb.from("transactions") as any).insert({
    portfolio_id: portfolioId,
    ticker,
    side: "SELL",
    qty,
    price,
    fee: feeKrw,
    tax: taxKrw,
    signal_id: signalId,
    executed_at: new Date(fill.date).toISOString(),
    note: note ?? (us ? `fx=${fxRate.toFixed(2)}` : null),
  });


  await (sb.from("positions") as any)
    .update({ qty: 0, updated_at: new Date().toISOString() })
    .eq("id", pos.id);

  await (sb.from("portfolios") as any)
    .update({ cash: Number(pf.cash) + netKrw, updated_at: new Date().toISOString() })
    .eq("id", portfolioId);

  return { side: "SELL", qty, price, fee: feeKrw, tax: taxKrw, net: netKrw, fx: fxRate };
}

export async function applyAllRecentSignals(
  portfolioId: string,
  hours = 24,
  opts: { blockBuys?: boolean; confidenceMultiplier?: number; minConfidence?: number } = {},
) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data: sigs } = await supabaseAdmin
    .from("signals")
    .select("*")
    .gte("ts", since)
    .neq("kind", "HOLD")
    .order("ts", { ascending: true });
  if (!sigs) return { applied: 0 };

  const mult = opts.confidenceMultiplier ?? 1;
  const minConf = opts.minConfidence ?? 0.5;
  const results: any[] = [];
  const skipped: any[] = [];

  for (const s of sigs as any[]) {
    // 레짐 BEAR → 신규 BUY 차단 (SELL/REDUCE는 통과)
    if (opts.blockBuys && s.kind === "BUY") {
      skipped.push({ ticker: s.ticker, reason: "regime_bear_block_buy" });
      continue;
    }
    // 신뢰도 게이트 (레짐으로 보정)
    const adjConf = (Number(s.confidence ?? 0)) * mult;
    if (s.kind === "BUY" && adjConf < minConf) {
      skipped.push({ ticker: s.ticker, reason: `low_confidence(${adjConf.toFixed(2)})` });
      continue;
    }
    const r = await executeSignal({
      portfolioId,
      ticker: s.ticker,
      kind: s.kind,
      signalDate: s.ts,
      signalId: s.id,
      allocationKrw: 1500000, // 15% per BUY
      note: s.kind === "SELL" ? "sell_reason:SIGNAL" : undefined,
    });
    results.push({ ticker: s.ticker, kind: s.kind, conf: adjConf, ...r });
  }
  return {
    applied: results.filter((r) => !r.skipped).length,
    skipped: skipped.length + results.filter((r) => r.skipped).length,
    results,
    skipped_details: skipped,
  };
}

export async function applyStarterPaperAllocation(
  portfolioId: string,
  opts: { blockBuys?: boolean; maxPositions?: number; allocationKrw?: number } = {},
) {
  if (opts.blockBuys) {
    return { applied: 0, skipped: 1, reason: "regime_block_buy", results: [] };
  }

  const sb = supabaseAdmin;
  const { data: pf } = await sb.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!pf) throw new Error("portfolio not found");

  const { data: positions } = await sb
    .from("positions")
    .select("ticker,qty")
    .eq("portfolio_id", portfolioId)
    .gt("qty", 0);
  if ((positions ?? []).length > 0) {
    return { applied: 0, skipped: 1, reason: "already_in_market", results: [] };
  }

  const cash = Number(pf.cash ?? 0);
  if (cash < 500_000) {
    return { applied: 0, skipped: 1, reason: "insufficient_cash", results: [] };
  }

  const tickers = (process.env.BRIGHTDESK_PAPER_STARTER_TICKERS ?? "SPY,QQQ,SMH,TLT")
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, opts.maxPositions ?? 4);
  const targetDeployRatio = Math.max(0.05, Math.min(0.8, Number(process.env.BRIGHTDESK_PAPER_STARTER_DEPLOY_RATIO ?? 0.45)));
  const targetDeployKrw = cash * targetDeployRatio;
  const baseAllocationKrw =
    opts.allocationKrw ??
    Math.max(500_000, Math.min(2_000_000, targetDeployKrw / Math.max(1, tickers.length)));
  const results: any[] = [];

  for (const ticker of tickers) {
    const latestPriceKrw = await getLatestPriceKrw(ticker);
    const allocationKrw = latestPriceKrw
      ? Math.min(cash, Math.max(baseAllocationKrw, latestPriceKrw * 1.01))
      : baseAllocationKrw;
    const r = await executeSignal({
      portfolioId,
      ticker,
      kind: "BUY",
      signalDate: new Date().toISOString(),
      allocationKrw,
      note: "starter_paper_allocation",
    });
    results.push({ ticker, kind: "BUY", ...r });
  }

  return {
    applied: results.filter((r) => !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  };
}


export async function snapshotPortfolio(portfolioId: string) {
  const sb = supabaseAdmin;
  const { data: pf } = await sb.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!pf) throw new Error("portfolio not found");
  const { data: positions } = await sb.from("positions").select("*").eq("portfolio_id", portfolioId).gt("qty", 0);

  const fx = await getUsdKrwSpot();
  let holdings = 0;
  for (const p of (positions ?? []) as any[]) {
    const last = await getLatestPrice(p.ticker);
    if (!last) continue;
    const priceKrw = isUsTicker(p.ticker) ? last.close * fx : last.close;
    holdings += Number(p.qty) * priceKrw;
  }
  const total = Number(pf.cash) + holdings;
  const today = new Date().toISOString().slice(0, 10);
  await (sb.from("portfolio_snapshots") as any).upsert(
    {
      portfolio_id: portfolioId,
      date: today,
      cash: pf.cash,
      holdings_value: holdings,
      total_value: total,
    },
    { onConflict: "portfolio_id,date" },
  );
  return { cash: Number(pf.cash), holdings, total, fx };
}

export async function getPortfolioOverview(portfolioId: string) {
  const sb = supabaseAdmin;
  const { data: pf } = await sb.from("portfolios").select("*").eq("id", portfolioId).single();
  const { data: positions } = await sb.from("positions").select("*").eq("portfolio_id", portfolioId).gt("qty", 0);
  const { data: txns } = await sb
    .from("transactions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("executed_at", { ascending: false })
    .limit(50);

  const fx = await getUsdKrwSpot();
  const enrichedPositions: any[] = [];
  let holdings = 0;
  for (const p of (positions ?? []) as any[]) {
    const last = await getLatestPrice(p.ticker);
    const us = isUsTicker(p.ticker);
    const priceKrw = last ? (us ? last.close * fx : last.close) : null;
    const avgKrw = us ? Number(p.avg_price) * fx : Number(p.avg_price);
    const mkt = priceKrw != null ? Number(p.qty) * priceKrw : 0;
    holdings += mkt;
    enrichedPositions.push({
      ...p,
      currency: us ? "USD" : "KRW",
      fx_rate: us ? fx : 1,
      last_price: last?.close ?? null, // native
      last_price_krw: priceKrw, // KRW 환산
      avg_price_krw: avgKrw,
      market_value: mkt, // KRW
      pl: last ? (priceKrw! - avgKrw) * Number(p.qty) : null,
      pl_pct: last && Number(p.avg_price) > 0 ? (last.close / Number(p.avg_price) - 1) * 100 : null,
    });
  }
  const total = Number(pf?.cash ?? 0) + holdings;
  const initial = Number(pf?.initial_cash ?? 10000000);
  return {
    portfolio: pf,
    positions: enrichedPositions,
    transactions: txns ?? [],
    fx_rate: fx,
    summary: {
      cash: Number(pf?.cash ?? 0),
      holdings,
      total,
      pnl: total - initial,
      pnl_pct: ((total - initial) / initial) * 100,
    },
  };
}

export async function resetPortfolio(portfolioId: string) {
  const sb = supabaseAdmin;
  await sb.from("transactions").delete().eq("portfolio_id", portfolioId);
  await sb.from("positions").delete().eq("portfolio_id", portfolioId);
  await sb.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId);
  await (sb.from("portfolios") as any)
    .update({ cash: 10000000, initial_cash: 10000000, updated_at: new Date().toISOString() })
    .eq("id", portfolioId);
  return { ok: true };
}
