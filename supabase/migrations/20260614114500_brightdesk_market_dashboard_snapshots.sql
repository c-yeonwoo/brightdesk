CREATE TABLE IF NOT EXISTS public.market_dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text,
  session_label text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  regime text NOT NULL,
  trend text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  headline text NOT NULL,
  summary text,
  top_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_themes text[] NOT NULL DEFAULT '{}',
  risk_alerts text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_dashboard_snapshots_generated_at
  ON public.market_dashboard_snapshots (generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_dashboard_snapshots_run_key
  ON public.market_dashboard_snapshots (run_key)
  WHERE run_key IS NOT NULL;

GRANT SELECT, INSERT ON public.market_dashboard_snapshots TO service_role;
GRANT SELECT ON public.market_dashboard_snapshots TO anon, authenticated;

ALTER TABLE public.market_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market dashboard snapshots readable" ON public.market_dashboard_snapshots
  FOR SELECT USING (true);

CREATE POLICY "market dashboard snapshots service role insert" ON public.market_dashboard_snapshots
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
