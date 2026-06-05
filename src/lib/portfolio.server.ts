import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FEE_RATE = 0.00015; // 0.015%
export const TAX_RATE = 0.0018; // 0.18% sell-only (KR)

export async function getOrCreateDefaultPortfolio() {
  return getOrCreateSystemPortfolio();
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

export async function executeSignal(opts: {
  portfolioId: string;
  ticker: string;
  kind: "BUY" | "SELL" | "HOLD";
  signalDate: string; // ISO date or timestamptz
  signalId?: string;
  allocationKrw?: number; // for BUY
  note?: string; // sell_reason / 비고
}) {
  const { portfolioId, ticker, kind, signalDate, signalId, note } = opts;
  if (kind === "HOLD") return { skipped: "HOLD" };


  const dateOnly = signalDate.slice(0, 10);
  const fill = await getNextDayOpen(ticker, dateOnly);
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

  const price = fill.open;

  if (kind === "BUY") {
    const cash = Number(pf.cash);
    const alloc = Math.min(opts.allocationKrw ?? cash * 0.1, cash);
    if (alloc < price) return { skipped: "insufficient cash" };
    const qty = Math.floor(alloc / (price * (1 + FEE_RATE)));
    if (qty <= 0) return { skipped: "qty 0" };
    const cost = qty * price;
    const fee = cost * FEE_RATE;
    const total = cost + fee;

    await (sb.from("transactions") as any).insert({
      portfolio_id: portfolioId,
      ticker,
      side: "BUY",
      qty,
      price,
      fee,
      tax: 0,
      signal_id: signalId,
      executed_at: new Date(fill.date).toISOString(),
      note: note ?? null,
    });


    const newQty = Number(pos?.qty ?? 0) + qty;
    const newAvg = pos
      ? (Number(pos.qty) * Number(pos.avg_price) + cost) / newQty
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
      .update({ cash: cash - total, updated_at: new Date().toISOString() })
      .eq("id", portfolioId);

    return { side: "BUY", qty, price, fee, total };
  }

  // SELL
  if (!pos || Number(pos.qty) <= 0) return { skipped: "no position" };
  const qty = Number(pos.qty);
  const gross = qty * price;
  const fee = gross * FEE_RATE;
  const tax = gross * TAX_RATE;
  const net = gross - fee - tax;

  await (sb.from("transactions") as any).insert({
    portfolio_id: portfolioId,
    ticker,
    side: "SELL",
    qty,
    price,
    fee,
    tax,
    signal_id: signalId,
    executed_at: new Date(fill.date).toISOString(),
    note: note ?? null,
  });


  await (sb.from("positions") as any)
    .update({ qty: 0, updated_at: new Date().toISOString() })
    .eq("id", pos.id);

  await (sb.from("portfolios") as any)
    .update({ cash: Number(pf.cash) + net, updated_at: new Date().toISOString() })
    .eq("id", portfolioId);

  return { side: "SELL", qty, price, fee, tax, net };
}

export async function applyAllRecentSignals(portfolioId: string, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data: sigs } = await supabaseAdmin
    .from("signals")
    .select("*")
    .gte("ts", since)
    .neq("kind", "HOLD")
    .order("ts", { ascending: true });
  if (!sigs) return { applied: 0 };

  const results: any[] = [];
  for (const s of sigs as any[]) {
    const r = await executeSignal({
      portfolioId,
      ticker: s.ticker,
      kind: s.kind,
      signalDate: s.ts,
      signalId: s.id,
      allocationKrw: 1500000, // 15% per BUY
    });
    results.push({ ticker: s.ticker, kind: s.kind, ...r });
  }
  return { applied: results.length, results };
}

export async function snapshotPortfolio(portfolioId: string) {
  const sb = supabaseAdmin;
  const { data: pf } = await sb.from("portfolios").select("*").eq("id", portfolioId).single();
  if (!pf) throw new Error("portfolio not found");
  const { data: positions } = await sb.from("positions").select("*").eq("portfolio_id", portfolioId).gt("qty", 0);

  let holdings = 0;
  for (const p of (positions ?? []) as any[]) {
    const last = await getLatestPrice(p.ticker);
    if (last) holdings += Number(p.qty) * last.close;
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
  return { cash: Number(pf.cash), holdings, total };
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

  const enrichedPositions: any[] = [];
  let holdings = 0;
  for (const p of (positions ?? []) as any[]) {
    const last = await getLatestPrice(p.ticker);
    const mkt = last ? Number(p.qty) * last.close : 0;
    holdings += mkt;
    enrichedPositions.push({
      ...p,
      last_price: last?.close ?? null,
      market_value: mkt,
      pl: last ? (last.close - Number(p.avg_price)) * Number(p.qty) : null,
      pl_pct: last && Number(p.avg_price) > 0 ? (last.close / Number(p.avg_price) - 1) * 100 : null,
    });
  }
  const total = Number(pf?.cash ?? 0) + holdings;
  const initial = Number(pf?.initial_cash ?? 10000000);
  return {
    portfolio: pf,
    positions: enrichedPositions,
    transactions: txns ?? [],
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
