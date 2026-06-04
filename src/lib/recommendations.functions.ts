import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HoldingSchema = z.object({
  ticker: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-^]+$/),
  qty: z.number().min(0),
  avg_price: z.number().nullable().optional(),
});

const RecRequest = z.object({
  portfolio_id: z.string().uuid().optional(),
  holdings: z.array(HoldingSchema).min(0).max(50),
  candidate_tickers: z.array(z.string().min(1).max(20)).max(50).optional(),
  save: z.boolean().optional(),
});

export const generateRebalanceRecommendation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RecRequest.parse(d))
  .handler(async ({ data }) => {
    const { generateRecommendation, saveRecommendation } = await import("./recommendations.server");
    const { getOrCreateUserPortfolio } = await import("./portfolio.server");

    const rec = await generateRecommendation({
      holdings: data.holdings,
      candidateTickers: data.candidate_tickers,
    });

    let saved: any = null;
    if (data.save) {
      const pf = data.portfolio_id
        ? { id: data.portfolio_id }
        : await getOrCreateUserPortfolio();
      saved = await saveRecommendation(pf.id, rec);
    }
    return { ...rec, saved };
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("rebalance_recommendations")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveUserHoldings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      holdings: z.array(HoldingSchema).min(0).max(50),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getOrCreateUserPortfolio } = await import("./portfolio.server");
    const pf = await getOrCreateUserPortfolio();
    // 전체 교체
    await supabaseAdmin.from("user_portfolio_inputs").delete().eq("portfolio_id", pf.id);
    if (data.holdings.length > 0) {
      const rows = data.holdings.map((h) => ({
        portfolio_id: pf.id,
        ticker: h.ticker.toUpperCase(),
        qty: h.qty,
        avg_price: h.avg_price ?? null,
      }));
      const { error } = await (supabaseAdmin.from("user_portfolio_inputs") as any).insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, portfolio_id: pf.id, count: data.holdings.length };
  });

export const getUserHoldings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getOrCreateUserPortfolio } = await import("./portfolio.server");
  const pf = await getOrCreateUserPortfolio();
  const { data, error } = await supabaseAdmin
    .from("user_portfolio_inputs")
    .select("*")
    .eq("portfolio_id", pf.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { portfolio_id: pf.id, holdings: data ?? [] };
});
