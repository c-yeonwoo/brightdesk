// Server-only: data collectors for the 4 sources.
// Each collector produces RawDocument candidates; orchestrator dedupes by content_hash.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHash } from "crypto";

export type SourceType = "broker_pdf" | "mijueun_youtube" | "snoomi_kakao" | "news";

export interface RawDocCandidate {
  source: SourceType;
  external_id: string | null;
  title: string;
  body: string;
  published_at: string; // ISO
  reliability: number; // 0..1
  meta?: Record<string, unknown>;
}

export interface Collector {
  source: SourceType;
  fetch(): Promise<RawDocCandidate[]>;
}

function hashOf(c: RawDocCandidate) {
  return createHash("sha256")
    .update(`${c.source}::${c.external_id ?? c.title}::${c.body.slice(0, 4096)}`)
    .digest("hex");
}

// ---------- Mock collectors (Phase 1 skeleton) ----------
// Replace fetch() implementations with real Playwright / RSS / PDF / YouTube fetchers later.

const sampleTickers = ["005930", "000660", "035720", "035420", "207940", "AAPL", "NVDA", "TSLA"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function nowMinus(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const brokerPdf: Collector = {
  source: "broker_pdf",
  async fetch() {
    const t = pick(sampleTickers);
    return [
      {
        source: "broker_pdf",
        external_id: `broker-${Date.now()}`,
        title: `[증권사 리포트] ${t} 목표주가 상향`,
        body: `${t} 관련 증권사 분석 요약. 실적 가이던스 상회, 목표주가 상향. AI 수요 견조, 마진 개선 기대. 매수 의견 유지.`,
        published_at: nowMinus(30),
        reliability: 0.85,
        meta: { synthetic: true, ticker: t },
      },
    ];
  },
};

const mijueun: Collector = {
  source: "mijueun_youtube",
  async fetch() {
    return [
      {
        source: "mijueun_youtube",
        external_id: `miju-${Date.now()}`,
        title: "미주은 데일리: 빅테크 실적 시즌 점검",
        body: "엔비디아 데이터센터 매출 강세 지속. 애플 서비스 부문 견조. 테슬라 자율주행 마진 압박 지속.",
        published_at: nowMinus(60),
        reliability: 0.6,
        meta: { synthetic: true, channel: "mijueun" },
      },
    ];
  },
};

const snoomi: Collector = {
  source: "snoomi_kakao",
  async fetch() {
    const t = pick(sampleTickers);
    return [
      {
        source: "snoomi_kakao",
        external_id: `snoomi-${Date.now()}`,
        title: `[스누미 단체방] ${t} 단기 모멘텀 언급`,
        body: `${t} 거래량 급증, 단기 모멘텀 발생. 차트 상 골든크로스 임박. 다만 분할 매수 의견.`,
        published_at: nowMinus(15),
        reliability: 0.4,
        meta: { synthetic: true, room: "snoomi-main", ticker: t },
      },
    ];
  },
};

const news: Collector = {
  source: "news",
  async fetch() {
    return [
      {
        source: "news",
        external_id: `news-${Date.now()}`,
        title: "美 연준, 9월 금리 동결 시사 — 시장 안도",
        body: "FOMC 위원들이 추가 인상에 신중한 입장을 보이며 시장은 안도. 반도체·성장주 상승 흐름. 10년물 국채금리 하락.",
        published_at: nowMinus(10),
        reliability: 0.75,
        meta: { synthetic: true, outlet: "demo-wire" },
      },
    ];
  },
};

export const collectors: Collector[] = [brokerPdf, mijueun, snoomi, news];

// ---------- Orchestration ----------

export async function runCollection(): Promise<{
  collected: number;
  inserted: number;
  skipped: number;
  bySource: Record<string, { inserted: number; skipped: number }>;
}> {
  const bySource: Record<string, { inserted: number; skipped: number }> = {};
  let collected = 0;
  let inserted = 0;
  let skipped = 0;

  for (const c of collectors) {
    bySource[c.source] = { inserted: 0, skipped: 0 };
    let docs: RawDocCandidate[] = [];
    try {
      docs = await c.fetch();
    } catch (err) {
      console.error(`[collector:${c.source}]`, err);
      continue;
    }
    collected += docs.length;

    for (const d of docs) {
      const content_hash = hashOf(d);
      // dedupe by content_hash
      const { data: existing } = await supabaseAdmin
        .from("raw_documents")
        .select("id")
        .eq("content_hash", content_hash)
        .maybeSingle();

      if (existing) {
        skipped++;
        bySource[c.source].skipped++;
        continue;
      }

      const { error } = await supabaseAdmin.from("raw_documents").insert({
        source: d.source,
        external_id: d.external_id,
        content_hash,
        title: d.title,
        body: d.body,
        reliability: d.reliability,
        published_at: d.published_at,
        meta: (d.meta ?? {}) as any,
      });
      if (error) {
        console.error(`[collector:${c.source}] insert error`, error.message);
        continue;
      }
      inserted++;
      bySource[c.source].inserted++;
    }
  }

  return { collected, inserted, skipped, bySource };
}

// ---------- LLM refiner (Phase 2) ----------

interface ExtractedFact {
  domain: "macro" | "theme" | "news" | "politics";
  fact_key: string; // stable slug
  title: string;
  summary: string;
  related_tickers: string[];
  sentiment: number; // -1..1
  reliability: number; // 0..1
}

async function callLovableAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY 미설정");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

const REFINER_SYSTEM = `너는 한국 주식 투자용 지식베이스 정제 에이전트다.
입력된 원본 문서에서 투자 의사결정에 유의미한 facts만 추출해서 JSON으로 반환한다.

도메인 정의:
- macro: 금리/환율/유가/거시지표/연준/한은 등
- theme: AI/반도체/2차전지/바이오 같은 산업·테마 흐름
- news: 개별 기업 이벤트(실적, 인수합병, 신제품)
- politics: 정책/규제/지정학 (트럼프, IRA, 중국 규제 등)

규칙:
- fact_key는 영문 소문자+하이픈 슬러그 (예: "fed-sep-hold", "nvda-dc-revenue-strength")
- related_tickers는 한국주(6자리 코드) 또는 미국주(티커) 배열
- sentiment: 해당 ticker(혹은 시장 전체)에 대한 영향. -1(매우 부정) ~ 1(매우 긍정)
- reliability: 원문 신뢰도와 fact의 확실성을 곱한 값 0..1
- 의미 없는 잡담/광고는 제외하고 빈 배열 반환

응답 스키마: {"facts": ExtractedFact[]}`;

export async function refineOne(docId: string): Promise<{ ok: boolean; facts: number; error?: string }> {
  const { data: doc, error } = await supabaseAdmin
    .from("raw_documents")
    .select("*")
    .eq("id", docId)
    .maybeSingle();
  if (error || !doc) return { ok: false, facts: 0, error: error?.message ?? "doc not found" };

  const d = doc as unknown as {
    id: string;
    source: string;
    title: string | null;
    body: string | null;
    reliability: number | null;
  };

  const userPrompt = `소스: ${d.source}
원본 신뢰도: ${d.reliability ?? "?"}
제목: ${d.title ?? ""}
본문:
${(d.body ?? "").slice(0, 6000)}

위 문서에서 facts를 추출해 JSON 으로 반환.`;

  let raw: string;
  try {
    raw = await callLovableAI(REFINER_SYSTEM, userPrompt);
  } catch (err: unknown) {
    return { ok: false, facts: 0, error: (err as Error).message };
  }

  let parsed: { facts?: ExtractedFact[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, facts: 0, error: "AI 응답 JSON 파싱 실패" };
  }

  const facts = (parsed.facts ?? []).filter((f) => f.fact_key && f.title && f.domain);

  for (const f of facts) {
    // upsert by fact_key
    const { data: existing } = await supabaseAdmin
      .from("kb_facts")
      .select("id, source_doc_ids")
      .eq("fact_key", f.fact_key)
      .maybeSingle();

    if (existing) {
      const ex = existing as unknown as { id: string; source_doc_ids: string[] | null };
      const merged = Array.from(new Set([...(ex.source_doc_ids ?? []), d.id]));
      await (supabaseAdmin.from("kb_facts") as any)
        .update({
          title: f.title,
          summary: f.summary,
          related_tickers: f.related_tickers ?? [],
          sentiment: f.sentiment,
          reliability: f.reliability,
          source_doc_ids: merged,
          updated_at: new Date().toISOString(),
          is_active: true,
        })
        .eq("id", ex.id);
    } else {
      await supabaseAdmin.from("kb_facts").insert({
        domain: f.domain,
        fact_key: f.fact_key,
        title: f.title,
        summary: f.summary,
        related_tickers: f.related_tickers ?? [],
        sentiment: f.sentiment,
        reliability: f.reliability,
        source_doc_ids: [d.id],
        is_active: true,
      });
    }
  }

  await (supabaseAdmin.from("raw_documents") as any)
    .update({ processed_at: new Date().toISOString() })
    .eq("id", d.id);

  return { ok: true, facts: facts.length };
}

export async function runRefiner(limit = 10): Promise<{
  processed: number;
  factsCreated: number;
  errors: string[];
}> {
  const { data: queue } = await supabaseAdmin
    .from("raw_documents")
    .select("id")
    .is("processed_at", null)
    .order("collected_at", { ascending: true })
    .limit(limit);

  const ids = ((queue ?? []) as Array<{ id: string }>).map((r) => r.id);
  let factsCreated = 0;
  const errors: string[] = [];

  for (const id of ids) {
    const r = await refineOne(id);
    if (r.ok) factsCreated += r.facts;
    else errors.push(`${id}: ${r.error}`);
  }

  return { processed: ids.length, factsCreated, errors };
}
