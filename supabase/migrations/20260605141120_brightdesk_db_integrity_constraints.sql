-- P0-3: 핵심 테이블 정합성/중복 방지 제약 추가

-- raw_documents: content_hash 기반 중복 방지 (이미 dedupe 로직이 있는데 DB 레벨도 보강)
CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_documents_content_hash
  ON public.raw_documents (content_hash)
  WHERE content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_documents_source_external_id
  ON public.raw_documents (source, external_id)
  WHERE external_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.raw_documents'::regclass
      AND conname = 'raw_documents_reliability_range'
  ) THEN
    ALTER TABLE public.raw_documents
      ADD CONSTRAINT raw_documents_reliability_range
      CHECK (reliability IS NULL OR (reliability >= 0 AND reliability <= 1));
  END IF;
END $$;

-- kb_facts: fact_key 중복 방지와 신뢰도 범위 검증
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kb_facts'::regclass
      AND conname = 'kb_facts_fact_key_key'
  ) THEN
    ALTER TABLE public.kb_facts
      ADD CONSTRAINT kb_facts_fact_key_key UNIQUE (fact_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kb_facts'::regclass
      AND conname = 'kb_facts_score_range'
  ) THEN
    ALTER TABLE public.kb_facts
      ADD CONSTRAINT kb_facts_score_range
      CHECK (
        sentiment IS NULL OR (sentiment >= -1 AND sentiment <= 1)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kb_facts'::regclass
      AND conname = 'kb_facts_reliability_range'
  ) THEN
    ALTER TABLE public.kb_facts
      ADD CONSTRAINT kb_facts_reliability_range
      CHECK (reliability IS NULL OR (reliability >= 0 AND reliability <= 1));
  END IF;
END $$;

-- signals: 신호 점수/신뢰도 범위 + 중복/성능 보강
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signals'::regclass
      AND conname = 'signals_score_range'
  ) THEN
    ALTER TABLE public.signals
      ADD CONSTRAINT signals_score_range
      CHECK (score >= -3 AND score <= 3);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signals'::regclass
      AND conname = 'signals_confidence_range'
  ) THEN
    ALTER TABLE public.signals
      ADD CONSTRAINT signals_confidence_range
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_signals_ticker_kind_ts
  ON public.signals (ticker, kind, ts DESC);

-- portfolios / positions / transactions / snapshots 정합성 제약
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.portfolios'::regclass
      AND conname = 'portfolios_cash_range'
  ) THEN
    ALTER TABLE public.portfolios
      ADD CONSTRAINT portfolios_cash_range
      CHECK (initial_cash >= 0 AND cash >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.positions'::regclass
      AND conname = 'positions_qty_nonnegative'
  ) THEN
    ALTER TABLE public.positions
      ADD CONSTRAINT positions_qty_nonnegative
      CHECK (qty >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.positions'::regclass
      AND conname = 'positions_avg_price_nonnegative'
  ) THEN
    ALTER TABLE public.positions
      ADD CONSTRAINT positions_avg_price_nonnegative
      CHECK (avg_price >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_qty_positive'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_qty_positive
      CHECK (qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_price_positive'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_price_positive
      CHECK (price > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_cost_nonnegative'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_cost_nonnegative
      CHECK (fee >= 0 AND tax >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_signal_id ON public.transactions (signal_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.portfolio_snapshots'::regclass
      AND conname = 'portfolio_snapshots_nonnegative_value'
  ) THEN
    ALTER TABLE public.portfolio_snapshots
      ADD CONSTRAINT portfolio_snapshots_nonnegative_value
      CHECK (cash >= 0 AND holdings_value >= 0 AND total_value >= 0);
  END IF;
END $$;

-- signal_outcomes: signal_id 무결성
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signal_outcomes'::regclass
      AND conname = 'signal_outcomes_entry_price_positive'
  ) THEN
    ALTER TABLE public.signal_outcomes
      ADD CONSTRAINT signal_outcomes_entry_price_positive
      CHECK (entry_price > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signal_outcomes'::regclass
      AND conname = 'signal_outcomes_score_range'
  ) THEN
    ALTER TABLE public.signal_outcomes
      ADD CONSTRAINT signal_outcomes_score_range
      CHECK (score IS NULL OR (score >= -3 AND score <= 3));
  END IF;
END $$;
