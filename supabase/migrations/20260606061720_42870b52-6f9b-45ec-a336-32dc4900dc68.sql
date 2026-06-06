
-- Drop all overly permissive "public" policies. Server code uses service_role
-- (which bypasses RLS), so anon/authenticated need no direct access.

DROP POLICY IF EXISTS "fundamentals public read" ON public.fundamentals;
DROP POLICY IF EXISTS "indicators public read" ON public.indicators;
DROP POLICY IF EXISTS "kb_facts readable to all" ON public.kb_facts;
DROP POLICY IF EXISTS "kb_facts toggle is_active" ON public.kb_facts;
DROP POLICY IF EXISTS "snapshots public read" ON public.portfolio_snapshots;
DROP POLICY IF EXISTS "portfolios public read" ON public.portfolios;
DROP POLICY IF EXISTS "positions public read" ON public.positions;
DROP POLICY IF EXISTS "prices public read" ON public.prices;
DROP POLICY IF EXISTS "raw_documents readable to all" ON public.raw_documents;
DROP POLICY IF EXISTS "rebal recs public insert" ON public.rebalance_recommendations;
DROP POLICY IF EXISTS "rebal recs public read" ON public.rebalance_recommendations;
DROP POLICY IF EXISTS "scenarios public read" ON public.scenarios;
DROP POLICY IF EXISTS "signal_outcomes public read" ON public.signal_outcomes;
DROP POLICY IF EXISTS "signals public read" ON public.signals;
DROP POLICY IF EXISTS "transactions public read" ON public.transactions;
DROP POLICY IF EXISTS "user_inputs public all" ON public.user_portfolio_inputs;

-- Revoke any direct grants to anon/authenticated; service_role keeps full access.
REVOKE ALL ON public.fundamentals, public.indicators, public.kb_facts,
  public.portfolio_snapshots, public.portfolios, public.positions, public.prices,
  public.raw_documents, public.rebalance_recommendations, public.scenarios,
  public.signal_outcomes, public.signals, public.transactions,
  public.user_portfolio_inputs
  FROM anon, authenticated;
