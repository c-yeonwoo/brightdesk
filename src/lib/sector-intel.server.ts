import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SectorHeat = {
  sector: string;
  heat_score: number;
  rank: number;
  momentum_score: number;
  kb_score: number;
  signal_score: number;
  source_score: number;
  ticker_count: number;
  hot_tickers: string[];
  source_mix: Record<string, number>;
  reasons: string[];
};

const SECTOR_KEYWORDS: Record<string, string[]> = {
  "AI/반도체": ["AI", "인공지능", "반도체", "semiconductor", "GPU", "HBM", "데이터센터", "NVIDIA", "엔비디아", "SMH", "SOXX"],
  "클라우드/소프트웨어": ["cloud", "클라우드", "software", "SaaS", "Microsoft", "Oracle", "Salesforce", "Adobe"],
  "2차전지/전기차": ["2차전지", "배터리", "전기차", "EV", "lithium", "리튬", "Tesla", "테슬라"],
  "바이오/헬스케어": ["바이오", "헬스케어", "의약", "clinical", "FDA", "신약", "LLY", "UNH", "JNJ"],
  "금융": ["은행", "금융", "증권", "보험", "JPM", "BAC", "VISA", "Mastercard"],
  "에너지/원자재": ["유가", "원유", "oil", "energy", "OPEC", "가스", "원자재", "구리"],
  "방산/지정학": ["방산", "국방", "defense", "전쟁", "중동", "geopolitics", "LMT", "RTX"],
  "소비/리테일": ["소비", "retail", "유통", "COST", "WMT", "Home Depot", "Nike", "Starbucks"],
  "금리/채권": ["금리", "FOMC", "연준", "Fed", "yield", "국채", "채권", "TLT", "IEF"],
  "국내 대형주": ["코스피", "KOSPI", "삼성전자", "SK하이닉스", "현대차", "LG", "NAVER", "카카오"],
};

const TICKER_SECTOR: Record<string, string> = {
  SPY: "미국 대형주",
  VOO: "미국 대형주",
  IVV: "미국 대형주",
  QQQ: "미국 성장주",
  DIA: "미국 대형주",
  IWM: "미국 중소형주",
  XLK: "클라우드/소프트웨어",
  SMH: "AI/반도체",
  SOXX: "AI/반도체",
  NVDA: "AI/반도체",
  AMD: "AI/반도체",
  AVGO: "AI/반도체",
  INTC: "AI/반도체",
  QCOM: "AI/반도체",
  MU: "AI/반도체",
  MSFT: "클라우드/소프트웨어",
  ADBE: "클라우드/소프트웨어",
  CRM: "클라우드/소프트웨어",
  ORCL: "클라우드/소프트웨어",
  GOOGL: "인터넷/플랫폼",
  META: "인터넷/플랫폼",
  AMZN: "인터넷/플랫폼",
  NFLX: "인터넷/플랫폼",
  TSLA: "2차전지/전기차",
  JPM: "금융",
  BAC: "금융",
  WFC: "금융",
  GS: "금융",
  MS: "금융",
  V: "금융",
  MA: "금융",
  XLF: "금융",
  UNH: "바이오/헬스케어",
  LLY: "바이오/헬스케어",
  JNJ: "바이오/헬스케어",
  MRK: "바이오/헬스케어",
  ABBV: "바이오/헬스케어",
  XLV: "바이오/헬스케어",
  XOM: "에너지/원자재",
  CVX: "에너지/원자재",
  COP: "에너지/원자재",
  XLE: "에너지/원자재",
  GLD: "에너지/원자재",
  TLT: "금리/채권",
  IEF: "금리/채권",
  LMT: "방산/지정학",
  RTX: "방산/지정학",
  BA: "방산/지정학",
  COST: "소비/리테일",
  WMT: "소비/리테일",
  HD: "소비/리테일",
  NKE: "소비/리테일",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isKoreanTicker(ticker: string) {
  return /\.(KS|KQ)$/i.test(ticker);
}

export function inferSectorForTicker(ticker: string) {
  const t = ticker.toUpperCase();
  if (TICKER_SECTOR[t]) return TICKER_SECTOR[t];
  if (isKoreanTicker(t)) return t.endsWith(".KQ") ? "국내 코스닥" : "국내 대형주";
  return "기타";
}

export function inferSectorsFromText(text: string, tickers: string[] = []) {
  const sectors = new Set<string>();
  const lower = text.toLowerCase();
  for (const ticker of tickers) sectors.add(inferSectorForTicker(ticker));
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) sectors.add(sector);
  }
  sectors.delete("기타");
  return Array.from(sectors);
}

async function getSourceMixByFactIds(factIds: string[]) {
  if (factIds.length === 0) return new Map<string, Record<string, number>>();
  const { data: facts } = await supabaseAdmin
    .from("kb_facts")
    .select("id,source_doc_ids")
    .in("id", factIds);
  const docIds = Array.from(new Set(((facts ?? []) as any[]).flatMap((f) => f.source_doc_ids ?? [])));
  const docSource = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs } = await supabaseAdmin.from("raw_documents").select("id,source").in("id", docIds);
    for (const doc of (docs ?? []) as any[]) docSource.set(doc.id, doc.source ?? "unknown");
  }
  const out = new Map<string, Record<string, number>>();
  for (const fact of (facts ?? []) as any[]) {
    const mix: Record<string, number> = {};
    for (const docId of fact.source_doc_ids ?? []) {
      const source = docSource.get(docId) ?? "unknown";
      mix[source] = (mix[source] ?? 0) + 1;
    }
    out.set(fact.id, mix);
  }
  return out;
}

export async function buildSectorHeatMap(opts: { days?: number; limit?: number } = {}): Promise<SectorHeat[]> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const sinceDate = since.slice(0, 10);

  const [{ data: facts }, { data: signals }, { data: prices }] = await Promise.all([
    supabaseAdmin
      .from("kb_facts")
      .select("id,domain,title,summary,sentiment,reliability,related_tickers,updated_at")
      .eq("is_active", true)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("signals")
      .select("ticker,kind,score,confidence,ts")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("prices")
      .select("ticker,date,close,volume")
      .gte("date", sinceDate)
      .order("date", { ascending: true })
      .limit(12000),
  ]);

  const bucket = new Map<string, {
    facts: any[];
    signals: any[];
    tickers: Set<string>;
    momentum: number[];
    source_mix: Record<string, number>;
  }>();
  const get = (sector: string) => {
    if (!bucket.has(sector)) bucket.set(sector, { facts: [], signals: [], tickers: new Set(), momentum: [], source_mix: {} });
    return bucket.get(sector)!;
  };

  const factRows = (facts ?? []) as any[];
  const factSourceMix = await getSourceMixByFactIds(factRows.map((f) => f.id));
  for (const fact of factRows) {
    const tickers = Array.isArray(fact.related_tickers) ? fact.related_tickers.map((t: string) => t.toUpperCase()) : [];
    const sectors = inferSectorsFromText(`${fact.title} ${fact.summary ?? ""}`, tickers);
    for (const sector of sectors.length ? sectors : ["시장 공통"]) {
      const b = get(sector);
      b.facts.push(fact);
      tickers.forEach((ticker) => b.tickers.add(ticker));
      const mix = factSourceMix.get(fact.id) ?? {};
      for (const [source, count] of Object.entries(mix)) b.source_mix[source] = (b.source_mix[source] ?? 0) + count;
    }
  }

  for (const signal of (signals ?? []) as any[]) {
    const ticker = String(signal.ticker ?? "").toUpperCase();
    const sector = inferSectorForTicker(ticker);
    const b = get(sector);
    b.signals.push(signal);
    if (ticker) b.tickers.add(ticker);
  }

  const priceByTicker = new Map<string, any[]>();
  for (const p of (prices ?? []) as any[]) {
    const ticker = String(p.ticker ?? "").toUpperCase();
    if (!priceByTicker.has(ticker)) priceByTicker.set(ticker, []);
    priceByTicker.get(ticker)!.push(p);
  }
  for (const [ticker, rows] of priceByTicker.entries()) {
    if (rows.length < 2) continue;
    const first = Number(rows[0].close);
    const last = Number(rows[rows.length - 1].close);
    if (!first || !last) continue;
    const sector = inferSectorForTicker(ticker);
    const b = get(sector);
    b.tickers.add(ticker);
    b.momentum.push((last - first) / first);
  }

  const heat = Array.from(bucket.entries()).map(([sector, b]) => {
    const factReliability = b.facts.reduce((sum, f) => sum + Number(f.reliability ?? 0.5), 0);
    const factSentiment = b.facts.reduce((sum, f) => sum + Number(f.sentiment ?? 0) * Number(f.reliability ?? 0.5), 0);
    const kbScore = b.facts.length > 0 ? clamp(factSentiment / Math.max(1, factReliability), -1, 1) : 0;
    const avgMomentum = b.momentum.length > 0 ? b.momentum.reduce((a, n) => a + n, 0) / b.momentum.length : 0;
    const momentumScore = clamp(avgMomentum * 8, -1, 1);
    const signalRaw = b.signals.reduce((sum, s) => sum + Number(s.score ?? 0) * Number(s.confidence ?? 0.4), 0);
    const signalScore = clamp(signalRaw / Math.max(1, b.signals.length * 2), -1, 1);
    const sourceKinds = Object.keys(b.source_mix).length;
    const sourceScore = clamp((sourceKinds + Math.min(b.facts.length, 12) / 6) / 5, 0, 1);
    const heatScore = clamp(momentumScore * 0.35 + kbScore * 0.3 + signalScore * 0.25 + sourceScore * 0.1, -1, 1);
    const hotTickers = Array.from(b.tickers).slice(0, 8);
    const reasons = [
      b.momentum.length ? `최근 ${days}일 가격 모멘텀 ${(avgMomentum * 100).toFixed(1)}%` : null,
      b.facts.length ? `KB 근거 ${b.facts.length}건, 감성 ${kbScore.toFixed(2)}` : null,
      b.signals.length ? `시그널 ${b.signals.length}건, 방향 점수 ${signalScore.toFixed(2)}` : null,
      sourceKinds ? `출처 ${Object.keys(b.source_mix).slice(0, 4).join("/")}` : null,
    ].filter(Boolean) as string[];
    return {
      sector,
      heat_score: Math.round(heatScore * 100) / 100,
      rank: 0,
      momentum_score: Math.round(momentumScore * 100) / 100,
      kb_score: Math.round(kbScore * 100) / 100,
      signal_score: Math.round(signalScore * 100) / 100,
      source_score: Math.round(sourceScore * 100) / 100,
      ticker_count: b.tickers.size,
      hot_tickers: hotTickers,
      source_mix: b.source_mix,
      reasons,
    };
  })
    .filter((row) => row.ticker_count > 0 || row.reasons.length > 1)
    .sort((a, b) => b.heat_score - a.heat_score)
    .slice(0, opts.limit ?? 12);

  return heat.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function explainTickerWithSectorHeat(ticker: string, heat: SectorHeat[]) {
  const sector = inferSectorForTicker(ticker);
  const own = heat.find((h) => h.sector === sector);
  if (!own) return { sector, sector_heat_score: null, sector_rank: null, sector_reasons: [] as string[] };
  return {
    sector,
    sector_heat_score: own.heat_score,
    sector_rank: own.rank,
    sector_reasons: own.reasons,
  };
}
