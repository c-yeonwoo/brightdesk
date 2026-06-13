INSERT INTO public.source_registry (
  source_key,
  display_name,
  description,
  domain_hint,
  default_reliability,
  parser_version
)
VALUES (
  'manual_upload',
  '수동 업로드 문서',
  '사용자가 업로드한 text, PDF, image 기반 투자 문서',
  'mixed',
  0.72,
  'kb-facts-v1'
)
ON CONFLICT (source_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  domain_hint = EXCLUDED.domain_hint,
  default_reliability = EXCLUDED.default_reliability,
  parser_version = EXCLUDED.parser_version;
