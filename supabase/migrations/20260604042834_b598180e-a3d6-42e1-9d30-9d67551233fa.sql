
CREATE TYPE public.txn_side AS ENUM ('BUY','SELL');

CREATE TABLE public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  initial_cash numeric NOT NULL DEFAULT 10000000,
  cash numeric NOT NULL DEFAULT 10000000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portfolios TO anon, authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolios public read" ON public.portfolios FOR SELECT USING (true);

CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, ticker)
);
GRANT SELECT ON public.positions TO anon, authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "positions public read" ON public.positions FOR SELECT USING (true);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  side public.txn_side NOT NULL,
  qty numeric NOT NULL,
  price numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  signal_id uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  note text
);
GRANT SELECT ON public.transactions TO anon, authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions public read" ON public.transactions FOR SELECT USING (true);
CREATE INDEX idx_transactions_portfolio_executed ON public.transactions(portfolio_id, executed_at DESC);

CREATE TABLE public.portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  date date NOT NULL,
  cash numeric NOT NULL,
  holdings_value numeric NOT NULL,
  total_value numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, date)
);
GRANT SELECT ON public.portfolio_snapshots TO anon, authenticated;
GRANT ALL ON public.portfolio_snapshots TO service_role;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots public read" ON public.portfolio_snapshots FOR SELECT USING (true);

CREATE TABLE public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  sharpe numeric,
  total_return numeric,
  mdd numeric,
  score numeric,
  ran_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scenarios TO anon, authenticated;
GRANT ALL ON public.scenarios TO service_role;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenarios public read" ON public.scenarios FOR SELECT USING (true);

-- Seed default portfolio
INSERT INTO public.portfolios (name, initial_cash, cash) VALUES ('default', 10000000, 10000000)
ON CONFLICT (name) DO NOTHING;
