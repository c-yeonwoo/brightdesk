
CREATE TABLE public.prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  date date NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume bigint NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'yahoo',
  inserted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, date)
);
CREATE INDEX idx_prices_ticker_date ON public.prices (ticker, date DESC);

CREATE TABLE public.indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  date date NOT NULL,
  rsi14 numeric,
  macd numeric,
  macd_signal numeric,
  macd_hist numeric,
  ma20 numeric,
  ma60 numeric,
  ma120 numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, date)
);
CREATE INDEX idx_indicators_ticker_date ON public.indicators (ticker, date DESC);

GRANT SELECT ON public.prices TO anon, authenticated;
GRANT ALL ON public.prices TO service_role;
GRANT SELECT ON public.indicators TO anon, authenticated;
GRANT ALL ON public.indicators TO service_role;

ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prices public read" ON public.prices FOR SELECT USING (true);
CREATE POLICY "indicators public read" ON public.indicators FOR SELECT USING (true);
