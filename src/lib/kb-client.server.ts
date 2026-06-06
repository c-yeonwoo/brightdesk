import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getKbClient() {
  return supabaseAdmin;
}

export type SourceType = string;
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
