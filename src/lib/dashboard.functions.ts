import { createServerFn } from "@tanstack/react-start";

// Track A (BrightDesk Live) 통합 대시보드 데이터
export const getLiveDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getOrCreateSystemPortfolio, getPortfolioOverview } = await import("./portfolio.server");

  const pf = await getOrCreateSystemPortfolio();
  const overview = await getPortfolioOverview(pf.id);

  // 자산 곡선 (최근 90일)
  const { data: snapshots } = await supabaseAdmin
    .from("portfolio_snapshots")
    .select("date,cash,holdings_value,total_value")
    .eq("portfolio_id", pf.id)
    .order("date", { ascending: true })
    .limit(180);

  // 24h 시그널/거래 활동
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: recentSigs }, { data: recentTxns }] = await Promise.all([
    supabaseAdmin
      .from("signals")
      .select("id,ticker,ts,kind,score,confidence")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("transactions")
      .select("id,ticker,side,qty,price,executed_at")
      .eq("portfolio_id", pf.id)
      .gte("executed_at", since)
      .order("executed_at", { ascending: false })
      .limit(20),
  ]);

  // KB 최신 인사이트
  const { data: recentFacts } = await supabaseAdmin
    .from("kb_facts")
    .select("id,title,summary,sentiment,reliability,related_tickers,updated_at,domain")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(8);

  return {
    portfolio: overview.portfolio,
    summary: overview.summary,
    positions: overview.positions,
    curve: snapshots ?? [],
    recent_signals: recentSigs ?? [],
    recent_txns: recentTxns ?? [],
    recent_facts: recentFacts ?? [],
  };
});
