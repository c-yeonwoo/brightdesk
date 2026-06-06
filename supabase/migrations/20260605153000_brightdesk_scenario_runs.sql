CREATE TABLE IF NOT EXISTS public.scenario_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'running',
  total_scenarios integer NOT NULL DEFAULT 0,
  completed_scenarios integer NOT NULL DEFAULT 0,
  current_scenario text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_runs_started_at ON public.scenario_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_status ON public.scenario_runs (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenario_runs TO service_role;
GRANT SELECT ON public.scenario_runs TO anon, authenticated;

ALTER TABLE public.scenario_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenario_runs service role only" ON public.scenario_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
