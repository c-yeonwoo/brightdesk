
-- Track 구분: portfolios에 kind/owner_id
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'system' CHECK (kind IN ('system','user'));
ALTER TABLE public.portfolios ADD COLUMN IF NOT EXISTS owner_id UUID;

-- 시그널 3-팩터 점수 분해
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS technical_score NUMERIC;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS fundamental_score NUMERIC;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS kb_score NUMERIC;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS weights JSONB;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS confidence NUMERIC;

-- 기본적 분석 데이터
CREATE TABLE IF NOT EXISTS public.fundamentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  as_of DATE NOT NULL,
  per NUMERIC,
  pbr NUMERIC,
  roe NUMERIC,
  revenue_growth NUMERIC,
  debt_ratio NUMERIC,
  dividend_yield NUMERIC,
  source TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, as_of)
);
GRANT SELECT ON public.fundamentals TO anon, authenticated;
GRANT ALL ON public.fundamentals TO service_role;
ALTER TABLE public.fundamentals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fundamentals public read" ON public.fundamentals FOR SELECT USING (true);

-- 시그널 승률 추적
CREATE TABLE IF NOT EXISTS public.signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  kind TEXT NOT NULL,
  score NUMERIC,
  entry_date DATE NOT NULL,
  entry_price NUMERIC NOT NULL,
  ret_5d NUMERIC,
  ret_20d NUMERIC,
  hit BOOLEAN,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signal_id)
);
GRANT SELECT ON public.signal_outcomes TO anon, authenticated;
GRANT ALL ON public.signal_outcomes TO service_role;
ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_outcomes public read" ON public.signal_outcomes FOR SELECT USING (true);

-- 유저 포트폴리오 입력 (Track B)
CREATE TABLE IF NOT EXISTS public.user_portfolio_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  avg_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_portfolio_inputs TO anon, authenticated;
GRANT ALL ON public.user_portfolio_inputs TO service_role;
ALTER TABLE public.user_portfolio_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_inputs public all" ON public.user_portfolio_inputs FOR ALL USING (true) WITH CHECK (true);

-- AI 재구성 추천 결과
CREATE TABLE IF NOT EXISTS public.rebalance_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  rationale TEXT,
  expected_return NUMERIC,
  expected_risk NUMERIC
);
GRANT SELECT, INSERT ON public.rebalance_recommendations TO anon, authenticated;
GRANT ALL ON public.rebalance_recommendations TO service_role;
ALTER TABLE public.rebalance_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rebal recs public read" ON public.rebalance_recommendations FOR SELECT USING (true);
CREATE POLICY "rebal recs public insert" ON public.rebalance_recommendations FOR INSERT WITH CHECK (true);

-- 기존 default 포트폴리오를 system으로 마킹
UPDATE public.portfolios SET kind = 'system' WHERE name = 'default';
