import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DOMAINS = ["macro", "theme", "news", "politics"] as const;
const SOURCES = ["broker_pdf", "mijueun_youtube", "snoomi_kakao", "news"] as const;

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

  const bySource = SOURCES.map((s) => {
    const rows = docs.filter((d) => d.source === s);
    const avg =
      rows.length > 0
        ? rows.reduce((acc, r) => acc + (r.reliability ?? 0), 0) / rows.length
        : 0;
    const processed = rows.filter((r) => r.processed_at != null).length;
    return {
      source: s,
      count: rows.length,
      avgReliability: avg,
      processed,
      unprocessed: rows.length - processed,
    };
  });

  return {
    byDomain,
    bySource,
    unprocessedCount: unprocessedRes.count ?? 0,
    totalDocs: docs.length,
    totalFacts: facts.length,
    activeFacts: facts.filter((f) => f.is_active).length,
  };
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

export const getFactDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
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
        source: z.enum(SOURCES).optional(),
        processed: z.enum(["all", "yes", "no"]).optional(),
        q: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
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

export const getDocumentBody = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    const { data: row, error } = await sb
      .from("raw_documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listTickerSuggestions = createServerFn({ method: "GET" }).handler(async () => {
  const { getKbClient } = await import("./kb-client.server");
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
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
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
    const { getKbClient } = await import("./kb-client.server");
    const sb = getKbClient();
    const { error } = await sb
      .from("kb_facts")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
