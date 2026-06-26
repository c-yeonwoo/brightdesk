import { createHash } from "crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminUser } from "./auth.server";

const DOMAINS = ["macro", "theme", "news", "politics"] as const;
const DOCUMENT_UPLOAD_SOURCE = "manual_upload";

const DocumentUploadSchema = z.object({
  title: z.string().trim().max(240).optional(),
  text: z.string().max(200_000).optional(),
  url: z.string().trim().url().max(2000).optional(),
  fileName: z.string().trim().max(240).optional(),
  mimeType: z.string().trim().max(120).optional(),
  base64: z.string().max(8_000_000).optional(),
  reliability: z.number().min(0).max(1).optional(),
  refine: z.boolean().optional(),
});

function normalizeUploadedText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n").trim();
}

function htmlToText(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractHtmlTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? htmlToText(title).slice(0, 180) : null;
}

async function fetchWebPageText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BrightDesk-DocumentIngest/1.0",
        Accept: "text/html,text/plain,application/xhtml+xml,*/*",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`웹페이지 요청 실패: ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const title = contentType.includes("html") ? extractHtmlTitle(raw) : null;
    const text = contentType.includes("html") ? htmlToText(raw) : normalizeUploadedText(raw);
    return {
      title,
      text: normalizeUploadedText(text).slice(0, 200_000),
    };
  } finally {
    clearTimeout(timer);
  }
}

function hashUploadedDocument(input: {
  title: string;
  text: string;
  fileName?: string;
  mimeType?: string;
}) {
  return createHash("sha256")
    .update(`${DOCUMENT_UPLOAD_SOURCE}::${input.fileName ?? input.title}::${input.mimeType ?? ""}::${input.text.slice(0, 8192)}`)
    .digest("hex");
}

function dataUrlFromBase64(base64: string, mimeType: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  return `data:${mimeType};base64,${clean}`;
}

function bufferFromBase64(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  return Buffer.from(clean, "base64");
}

async function extractPdfText(base64: string) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bufferFromBase64(base64) });
  try {
    const result = await parser.getText();
    return normalizeUploadedText(result.text ?? "");
  } finally {
    await parser.destroy();
  }
}

async function extractImageTextWithAi(args: {
  title: string;
  fileName?: string;
  mimeType: string;
  base64: string;
}) {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL || "gpt-4.1-mini";
  const baseUrl = process.env.AI_GATEWAY_URL || "https://api.openai.com/v1/chat/completions";
  if (!apiKey) {
    throw new Error("PDF/Image 분석에는 AI_API_KEY 또는 OPENAI_API_KEY가 필요합니다.");
  }

  if (!args.mimeType.startsWith("image/")) {
    throw new Error("이미지 분석에는 image/* 형식이 필요합니다.");
  }

  const prompt = `다음 투자 관련 문서에서 텍스트를 추출하고 한국어로 정리해 주세요.

문서명: ${args.fileName ?? args.title}
형식: ${args.mimeType}

반환 규칙:
- 원문 핵심 텍스트를 최대한 보존
- 표/이미지는 투자 판단에 필요한 내용 중심으로 문장화
- 매크로, 국제정세, 산업 흐름, 기업/ETF, 리스크 관련 내용을 빠뜨리지 않기
- 결과는 plain text만 반환`;

  const content = [
    { type: "text", text: prompt },
    {
      type: "image_url",
      image_url: {
        url: dataUrlFromBase64(args.base64, args.mimeType),
      },
    },
  ];

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "너는 투자 문서 OCR/정리 파이프라인이다. 문서 내용을 KB 정제에 넣기 좋은 plain text로 추출한다.",
        },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI file extraction failed ${res.status}: ${body}`);
  }
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { getKbClient } = await import("./kb-client.server");
  const sb = getKbClient();

  const [factsRes, docsRes, unprocessedRes] = await Promise.all([
    sb.from("kb_facts").select("domain,is_active,updated_at,reliability"),
    sb.from("raw_documents").select("source,reliability,processed_at"),
    sb.from("raw_documents").select("id", { count: "exact", head: true }).is("processed_at", null),
  ]);

  if (factsRes.error) throw new Error(factsRes.error.message);
  if (docsRes.error) throw new Error(docsRes.error.message);

  const facts = (factsRes.data ?? []) as Array<{
    domain: string;
    is_active: boolean;
    updated_at: string;
    reliability: number | null;
  }>;
  const docs = (docsRes.data ?? []) as Array<{
    source: string;
    reliability: number | null;
    processed_at: string | null;
  }>;

  const byDomain = DOMAINS.map((d) => {
    const rows = facts.filter((f) => f.domain === d);
    const active = rows.filter((r) => r.is_active);
    const inactive = rows.length - active.length;
    const lastUpdated = rows.reduce<string | null>(
      (acc, r) => (acc == null || r.updated_at > acc ? r.updated_at : acc),
      null,
    );
    const avgRel =
      active.length > 0
        ? active.reduce((s, r) => s + (r.reliability ?? 0), 0) / active.length
        : null;
    return {
      domain: d,
      active: active.length,
      inactive,
      total: rows.length,
      lastUpdated,
      avgReliability: avgRel,
    };
  });

  const bySourceMap = new Map<
    string,
    { source: string; count: number; avgReliability: number; processed: number; unprocessed: number }
  >();
  for (const d of docs) {
    const bucket = bySourceMap.get(d.source) ?? { source: d.source, count: 0, avgReliability: 0, processed: 0, unprocessed: 0 };
    bucket.count += 1;
    bucket.avgReliability += d.reliability ?? 0;
    if (d.processed_at) bucket.processed += 1;
    else bucket.unprocessed += 1;
    bySourceMap.set(d.source, bucket);
  }
  const bySource = Array.from(bySourceMap.values())
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
      ...entry,
      avgReliability:
        entry.count > 0 ? entry.avgReliability / entry.count : 0,
    }));

  return {
    byDomain,
    bySource,
    unprocessedCount: unprocessedRes.count ?? 0,
    totalDocs: docs.length,
    totalFacts: facts.length,
    activeFacts: facts.filter((f) => f.is_active).length,
  };
});

export const uploadDocumentForKb = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DocumentUploadSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mimeType = data.url ? "text/html" : data.mimeType || "text/plain";
    let body = normalizeUploadedText(data.text ?? "");
    let extraction: "text" | "ai_file" = "text";
    let title = data.title?.trim() || data.fileName || data.url || "수동 업로드 문서";

    if (!body && data.url) {
      const web = await fetchWebPageText(data.url);
      body = web.text;
      title = data.title?.trim() || web.title || data.url;
      extraction = "text";
    }

    if (!body && data.base64) {
      body = normalizeUploadedText(
        mimeType === "application/pdf"
          ? await extractPdfText(data.base64)
          : await extractImageTextWithAi({
              title: data.title,
              fileName: data.fileName,
              mimeType,
              base64: data.base64,
            }),
      );
      extraction = mimeType === "application/pdf" ? "text" : "ai_file";
    }

    if (!body || body.length < 20) {
      throw new Error("문서에서 분석 가능한 텍스트를 찾지 못했습니다.");
    }

    const contentHash = hashUploadedDocument({
      title,
      text: body,
      fileName: data.fileName ?? data.url,
      mimeType,
    });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("raw_documents")
      .select("id,processed_at")
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let docId = (existing as any)?.id as string | undefined;
    let inserted = false;

    if (!docId) {
      const { data: row, error } = await (supabaseAdmin.from("raw_documents") as any)
        .insert({
          source: DOCUMENT_UPLOAD_SOURCE,
          external_id: data.url ?? `manual:${data.fileName ?? title}:${contentHash.slice(0, 12)}`,
          content_hash: contentHash,
          title,
          body,
          reliability: data.reliability ?? 0.72,
          published_at: new Date().toISOString(),
          meta: {
            upload_kind: data.url
              ? "web_url"
              : mimeType.startsWith("image/")
                ? "image"
                : mimeType === "application/pdf"
                  ? "pdf"
                  : "text",
            file_name: data.fileName ?? null,
            mime_type: mimeType,
            source_url: data.url ?? null,
            extraction,
          },
          source_profile_key: DOCUMENT_UPLOAD_SOURCE,
          pipeline_version: "kb-facts-v1",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      docId = row.id;
      inserted = true;
    }

    let refineResult: { ok: boolean; facts: number; error?: string } | null = null;
    if (data.refine !== false && docId && !(existing as any)?.processed_at) {
      const { refineOne } = await import("./collectors.server");
      refineResult = await refineOne(docId);
    }

    return {
      ok: true,
      id: docId,
      inserted,
      duplicated: !inserted,
      extraction,
      chars: body.length,
      refine: refineResult,
    };
  });

export const refineDocumentForKb = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { refineOne } = await import("./collectors.server");
    const result = await refineOne(data.id);
    if (!result.ok) {
      throw new Error(result.error ?? "KB 정제 실패");
    }
    return result;
  });

export const listFacts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        domain: z.enum(DOMAINS).optional(),
        activeOnly: z.boolean().optional(),
        ticker: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    let q = sb
      .from("kb_facts")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.domain) q = q.eq("domain", data.domain);
    if (data.activeOnly !== undefined) q = q.eq("is_active", data.activeOnly);
    if (data.ticker) q = q.contains("related_tickers", [data.ticker.toUpperCase()]);
    if (data.q) {
      const t = data.q.replace(/[%]/g, "");
      q = q.or(`title.ilike.%${t}%,summary.ilike.%${t}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listFactsByIds = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();

    if (data.ids.length === 0) {
      return [];
    }

    const { data: rows, error } = await sb
      .from("kb_facts")
      .select("id,title,summary,domain,reliability,sentiment,updated_at,related_tickers")
      .in("id", data.ids)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getFactDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    const { data: factRaw, error } = await sb
      .from("kb_facts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const fact = factRaw as any;
    if (!fact) return { fact: null, sources: [] };
    const ids = (fact.source_doc_ids ?? []) as string[];
    let sources: any[] = [];
    if (ids.length > 0) {
      const { data: docs, error: e2 } = await sb
        .from("raw_documents")
        .select("id,title,source,reliability,published_at")
        .in("id", ids);
      if (e2) throw new Error(e2.message);
      sources = docs ?? [];
    }
    return { fact, sources };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        source: z
          .string()
          .trim()
          .min(1)
          .max(96)
          .regex(/^[a-z0-9._-]+$/i)
          .optional(),
        processed: z.enum(["all", "yes", "no"]).optional(),
        q: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    let q = sb
      .from("raw_documents")
      .select("id,title,source,reliability,published_at,collected_at,processed_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 200);
    if (data.source) q = q.eq("source", data.source);
    if (data.processed === "yes") q = q.not("processed_at", "is", null);
    if (data.processed === "no") q = q.is("processed_at", null);
    if (data.from) q = q.gte("published_at", data.from);
    if (data.to) q = q.lte("published_at", data.to);
    if (data.q) {
      const t = data.q.replace(/[%]/g, "");
      q = q.ilike("title", `%${t}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listSources = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminUser();
  const { getKbClient } = await import("./kb-client.server");
  const sb = getKbClient();

  const { data: rows, error } = await sb
    .from("raw_documents")
    .select("source");
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const source = (row as { source: string }).source?.trim();
    if (!source) continue;
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
});

export const getDocumentBody = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    const { data: row, error } = await sb
      .from("raw_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { data: facts, error: factsError } = await sb
      .from("kb_facts")
      .select("id,domain,title,summary,reliability,sentiment,related_tickers,updated_at,is_active")
      .contains("source_doc_ids", [data.id])
      .order("updated_at", { ascending: false });
    if (factsError) throw new Error(factsError.message);

    return {
      ...(row as any),
      derived_facts: facts ?? [],
    };
  });

export const listTickerSuggestions = createServerFn({ method: "GET" }).handler(async () => {
  const { getKbClient } = await import("./kb-client.server");
  const { getDefaultResearchTickers, getMonitoringUniverse } = await import("./monitoring-universe.server");
  const sb = getKbClient();
  const { data, error } = await sb
    .from("kb_facts")
    .select("related_tickers")
    .eq("is_active", true)
    .limit(1000);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ related_tickers: string[] | null }>) {
    for (const t of row.related_tickers ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const priority = new Map<string, number>();
  const seedTickers = [...getDefaultResearchTickers(), ...getMonitoringUniverse()];
  seedTickers.forEach((ticker, index) => {
    const normalized = ticker.toUpperCase();
    if (!counts.has(normalized)) counts.set(normalized, 0);
    if (!priority.has(normalized)) priority.set(normalized, index);
  });
  return Array.from(counts.entries())
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff !== 0) return countDiff;
      const priorityDiff = (priority.get(a[0]) ?? 999_999) - (priority.get(b[0]) ?? 999_999);
      if (priorityDiff !== 0) return priorityDiff;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 500)
    .map(([ticker, count]) => ({ ticker, count }));
});

export const getFactsByTicker = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ ticker: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    const { data: rows, error } = await sb
      .from("kb_facts")
      .select("*")
      .contains("related_tickers", [data.ticker.toUpperCase()])
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const toggleFactActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdminUser();
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    const { error } = await (sb.from("kb_facts") as any)
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
