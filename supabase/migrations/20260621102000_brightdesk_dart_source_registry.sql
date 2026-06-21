INSERT INTO public.source_registry (
  source_key,
  display_name,
  kind,
  description,
  domain_hint,
  default_reliability,
  parser_version
)
VALUES
  (
    'dart_disclosure',
    'DART 공시 API',
    'api',
    '금융감독원 OpenDART 공식 공시 목록 API. 국내 상장사 실적, 주요사항보고, 지분, 감사 관련 공시 수집에 사용한다.',
    'news',
    0.9,
    'kb-facts-v1'
  )
ON CONFLICT (source_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  kind = EXCLUDED.kind,
  description = EXCLUDED.description,
  domain_hint = EXCLUDED.domain_hint,
  default_reliability = EXCLUDED.default_reliability,
  parser_version = EXCLUDED.parser_version;
