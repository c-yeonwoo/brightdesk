CREATE TABLE IF NOT EXISTS public.cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL,
  run_key text NOT NULL,
  request_id text,
  request_method text,
  request_url text,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (namespace, run_key)
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_namespace_run_key ON public.cron_runs (namespace, run_key);
CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at ON public.cron_runs (started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.cron_runs TO service_role;
GRANT SELECT ON public.cron_runs TO anon, authenticated;

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_runs service role only" ON public.cron_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
