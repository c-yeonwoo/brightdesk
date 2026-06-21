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
    'fred_api',
    'FRED API',
    'api',
    'St. Louis Fed FRED 공식 거시지표 API. 금리, 인플레이션, 고용, 유가, 달러 유동성 지표 수집에 사용한다.',
    'macro',
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
