import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedUser } from "./auth.server";

const HoldingSchema = z.object({
  ticker: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-^]+$/),
  qty: z.number().min(0),
  avg_price: z.number().nullable().optional(),
});

const RecRequest = z.object({
  holdings: z.array(HoldingSchema).min(0).max(50),
  candidate_tickers: z.array(z.string().min(1).max(20)).max(50).optional(),
  save: z.boolean().optional(),
});

const WatchlistItemSchema = z.object({
  ticker: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-^]+$/),
  label: z.string().trim().max(120).optional().nullable(),
  priority: z.number().int().min(1).max(5).optional(),
});

function normalizeTicker(input: string) {
  return input.trim().toUpperCase();
}

export const generateRebalanceRecommendation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RecRequest.parse(d))
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser();
    const { generateRecommendation, saveRecommendation } = await import("./recommendations.server");
    const { getOrCreateUserPortfolioForUser } = await import("./portfolio.server");
    const pf = await getOrCreateUserPortfolioForUser(userId);

    const rec = await generateRecommendation({
      holdings: data.holdings,
      candidateTickers: data.candidate_tickers,
    });

    let saved: any = null;
    if (data.save) {
      // 저장은 인증된 사용자 포트폴리오에 한정
      saved = await saveRecommendation(pf.id, rec);
    }
    return { ...rec, saved };
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser();
    const { getOrCreateUserPortfolioForUser } = await import("./portfolio.server");
    const pf = await getOrCreateUserPortfolioForUser(userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("rebalance_recommendations")
      .eq("portfolio_id", pf.id)
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
    const userId = await requireAuthenticatedUser();
    const { getOrCreateUserPortfolioForUser } = await import("./portfolio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pf = await getOrCreateUserPortfolioForUser(userId);
    // 전체 교체
    await supabaseAdmin.from("user_portfolio_inputs").delete().eq("portfolio_id", pf.id);
    if (data.holdings.length > 0) {
      const rows = data.holdings.map((h) => ({
        portfolio_id: pf.id,
        ticker: normalizeTicker(h.ticker),
        qty: h.qty,
        avg_price: h.avg_price ?? null,
      }));
      const { error } = await (supabaseAdmin.from("user_portfolio_inputs") as any).insert(rows);
      if (error) throw new Error(error.message);

      const watchRows = data.holdings.map((h) => ({
        user_id: userId,
        ticker: normalizeTicker(h.ticker),
        priority: 2,
        source: "portfolio",
        is_active: true,
      }));
      const { error: watchError } = await (supabaseAdmin.from("user_watchlist") as any).upsert(watchRows, {
        onConflict: "user_id,ticker",
      });
      if (watchError) throw new Error(watchError.message);
    }
    return { ok: true, portfolio_id: pf.id, count: data.holdings.length };
  });

export const getUserHoldings = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireAuthenticatedUser();
  const { getOrCreateUserPortfolioForUser } = await import("./portfolio.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pf = await getOrCreateUserPortfolioForUser(userId);
  const { data, error } = await supabaseAdmin
    .from("user_portfolio_inputs")
    .select("*")
    .eq("portfolio_id", pf.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { portfolio_id: pf.id, holdings: data ?? [] };
});

export const listWatchlist = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireAuthenticatedUser();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("user_watchlist")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const addWatchlistTicker = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WatchlistItemSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      user_id: userId,
      ticker: normalizeTicker(data.ticker),
      label: data.label?.trim() || null,
      priority: data.priority ?? 3,
      source: "manual",
      is_active: true,
    };
    const { error } = await (supabaseAdmin.from("user_watchlist") as any).upsert(row, {
      onConflict: "user_id,ticker",
    });
    if (error) throw new Error(error.message);
    return { ok: true, ticker: row.ticker };
  });

export const removeWatchlistTicker = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ticker: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("user_watchlist")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("ticker", normalizeTicker(data.ticker));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWatchlistInsights = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const userId = await requireAuthenticatedUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: watchRows, error: watchError } = await (supabaseAdmin as any)
      .from("user_watchlist")
      .select("ticker,label,priority,last_researched_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false });
    if (watchError) throw new Error(watchError.message);

    const tickers = Array.from(new Set((watchRows ?? []).map((row: any) => normalizeTicker(row.ticker)).filter(Boolean)));
    if (tickers.length === 0) {
      return { tickers: [], facts: [] };
    }

    const { data: facts, error } = await (supabaseAdmin as any)
      .from("kb_facts")
      .select("id,domain,title,summary,related_tickers,sentiment,reliability,updated_at,first_seen_at")
      .eq("is_active", true)
      .overlaps("related_tickers", tickers)
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 12);
    if (error) throw new Error(error.message);

    return {
      tickers: watchRows ?? [],
      facts: facts ?? [],
    };
  });
