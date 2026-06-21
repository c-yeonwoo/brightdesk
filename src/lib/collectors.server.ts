// Server-only: data collectors for RSS/API sources.
// Each collector produces RawDocument candidates; orchestrator dedupes by content_hash.
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDefaultResearchTickers } from "./monitoring-universe.server";

export type SourceType = string;

type CollectorKind = "rss" | "api";
type RefinerPromptProfile = "kb-facts-v1" | "kb-facts-v2";

export interface RawDocCandidate {
  source: SourceType;
  external_id: string | null;
  title: string;
  body: string;
  published_at: string; // ISO
  reliability: number; // 0..1
  meta?: Record<string, unknown>;
}

export interface CollectorStrategy {
  source: SourceType;
  isEnabled(): boolean;
  fetch(): Promise<RawDocCandidate[]>;
}

export interface CollectorConfig {
  displayName: string;
  kind: CollectorKind;
  source: SourceType;
  feedEnvKey: string;
  reliability: number;
  limit: number;
  bodySuffix?: string;
  parserVersion?: RefinerPromptProfile;
  parser?: (item: ParsedFeedItem, feedUrl: string, index: number) => RawDocCandidate;
}

export interface CollectorFactory {
  build(config: CollectorConfig): CollectorStrategy;
}

export interface SourceProfile {
  source: SourceType;
  displayName: string;
  kind: CollectorKind;
  enabled: boolean;
  reliability: number;
  limit: number;
  parserVersion: RefinerPromptProfile;
}

const rssCollectorFactory: CollectorFactory = {
  build: createRssCollector,
};

type ParsedFeedItem = {
  title: string;
  link: string | null;
  body: string;
  publishedAt: string;
  externalId: string;
};

function hashOf(c: RawDocCandidate) {
  return createHash("sha256")
    .update(`${c.source}::${c.external_id ?? c.title}::${c.body.slice(0, 4096)}`)
    .digest("hex");
}

function safeText(input: string | null | undefined) {
  return (input ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function extractTag(raw: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = raw.match(pattern);
  if (!match?.[1]) return null;
  return safeText(match[1].replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1"));
}

function extractLink(raw: string): string | null {
  const href = raw.match(/<link\\b[^>]*\\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
  if (href) return href;
  return extractTag(raw, "link");
}

function collectBlocks(raw: string, tagName: string) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
  return raw.match(regex) ?? [];
}

function parseFeedItems(raw: string): ParsedFeedItem[] {
  const itemBlocks = collectBlocks(raw, "item");
  const blocks = itemBlocks.length > 0 ? itemBlocks : collectBlocks(raw, "entry");
  const parsed: ParsedFeedItem[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const title = safeText(extractTag(block, "title"));
    const link = extractLink(block);
    const body = safeText(
      extractTag(block, "description") ??
        extractTag(block, "summary") ??
        extractTag(block, "content") ??
        extractTag(block, "content:encoded") ??
        "",
    );
    const publishedAt = normalizeDate(
      extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated"),
    );
    const externalId =
      extractTag(block, "id") || extractTag(block, "guid") || link || `${title}-${publishedAt}`;

    if (!title) continue;
    const key = `${externalId}::${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({
      title,
      link,
      body: body || title,
      publishedAt,
      externalId,
    });
  }

  return parsed;
}

async function fetchFeedText(url: string, source: SourceType): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BrightDesk-Collector/1.0",
        "Accept": "application/xml, text/xml, */*",
      },
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`${source} feed request failed: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultParser(
  source: SourceType,
  item: ParsedFeedItem,
  feedUrl: string,
  idx: number,
  options: { bodySuffix?: string; reliability: number },
): RawDocCandidate {
  return {
    source,
    external_id: `${source}-${item.externalId}-${idx}`,
    title: item.title,
    body: `${item.body}${options.bodySuffix ? `\n\n${options.bodySuffix}` : ""}`.trim(),
    published_at: item.publishedAt,
    reliability: options.reliability,
    meta: { source_url: feedUrl, remote_link: item.link },
  };
}

class RssCollectorStrategy implements CollectorStrategy {
  constructor(private readonly cfg: CollectorConfig) {}

  private get url() {
    return process.env[this.cfg.feedEnvKey] ?? null;
  }

  get source() {
    return this.cfg.source;
  }

  isEnabled() {
    return Boolean(this.url);
  }

  async fetch(): Promise<RawDocCandidate[]> {
    if (!this.url) return [];

    const text = await fetchFeedText(this.url, this.source);
    const limit = toInt(process.env[`${this.cfg.feedEnvKey}_LIMIT`], this.cfg.limit);
    const parser = this.cfg.parser ?? ((item, feedUrl, idx) =>
      defaultParser(this.source, item, feedUrl, idx, {
        bodySuffix: this.cfg.bodySuffix,
        reliability: clamp01(this.cfg.reliability, 0.5),
      })
    );

    return parseFeedItems(text).slice(0, limit).map((item, idx) => {
      const candidate = parser(item, this.url!, idx);
      return {
        ...candidate,
        reliability: clamp01(candidate.reliability, this.cfg.reliability),
      };
    });
  }
}

export function createRssCollector(cfg: CollectorConfig): CollectorStrategy {
  return new RssCollectorStrategy(cfg);
}

function buildCollectors(
  configs: CollectorConfig[],
  factory: CollectorFactory = rssCollectorFactory,
) {
  return configs.map((cfg) => factory.build(cfg));
}

const WELL_KNOWN_TICKER_LABELS: Record<string, string> = {
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  SMH: "Semiconductor ETF",
  SOXX: "iShares Semiconductor ETF",
  XLK: "Technology Select Sector ETF",
  TLT: "20+ Year Treasury Bond ETF",
  IEF: "7-10 Year Treasury Bond ETF",
  GLD: "Gold ETF",
  XLE: "Energy ETF",
  NVDA: "NVIDIA",
  MSFT: "Microsoft",
  AAPL: "Apple",
  AVGO: "Broadcom",
  TSLA: "Tesla",
  META: "Meta Platforms",
  GOOGL: "Alphabet",
  AMZN: "Amazon",
  "005930.KS": "Samsung Electronics",
  "000660.KS": "SK Hynix",
  "035420.KS": "NAVER",
};

function normalizeTicker(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, "");
}

function tickerResearchFeedUrl(ticker: string) {
  return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`;
}

function tickerResearchBodySuffix(ticker: string, label?: string | null) {
  const display = label || WELL_KNOWN_TICKER_LABELS[ticker] || ticker;
  return [
    "source=ticker-research",
    `ticker=${ticker}`,
    `company_or_asset=${display}`,
    `research_context=This document was collected because at least one user holds or watches ${ticker}. Extract facts that affect the ticker, its sector, or relevant macro drivers.`,
  ].join("\n");
}

function createTickerResearchCollector(ticker: string, label?: string | null): CollectorStrategy {
  const normalized = normalizeTicker(ticker);
  const display = label || WELL_KNOWN_TICKER_LABELS[normalized] || normalized;
  const feedUrl = tickerResearchFeedUrl(normalized);
  const limit = toInt(process.env.BRIGHTDESK_TICKER_RESEARCH_RSS_LIMIT, 5);

  return {
    source: "ticker_research",
    isEnabled: () => Boolean(normalized),
    async fetch() {
      const text = await fetchFeedText(feedUrl, `ticker_research:${normalized}`);
      return parseFeedItems(text)
        .slice(0, limit)
        .map((item, idx) =>
          defaultParser("ticker_research", item, feedUrl, idx, {
            reliability: 0.72,
            bodySuffix: tickerResearchBodySuffix(normalized, display),
          }),
        )
        .map((doc, idx) => ({
          ...doc,
          external_id: `ticker-research-${normalized}-${doc.external_id ?? idx}`,
          meta: {
            ...(doc.meta ?? {}),
            ticker: normalized,
            tickers: [normalized],
            research_label: display,
            source_url: feedUrl,
          },
        }));
    },
  };
}

const DEFAULT_FRED_SERIES = [
  "FEDFUNDS",
  "DGS10",
  "DGS2",
  "CPIAUCSL",
  "UNRATE",
  "DCOILWTICO",
  "DTWEXBGS",
];

const FRED_SERIES_LABELS: Record<string, string> = {
  FEDFUNDS: "Effective Federal Funds Rate",
  DGS10: "10-Year Treasury Constant Maturity Rate",
  DGS2: "2-Year Treasury Constant Maturity Rate",
  CPIAUCSL: "Consumer Price Index for All Urban Consumers",
  UNRATE: "Unemployment Rate",
  DCOILWTICO: "WTI Crude Oil Price",
  DTWEXBGS: "Trade Weighted U.S. Dollar Index",
};

function getFredSeriesIds() {
  return (process.env.BRIGHTDESK_FRED_SERIES_IDS ?? DEFAULT_FRED_SERIES.join(","))
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, toInt(process.env.BRIGHTDESK_FRED_SERIES_LIMIT, 12));
}

function latestValidFredObservations(observations: Array<{ date?: string; value?: string }>, limit: number) {
  return observations
    .filter((row) => row.date && row.value && row.value !== ".")
    .slice(-limit);
}

function createFredCollector(): CollectorStrategy {
  return {
    source: "fred_api",
    isEnabled: () => Boolean(process.env.FRED_API_KEY || process.env.BRIGHTDESK_FRED_API_KEY),
    async fetch() {
      const apiKey = process.env.FRED_API_KEY || process.env.BRIGHTDESK_FRED_API_KEY;
      if (!apiKey) return [];

      const observationLimit = toInt(process.env.BRIGHTDESK_FRED_OBSERVATION_LIMIT, 12);
      const docs: RawDocCandidate[] = [];

      for (const seriesId of getFredSeriesIds()) {
        const url = new URL("https://api.stlouisfed.org/fred/series/observations");
        url.searchParams.set("series_id", seriesId);
        url.searchParams.set("api_key", apiKey);
        url.searchParams.set("file_type", "json");
        url.searchParams.set("sort_order", "asc");
        url.searchParams.set("limit", "120");

        const res = await fetch(url, {
          headers: { "User-Agent": "BrightDesk-FRED-Collector/1.0" },
        });
        if (!res.ok) {
          throw new Error(`fred_api ${seriesId} request failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as { observations?: Array<{ date?: string; value?: string }> };
        const rows = latestValidFredObservations(json.observations ?? [], observationLimit);
        if (rows.length === 0) continue;

        const latest = rows[rows.length - 1];
        const label = FRED_SERIES_LABELS[seriesId] ?? seriesId;
        const body = [
          `source=fred-api`,
          `series_id=${seriesId}`,
          `series_label=${label}`,
          `latest_date=${latest.date}`,
          `latest_value=${latest.value}`,
          "",
          "recent_observations:",
          ...rows.map((row) => `- ${row.date}: ${row.value}`),
          "",
          "research_context=Official FRED macroeconomic time series. Extract facts about rates, inflation, labor, oil, dollar liquidity, and market regime implications.",
        ].join("\n");

        docs.push({
          source: "fred_api",
          external_id: `fred-${seriesId}-${latest.date}`,
          title: `FRED ${seriesId}: ${label} latest ${latest.value} on ${latest.date}`,
          body,
          published_at: normalizeDate(latest.date),
          reliability: 0.9,
          meta: {
            series_id: seriesId,
            series_label: label,
            latest_date: latest.date,
            latest_value: latest.value,
            source_url: `https://fred.stlouisfed.org/series/${seriesId}`,
          },
        });
      }

      return docs;
    },
  };
}

function formatYmd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function daysAgoYmd(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatYmd(d);
}

function createDartDisclosureCollector(): CollectorStrategy {
  return {
    source: "dart_disclosure",
    isEnabled: () => Boolean(process.env.DART_API_KEY || process.env.OPENDART_API_KEY || process.env.BRIGHTDESK_DART_API_KEY),
    async fetch() {
      const apiKey = process.env.DART_API_KEY || process.env.OPENDART_API_KEY || process.env.BRIGHTDESK_DART_API_KEY;
      if (!apiKey) return [];

      const lookbackDays = toInt(process.env.BRIGHTDESK_DART_LOOKBACK_DAYS, 7);
      const limit = toInt(process.env.BRIGHTDESK_DART_LIMIT, 40);
      const corpCls = (process.env.BRIGHTDESK_DART_CORP_CLS ?? "Y,K")
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 4);

      const docs: RawDocCandidate[] = [];
      for (const cls of corpCls.length ? corpCls : ["Y", "K"]) {
        const url = new URL("https://opendart.fss.or.kr/api/list.json");
        url.searchParams.set("crtfc_key", apiKey);
        url.searchParams.set("bgn_de", daysAgoYmd(lookbackDays));
        url.searchParams.set("end_de", formatYmd(new Date()));
        url.searchParams.set("last_reprt_at", "Y");
        url.searchParams.set("corp_cls", cls);
        url.searchParams.set("sort", "date");
        url.searchParams.set("sort_mth", "desc");
        url.searchParams.set("page_no", "1");
        url.searchParams.set("page_count", String(Math.min(100, limit)));

        const res = await fetch(url, {
          headers: { "User-Agent": "BrightDesk-DART-Collector/1.0" },
        });
        if (!res.ok) {
          throw new Error(`dart_disclosure ${cls} request failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as {
          status?: string;
          message?: string;
          list?: Array<{
            corp_code?: string;
            corp_name?: string;
            stock_code?: string;
            corp_cls?: string;
            report_nm?: string;
            rcept_no?: string;
            flr_nm?: string;
            rcept_dt?: string;
            rm?: string;
          }>;
        };

        if (json.status && !["000", "013"].includes(json.status)) {
          throw new Error(`dart_disclosure ${cls} error ${json.status}: ${json.message ?? "unknown"}`);
        }

        for (const item of (json.list ?? []).slice(0, limit)) {
          const rceptNo = item.rcept_no ?? "";
          const stockCode = item.stock_code?.trim();
          const ticker = stockCode && stockCode !== " " ? `${stockCode}.KS` : null;
          const sourceUrl = rceptNo ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}` : "https://dart.fss.or.kr/";
          const title = `[DART] ${item.corp_name ?? "Unknown"} ${item.report_nm ?? "공시"}`;
          const body = [
            "source=dart-disclosure",
            `corp_name=${item.corp_name ?? ""}`,
            `corp_code=${item.corp_code ?? ""}`,
            `stock_code=${stockCode ?? ""}`,
            `ticker=${ticker ?? ""}`,
            `corp_cls=${item.corp_cls ?? cls}`,
            `report_name=${item.report_nm ?? ""}`,
            `filer=${item.flr_nm ?? ""}`,
            `receipt_no=${rceptNo}`,
            `receipt_date=${item.rcept_dt ?? ""}`,
            `remark=${item.rm ?? ""}`,
            `source_url=${sourceUrl}`,
            "",
            "research_context=Official Korean DART disclosure. Extract facts about earnings, material events, financing, governance, shareholder changes, audits, and sector implications. Preserve the stock code as related ticker when available.",
          ].join("\n");

          docs.push({
            source: "dart_disclosure",
            external_id: `dart-${rceptNo || item.corp_code || item.corp_name}-${item.rcept_dt ?? ""}`,
            title,
            body,
            published_at: normalizeDate(item.rcept_dt),
            reliability: 0.9,
            meta: {
              corp_code: item.corp_code,
              corp_name: item.corp_name,
              stock_code: stockCode,
              ticker,
              corp_cls: item.corp_cls ?? cls,
              report_name: item.report_nm,
              receipt_no: rceptNo,
              source_url: sourceUrl,
            },
          });
        }
      }

      return docs.slice(0, limit);
    },
  };
}

const DEFAULT_COLLECTOR_CONFIGS: CollectorConfig[] = [
  {
    displayName: "Federal Reserve RSS",
    kind: "rss",
    source: "fed_rss",
    feedEnvKey: "BRIGHTDESK_FED_RSS_URL",
    reliability: 0.9,
    bodySuffix: "source=federal-reserve",
    limit: 8,
    parserVersion: "kb-facts-v1",
  },
  {
    displayName: "SEC RSS",
    kind: "rss",
    source: "sec_rss",
    feedEnvKey: "BRIGHTDESK_SEC_RSS_URL",
    reliability: 0.9,
    bodySuffix: "source=sec",
    limit: 8,
    parserVersion: "kb-facts-v1",
  },
  {
    displayName: "EIA RSS",
    kind: "rss",
    source: "eia_rss",
    feedEnvKey: "BRIGHTDESK_EIA_RSS_URL",
    reliability: 0.85,
    bodySuffix: "source=eia",
    limit: 6,
    parserVersion: "kb-facts-v1",
  },
  {
    displayName: "브로커 리포트 RSS",
    kind: "rss",
    source: "broker_pdf",
    feedEnvKey: "BRIGHTDESK_BROKER_PDF_RSS_URL",
    reliability: 0.85,
    bodySuffix: "source=broadcast-pdf",
    limit: 4,
    parserVersion: "kb-facts-v1",
  },
  {
    displayName: "미주은 유튜브 RSS",
    kind: "rss",
    source: "mijueun_youtube",
    feedEnvKey: "BRIGHTDESK_MIJUEUN_YT_RSS_URL",
    reliability: 0.6,
    bodySuffix: "source=mijueun-youtube",
    limit: 5,
    parserVersion: "kb-facts-v1",
  },
  {
    displayName: "스누미 카카오 RSS",
    kind: "rss",
    source: "snoomi_kakao",
    feedEnvKey: "BRIGHTDESK_SNOOMI_RSS_URL",
    reliability: 0.4,
    bodySuffix: "source=snoomi-kakao",
    limit: 5,
    parserVersion: "kb-facts-v1",
  },
  {
    displayName: "뉴스 RSS",
    kind: "rss",
    source: "news",
    feedEnvKey: "BRIGHTDESK_NEWS_RSS_URL",
    reliability: 0.75,
    bodySuffix: "source=external-news",
    limit: 8,
    parserVersion: "kb-facts-v1",
  },
];

export const collectors: CollectorStrategy[] = buildCollectors(DEFAULT_COLLECTOR_CONFIGS, rssCollectorFactory);

export function getCollectorProfiles(): SourceProfile[] {
  return [
    ...DEFAULT_COLLECTOR_CONFIGS.map((cfg) => ({
      source: cfg.source,
      displayName: cfg.displayName,
      kind: cfg.kind,
      enabled: Boolean(process.env[cfg.feedEnvKey]),
      reliability: cfg.reliability,
      limit: toInt(process.env[`${cfg.feedEnvKey}_LIMIT`], cfg.limit),
      parserVersion: cfg.parserVersion ?? "kb-facts-v1",
    })),
    {
      source: "fred_api",
      displayName: "FRED API",
      kind: "api" as const,
      enabled: Boolean(process.env.FRED_API_KEY || process.env.BRIGHTDESK_FRED_API_KEY),
      reliability: 0.9,
      limit: getFredSeriesIds().length,
      parserVersion: "kb-facts-v1" as const,
    },
    {
      source: "dart_disclosure",
      displayName: "DART 공시 API",
      kind: "api" as const,
      enabled: Boolean(process.env.DART_API_KEY || process.env.OPENDART_API_KEY || process.env.BRIGHTDESK_DART_API_KEY),
      reliability: 0.9,
      limit: toInt(process.env.BRIGHTDESK_DART_LIMIT, 40),
      parserVersion: "kb-facts-v1" as const,
    },
  ];
}

function getCollectorProfile(source: string) {
  if (source === "ticker_research") {
    return {
      source: "ticker_research",
      displayName: "관심종목 뉴스 RSS",
      kind: "rss" as const,
      enabled: true,
      reliability: 0.72,
      limit: toInt(process.env.BRIGHTDESK_TICKER_RESEARCH_RSS_LIMIT, 5),
      parserVersion: "kb-facts-v1" as const,
    };
  }
  if (source === "fred_api") {
    return getCollectorProfiles().find((item) => item.source === "fred_api");
  }
  if (source === "dart_disclosure") {
    return getCollectorProfiles().find((item) => item.source === "dart_disclosure");
  }
  return getCollectorProfiles().find((item) => item.source === source);
}

export function registerCollector<T extends SourceType>(
  collector: CollectorStrategy & { source: T },
  registry: CollectorStrategy[] = collectors,
) {
  return [...registry, collector];
}

export function getDefaultCollectors(): CollectorStrategy[] {
  return [...collectors];
}

async function getActiveResearchTickers(limit: number) {
  const { data: watched } = await (supabaseAdmin as any)
    .from("user_watchlist")
    .select("ticker,label,priority,updated_at")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit * 4);

  const tickers = new Map<string, { ticker: string; label: string | null; priority: number }>();
  for (const row of watched ?? []) {
    const ticker = normalizeTicker(row.ticker ?? "");
    if (!ticker || tickers.has(ticker)) continue;
    tickers.set(ticker, {
      ticker,
      label: row.label ?? WELL_KNOWN_TICKER_LABELS[ticker] ?? null,
      priority: Number(row.priority ?? 3),
    });
    if (tickers.size >= limit) break;
  }

  if (tickers.size < limit) {
    const { data: holdings } = await (supabaseAdmin as any)
      .from("user_portfolio_inputs")
      .select("ticker")
      .limit(limit * 5);
    for (const row of holdings ?? []) {
      const ticker = normalizeTicker(row.ticker ?? "");
      if (!ticker || tickers.has(ticker)) continue;
      tickers.set(ticker, {
        ticker,
        label: WELL_KNOWN_TICKER_LABELS[ticker] ?? null,
        priority: 3,
      });
      if (tickers.size >= limit) break;
    }
  }

  if (tickers.size < limit) {
    const defaults = getDefaultResearchTickers().slice(0, limit);
    for (const ticker of defaults) {
      if (tickers.has(ticker)) continue;
      tickers.set(ticker, {
        ticker,
        label: WELL_KNOWN_TICKER_LABELS[ticker] ?? null,
        priority: 5,
      });
      if (tickers.size >= limit) break;
    }
  }

  return Array.from(tickers.values()).slice(0, limit);
}

export async function buildTickerResearchCollectors(limit = toInt(process.env.BRIGHTDESK_TICKER_RESEARCH_LIMIT, 25)) {
  const tickers = await getActiveResearchTickers(limit);
  return tickers.map((item) => createTickerResearchCollector(item.ticker, item.label));
}

export async function runTickerResearchCollection(params?: { limit?: number; runKey?: string }) {
  const limit = params?.limit ?? toInt(process.env.BRIGHTDESK_TICKER_RESEARCH_LIMIT, 25);
  const activeTickers = await getActiveResearchTickers(limit);
  const tickerCollectors = activeTickers.map((item) => createTickerResearchCollector(item.ticker, item.label));
  const startedAt = new Date().toISOString();
  const result = await runCollection({ collectors: tickerCollectors, includeTickerResearch: false });
  const sourceStats = result.bySource.ticker_research ?? { inserted: 0, skipped: 0 };

  if (activeTickers.length > 0) {
    await (supabaseAdmin as any)
      .from("user_watchlist")
      .update({ last_researched_at: new Date().toISOString() })
      .eq("is_active", true)
      .in("ticker", activeTickers.map((item) => item.ticker));

    await (supabaseAdmin as any).from("ticker_research_runs").insert(
      activeTickers.map((item) => ({
        run_key: params?.runKey ?? null,
        ticker: item.ticker,
        status: "success",
        collected: Math.round(result.collected / Math.max(1, activeTickers.length)),
        inserted: Math.round(sourceStats.inserted / Math.max(1, activeTickers.length)),
        skipped: Math.round(sourceStats.skipped / Math.max(1, activeTickers.length)),
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      })),
    );
  }

  return {
    ...result,
    tickers: activeTickers.map((item) => item.ticker),
    byTicker: Object.fromEntries(activeTickers.map((item) => [item.ticker, sourceStats])),
  };
}

function clamp01(value: number, fallback: number) {
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, safe));
}

// ---------- Orchestration ----------

export async function runCollection(params?: {
  collectors?: CollectorStrategy[];
  includeTickerResearch?: boolean;
}): Promise<{
  collected: number;
  inserted: number;
  skipped: number;
  bySource: Record<string, { inserted: number; skipped: number }>;
}> {
  const bySource: Record<string, { inserted: number; skipped: number }> = {};
  let collected = 0;
  let inserted = 0;
  let skipped = 0;

  const targetCollectors = params?.collectors ?? [
    ...collectors,
    createFredCollector(),
    createDartDisclosureCollector(),
    ...((params?.includeTickerResearch ?? true) ? await buildTickerResearchCollectors() : []),
  ];
  const active = targetCollectors.filter((c) => c.isEnabled());
  if (active.length === 0) {
    return { collected, inserted, skipped, bySource };
  }

  for (const c of active) {
    bySource[c.source] ??= { inserted: 0, skipped: 0 };
    let docs: RawDocCandidate[] = [];
    try {
      docs = await c.fetch();
    } catch (err) {
      console.error(`[collector:${c.source}]`, err);
      continue;
    }
    collected += docs.length;

    for (const d of docs) {
      const sourceProfile = getCollectorProfile(d.source);
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
        source_profile_key: d.source,
        pipeline_version: sourceProfile?.parserVersion ?? "kb-facts-v1",
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

type FactDomain = "macro" | "theme" | "news" | "politics";

interface ExtractedFact {
  domain: FactDomain;
  fact_key: string; // stable slug
  title: string;
  summary: string;
  related_tickers: string[];
  sentiment: number; // -1..1
  reliability: number; // 0..1
}

async function callAiGateway(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const baseUrl = process.env.AI_GATEWAY_URL || "https://api.openai.com/v1/chat/completions";
  if (!apiKey) throw new Error("AI_API_KEY 또는 OPENAI_API_KEY 미설정");

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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

function clampPositive(v: unknown, min: number, max: number, fallback: number) {
  if (typeof v !== "number" || Number.isNaN(v) || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function safeParseFactList(raw: string): ExtractedFact[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```json([\s\S]*?)```/i)?.[1]?.trim();
    if (!fenced) throw new Error("AI 응답 JSON 파싱 실패");
    parsed = JSON.parse(fenced);
  }

  const data = parsed as { facts?: unknown[] };
  if (!data || !Array.isArray(data.facts)) throw new Error("AI 응답 JSON 스키마 오류");

  const valid: ExtractedFact[] = [];
  const seen = new Set<string>();

  for (const row of data.facts) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    const domain = typeof x.domain === "string" ? x.domain.trim() : "";
    if (!["macro", "theme", "news", "politics"].includes(domain)) continue;
    const fact_key = typeof x.fact_key === "string" ? x.fact_key.trim() : "";
    const title = typeof x.title === "string" ? x.title.trim() : "";
    if (!fact_key || !title) continue;

    if (seen.has(fact_key)) continue;
    seen.add(fact_key);

    const summary = typeof x.summary === "string" ? x.summary.trim() : "";
    const related_tickers = Array.isArray(x.related_tickers)
      ? Array.from(new Set(x.related_tickers.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())))
      : [];

    valid.push({
      domain: domain as FactDomain,
      fact_key,
      title,
      summary,
      related_tickers,
      sentiment: clampPositive((x as { sentiment?: unknown }).sentiment ?? 0, -1, 1, 0),
      reliability: clampPositive((x as { reliability?: unknown }).reliability ?? 0.5, 0, 1, 0.5),
    });
  }

  return valid;
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function bodyValue(body: string | null | undefined, key: string) {
  const match = (body ?? "").match(new RegExp(`^${key}=([^\\n]*)`, "m"));
  return match?.[1]?.trim() || "";
}

function fredRelatedTickers(seriesId: string) {
  if (["FEDFUNDS", "DGS10", "DGS2"].includes(seriesId)) return ["TLT", "IEF", "QQQ", "SPY"];
  if (seriesId === "CPIAUCSL") return ["TLT", "QQQ", "GLD"];
  if (seriesId === "UNRATE") return ["SPY", "QQQ"];
  if (seriesId === "DCOILWTICO") return ["XLE", "GLD"];
  if (seriesId === "DTWEXBGS") return ["GLD", "SPY", "QQQ"];
  return [];
}

function fallbackFactsForStructuredSource(doc: {
  id: string;
  source: string;
  title: string | null;
  body: string | null;
  reliability: number | null;
}): ExtractedFact[] {
  const reliability = clampPositive(Number(doc.reliability ?? 0.7), 0, 1, 0.7);

  if (doc.source === "fred_api") {
    const seriesId = bodyValue(doc.body, "series_id") || slug(doc.title ?? "fred");
    const label = bodyValue(doc.body, "series_label") || seriesId;
    const latestDate = bodyValue(doc.body, "latest_date");
    const latestValue = bodyValue(doc.body, "latest_value");
    return [
      {
        domain: "macro",
        fact_key: `fred-${slug(seriesId)}-${slug(latestDate || doc.id)}`,
        title: doc.title ?? `FRED ${seriesId}: ${label}`,
        summary: `${label} latest value is ${latestValue || "unknown"}${latestDate ? ` as of ${latestDate}` : ""}.`,
        related_tickers: fredRelatedTickers(seriesId),
        sentiment: 0,
        reliability,
      },
    ];
  }

  if (doc.source === "dart_disclosure") {
    const corpName = bodyValue(doc.body, "corp_name");
    const reportName = bodyValue(doc.body, "report_name");
    const receiptNo = bodyValue(doc.body, "receipt_no");
    const receiptDate = bodyValue(doc.body, "receipt_date");
    const ticker = bodyValue(doc.body, "ticker");
    return [
      {
        domain: "news",
        fact_key: `dart-${slug(receiptNo || doc.id)}`,
        title: doc.title ?? `[DART] ${corpName || "기업"} ${reportName || "공시"}`,
        summary: `${corpName || "기업"} filed ${reportName || "a disclosure"}${receiptDate ? ` on ${receiptDate}` : ""}.`,
        related_tickers: ticker ? [ticker] : [],
        sentiment: 0,
        reliability,
      },
    ];
  }

  if (doc.source === "ticker_research") {
    const ticker = bodyValue(doc.body, "ticker");
    const label = bodyValue(doc.body, "company_or_asset") || ticker;
    return [
      {
        domain: "news",
        fact_key: `ticker-research-${slug(ticker || "unknown")}-${slug(doc.title ?? doc.id)}`,
        title: doc.title ?? `${label} related update`,
        summary: `Collected ticker research item for ${label || ticker || "watchlist ticker"}.`,
        related_tickers: ticker ? [ticker] : [],
        sentiment: 0,
        reliability,
      },
    ];
  }

  const title = doc.title ?? `${doc.source} market update`;
  const body = doc.body ?? "";
  const tickers = Array.from(
    new Set(
      [
        ...Array.from(body.matchAll(/\b[A-Z]{1,5}(?:\.(?:KS|KQ))?\b/g)).map((m) => m[0]),
        ...Array.from(body.matchAll(/\b\d{6}\b/g)).map((m) => m[0]),
      ]
        .filter((ticker) => !["HTTP", "RSS", "API", "HTML", "JSON"].includes(ticker))
        .slice(0, 8),
    ),
  );
  const lower = `${doc.source} ${title} ${body.slice(0, 1000)}`.toLowerCase();
  const domain: FactDomain =
    /fed|fomc|fred|rate|yield|cpi|inflation|금리|물가|연준|환율|유가/.test(lower)
      ? "macro"
      : /policy|politic|election|tariff|regulation|정책|규제|대선|관세|지정학/.test(lower)
        ? "politics"
        : /sector|industry|theme|ai|semiconductor|battery|산업|테마|반도체|배터리/.test(lower)
          ? "theme"
          : "news";

  return [
    {
      domain,
      fact_key: `fallback-${slug(doc.source)}-${slug(doc.id)}`,
      title,
      summary: safeText(body).slice(0, 360) || `Collected ${doc.source} document for market knowledge base.`,
      related_tickers: tickers,
      sentiment: 0,
      reliability: Math.min(reliability, 0.55),
    },
  ];
}

async function writeExtractedFacts(
  doc: { id: string; source: string },
  facts: ExtractedFact[],
  promptVersion: RefinerPromptProfile,
) {
  for (const f of facts) {
    const { data: existing } = await supabaseAdmin
      .from("kb_facts")
      .select("id, source_doc_ids")
      .eq("fact_key", f.fact_key)
      .maybeSingle();

    if (existing) {
      const ex = existing as unknown as { id: string; source_doc_ids: string[] | null };
      const merged = Array.from(new Set([...(ex.source_doc_ids ?? []), doc.id]));
      await (supabaseAdmin.from("kb_facts") as any)
        .update({
          title: f.title,
          summary: f.summary,
          related_tickers: f.related_tickers,
          sentiment: f.sentiment,
          reliability: f.reliability,
          source_doc_ids: merged,
          updated_at: new Date().toISOString(),
          pipeline_version: promptVersion,
          is_active: true,
        })
        .eq("id", ex.id);
    } else {
      await (supabaseAdmin.from("kb_facts") as any).insert({
        domain: f.domain,
        fact_key: f.fact_key,
        title: f.title,
        summary: f.summary,
        related_tickers: f.related_tickers,
        sentiment: f.sentiment,
        reliability: f.reliability,
        source_doc_ids: [doc.id],
        pipeline_version: promptVersion,
        is_active: true,
      });
    }
  }
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

응답 스키마: {"facts": ExtractedFact[]}
- 공통 출력 스키마 버전: kb-facts-v1`;

export async function refineOne(docId: string): Promise<{ ok: boolean; facts: number; error?: string; fallback?: boolean }> {
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

  const sourceProfile = getCollectorProfile(d.source);
  const sourceLabel = sourceProfile?.displayName ?? d.source;
  const promptVersion = sourceProfile?.parserVersion ?? "kb-facts-v1";

  const userPrompt = `소스: ${d.source}
원본 신뢰도: ${d.reliability ?? "?"}
추출 전략: 공통 스키마 버전=${promptVersion}, 출처 라벨=${sourceLabel}
제목: ${d.title ?? ""}
본문:
${(d.body ?? "").slice(0, 6000)}

위 문서에서 facts를 추출해 JSON 으로 반환.`;

  let raw: string;
  try {
    raw = await callAiGateway(REFINER_SYSTEM, userPrompt);
  } catch (err: unknown) {
    const fallbackFacts = fallbackFactsForStructuredSource(d);
    if (fallbackFacts.length === 0) {
      return { ok: false, facts: 0, error: (err as Error).message };
    }
    await writeExtractedFacts(d, fallbackFacts, promptVersion);
    await (supabaseAdmin.from("raw_documents") as any)
      .update({ processed_at: new Date().toISOString() })
      .eq("id", d.id);
    return { ok: true, facts: fallbackFacts.length, fallback: true };
  }

  let parsedFacts: ExtractedFact[];
  try {
    parsedFacts = safeParseFactList(raw);
  } catch {
    const fallbackFacts = fallbackFactsForStructuredSource(d);
    await writeExtractedFacts(d, fallbackFacts, promptVersion);
    await (supabaseAdmin.from("raw_documents") as any)
      .update({ processed_at: new Date().toISOString() })
      .eq("id", d.id);
    return { ok: true, facts: fallbackFacts.length, fallback: true };
  }

  if (parsedFacts.length === 0) {
    parsedFacts = fallbackFactsForStructuredSource(d);
    await writeExtractedFacts(d, parsedFacts, promptVersion);
    await (supabaseAdmin.from("raw_documents") as any)
      .update({ processed_at: new Date().toISOString() })
      .eq("id", d.id);
    return { ok: true, facts: parsedFacts.length, fallback: true };
  }

  await writeExtractedFacts(d, parsedFacts, promptVersion);

  await (supabaseAdmin.from("raw_documents") as any)
    .update({ processed_at: new Date().toISOString() })
    .eq("id", d.id);

  return { ok: true, facts: parsedFacts.length };
}

export async function runRefiner(limit = 10): Promise<{
  processed: number;
  factsCreated: number;
  fallbackFactsCreated: number;
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
  let fallbackFactsCreated = 0;
  const errors: string[] = [];

  for (const id of ids) {
    const r = await refineOne(id);
    if (r.ok) {
      factsCreated += r.facts;
      if (r.fallback) fallbackFactsCreated += r.facts;
    }
    else errors.push(`${id}: ${r.error}`);
  }

  return { processed: ids.length, factsCreated, fallbackFactsCreated, errors };
}
