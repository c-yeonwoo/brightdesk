-- 소스 레지스트리/확장형 수집 파이프라인 기반 추가
-- 목적: source enum 의존 제거 및 신규 채널 추가 시 전략(설정) 기반 등록 가능

-- 1) 수집 소스 메타데이터 레지스트리
CREATE TABLE IF NOT EXISTS public.source_registry (
  source_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'rss',
  description TEXT,
  domain_hint TEXT,
  default_reliability NUMERIC,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  parser_version TEXT NOT NULL DEFAULT 'kb-facts-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) 기존 raw_documents source enum -> text 변환 (향후 신규 source 유연 등록)
DO $$
BEGIN
  ALTER TABLE public.raw_documents
    ALTER COLUMN source TYPE TEXT
    USING source::text;
EXCEPTION
  WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    RAISE;
END
$$;

-- 3) 운영/디버그 용 메타데이터
ALTER TABLE public.raw_documents
  ADD COLUMN IF NOT EXISTS source_profile_key TEXT;

ALTER TABLE public.raw_documents
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT;

-- 4) KB Fact에도 파이프라인 버전 추적 추가 (정제 버전 추적)
ALTER TABLE public.kb_facts
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT;

-- 5) 인덱스/무결성 보강
CREATE INDEX IF NOT EXISTS raw_documents_source_profile_key_idx
  ON public.raw_documents (source_profile_key);

CREATE INDEX IF NOT EXISTS raw_documents_pipeline_version_idx
  ON public.raw_documents (pipeline_version);

CREATE INDEX IF NOT EXISTS kb_facts_pipeline_version_idx
  ON public.kb_facts (pipeline_version);

-- 6) 기본 소스 레지스트리 시드 (현재 운영 소스 기준)
INSERT INTO public.source_registry (source_key, display_name, description, domain_hint, default_reliability, parser_version)
VALUES
  ('broker_pdf', '증권사 리포트 RSS', '브로커/증권사 브리핑 소스', 'finance', 0.85, 'kb-facts-v1'),
  ('mijueun_youtube', '미주은 유튜브 RSS', '유튜브 업데이트/해설 채널', 'theme', 0.60, 'kb-facts-v1'),
  ('snoomi_kakao', '스누미 카카오 RSS', '카카오 채널 기반 뉴스형 콘텐츠', 'news', 0.40, 'kb-facts-v1'),
  ('news', '뉴스 RSS', '외부 주요 뉴스 RSS', 'news', 0.75, 'kb-facts-v1')
ON CONFLICT (source_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  domain_hint = EXCLUDED.domain_hint,
  default_reliability = EXCLUDED.default_reliability,
  parser_version = EXCLUDED.parser_version;

-- 7) FK: 수집 소스와 레지스트리 관계(없으면 null 허용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'raw_documents_source_profile_fkey'
      AND conrelid = 'public.raw_documents'::regclass
  ) THEN
    ALTER TABLE public.raw_documents
      ADD CONSTRAINT raw_documents_source_profile_fkey
      FOREIGN KEY (source_profile_key)
      REFERENCES public.source_registry (source_key)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

-- 8) 파이프라인 버전 자동 반영(간단 동기화용)
CREATE OR REPLACE FUNCTION public.touch_source_registry_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_source_registry_updated_at ON public.source_registry;
CREATE TRIGGER trg_source_registry_updated_at
  BEFORE UPDATE ON public.source_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_source_registry_updated_at();
