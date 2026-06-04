
DO $$ BEGIN
  CREATE TYPE public.source_type AS ENUM ('broker_pdf','mijueun_youtube','snoomi_kakao','news');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.kb_domain AS ENUM ('macro','theme','news','politics');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.raw_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source public.source_type NOT NULL,
  external_id TEXT,
  content_hash TEXT,
  title TEXT,
  body TEXT,
  r2_key TEXT,
  reliability NUMERIC,
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  meta JSONB
);

CREATE TABLE IF NOT EXISTS public.kb_facts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain public.kb_domain NOT NULL,
  fact_key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  related_tickers TEXT[],
  sentiment NUMERIC,
  reliability NUMERIC,
  source_doc_ids UUID[],
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

GRANT SELECT ON public.raw_documents TO anon, authenticated;
GRANT ALL ON public.raw_documents TO service_role;
GRANT SELECT, UPDATE ON public.kb_facts TO anon, authenticated;
GRANT ALL ON public.kb_facts TO service_role;

ALTER TABLE public.raw_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_documents readable to all" ON public.raw_documents FOR SELECT USING (true);
CREATE POLICY "kb_facts readable to all" ON public.kb_facts FOR SELECT USING (true);
CREATE POLICY "kb_facts toggle is_active" ON public.kb_facts FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS kb_facts_related_tickers_idx ON public.kb_facts USING GIN (related_tickers);
CREATE INDEX IF NOT EXISTS kb_facts_domain_idx ON public.kb_facts (domain);
CREATE INDEX IF NOT EXISTS kb_facts_updated_at_idx ON public.kb_facts (updated_at DESC);
CREATE INDEX IF NOT EXISTS raw_documents_source_idx ON public.raw_documents (source);
CREATE INDEX IF NOT EXISTS raw_documents_published_at_idx ON public.raw_documents (published_at DESC);
