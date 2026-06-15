CREATE TABLE IF NOT EXISTS public.user_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  label text,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  last_researched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_active
  ON public.user_watchlist (user_id, is_active, priority, ticker);

CREATE INDEX IF NOT EXISTS idx_user_watchlist_ticker_active
  ON public.user_watchlist (ticker, is_active);

ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_watchlist TO authenticated;
GRANT ALL ON public.user_watchlist TO service_role;

DROP POLICY IF EXISTS "user_watchlist own read" ON public.user_watchlist;
CREATE POLICY "user_watchlist own read" ON public.user_watchlist
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_watchlist own insert" ON public.user_watchlist;
CREATE POLICY "user_watchlist own insert" ON public.user_watchlist
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_watchlist own update" ON public.user_watchlist;
CREATE POLICY "user_watchlist own update" ON public.user_watchlist
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_watchlist own delete" ON public.user_watchlist;
CREATE POLICY "user_watchlist own delete" ON public.user_watchlist
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ticker_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text,
  ticker text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  collected integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  facts_created integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ticker_research_runs_ticker_started
  ON public.ticker_research_runs (ticker, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticker_research_runs_run_key
  ON public.ticker_research_runs (run_key);

ALTER TABLE public.ticker_research_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ticker_research_runs TO authenticated;
GRANT ALL ON public.ticker_research_runs TO service_role;

DROP POLICY IF EXISTS "ticker research runs authenticated read" ON public.ticker_research_runs;
CREATE POLICY "ticker research runs authenticated read" ON public.ticker_research_runs
  FOR SELECT
  USING (auth.role() = 'authenticated');

INSERT INTO public.source_registry (source_key, display_name, kind, description, domain_hint, default_reliability, parser_version)
VALUES
  ('ticker_research', '관심종목 뉴스 RSS', 'rss', '유저 관심종목/보유종목 기반 티커별 자동 리서치', 'news', 0.72, 'kb-facts-v1')
ON CONFLICT (source_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  kind = EXCLUDED.kind,
  description = EXCLUDED.description,
  domain_hint = EXCLUDED.domain_hint,
  default_reliability = EXCLUDED.default_reliability,
  parser_version = EXCLUDED.parser_version;

CREATE OR REPLACE FUNCTION public.touch_user_watchlist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_user_watchlist_updated_at ON public.user_watchlist;
CREATE TRIGGER trg_user_watchlist_updated_at
  BEFORE UPDATE ON public.user_watchlist
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_watchlist_updated_at();
