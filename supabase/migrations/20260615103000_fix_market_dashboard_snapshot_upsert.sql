DROP INDEX IF EXISTS public.idx_market_dashboard_snapshots_run_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_dashboard_snapshots_run_key
  ON public.market_dashboard_snapshots (run_key);

GRANT SELECT, INSERT, UPDATE ON public.market_dashboard_snapshots TO service_role;

DROP POLICY IF EXISTS "market dashboard snapshots service role update" ON public.market_dashboard_snapshots;
CREATE POLICY "market dashboard snapshots service role update" ON public.market_dashboard_snapshots
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
