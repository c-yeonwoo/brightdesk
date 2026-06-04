import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getBestScenario } from "./scenarios.server";
import { getOrCreateDefaultPortfolio } from "./portfolio.server";

export const getTodayActions = createServerFn({ method: "GET" }).handler(async () => {
  const sb = supabaseAdmin;
  const best = await getBestScenario();
  const pf = await getOrCreateDefaultPortfolio();

  // latest signal per ticker
  const { data: sigs } = await sb
    .from("signals")
    .select("*")
    .order("ts", { ascending: false })
    .limit(200);

  const seen = new Set<string>();
  const latest: any[] = [];
  for (const s of (sigs ?? []) as any[]) {
    if (seen.has(s.ticker)) continue;
    seen.add(s.ticker);
    latest.push(s);
  }

  // current positions
  const { data: positions } = await sb
    .from("positions")
    .select("*")
    .eq("portfolio_id", pf.id)
    .gt("qty", 0);
  const heldTickers = new Set((positions ?? []).map((p: any) => p.ticker));

  // recommended allocation: equal-weight across active BUYs from best scenario allocPct
  const allocPct = (best?.params as any)?.allocPctPerTrade ?? 0.15;
  const buys = latest.filter((s) => s.kind === "BUY");
  const sells = latest.filter((s) => s.kind === "SELL" && heldTickers.has(s.ticker));
  const holds = latest.filter((s) => s.kind === "HOLD");

  const actions = [
    ...sells.map((s) => ({
      action: "SELL" as const,
      ticker: s.ticker,
      reason: (s.reasons ?? []).join(" · "),
      score: s.score,
      ts: s.ts,
      allocation_krw: null,
      fact_ids: s.fact_ids ?? [],
    })),
    ...buys.map((s) => ({
      action: "BUY" as const,
      ticker: s.ticker,
      reason: (s.reasons ?? []).join(" · "),
      score: s.score,
      ts: s.ts,
      allocation_krw: Math.round(Number(pf.cash) * allocPct),
      fact_ids: s.fact_ids ?? [],
    })),
    ...holds.slice(0, 5).map((s) => ({
      action: "HOLD" as const,
      ticker: s.ticker,
      reason: (s.reasons ?? []).join(" · "),
      score: s.score,
      ts: s.ts,
      allocation_krw: null,
      fact_ids: s.fact_ids ?? [],
    })),
  ];

  return {
    best_scenario: best,
    cash: Number(pf.cash),
    actions,
    counts: { buy: buys.length, sell: sells.length, hold: holds.length },
  };
});
