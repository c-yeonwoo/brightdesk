import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

export function getKbClient() {
  if (cached) return cached;
  const url = process.env.KB_SUPABASE_URL;
  const key = process.env.KB_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("KB_SUPABASE_URL / KB_SUPABASE_ANON_KEY 환경변수가 설정되어 있지 않습니다.");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export type SourceType = "broker_pdf" | "mijueun_youtube" | "snoomi_kakao" | "news";
export type KbDomain = "macro" | "theme" | "news" | "politics";

export interface RawDocument {
  id: string;
  source: SourceType;
  external_id: string | null;
  content_hash: string | null;
  title: string | null;
  body: string | null;
  r2_key: string | null;
  reliability: number | null;
  published_at: string | null;
  collected_at: string | null;
  processed_at: string | null;
  meta: Record<string, unknown> | null;
}

export interface KbFact {
  id: string;
  domain: KbDomain;
  fact_key: string;
  title: string;
  summary: string | null;
  related_tickers: string[] | null;
  sentiment: number | null;
  reliability: number | null;
  source_doc_ids: string[] | null;
  first_seen_at: string;
  updated_at: string;
  is_active: boolean;
}
