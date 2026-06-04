
CREATE TYPE public.signal_kind AS ENUM ('BUY','SELL','HOLD');

CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  kind public.signal_kind NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  rsi14 numeric,
  macd_hist numeric,
  fact_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signals_ticker_ts_idx ON public.signals (ticker, ts DESC);
CREATE INDEX signals_ts_idx ON public.signals (ts DESC);

GRANT SELECT ON public.signals TO anon, authenticated;
GRANT ALL ON public.signals TO service_role;

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signals public read" ON public.signals FOR SELECT USING (true);
