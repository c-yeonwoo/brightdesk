import { createServerFn } from "@tanstack/react-start";

type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF";
type TrendDirection = "UP" | "SIDEWAYS" | "DOWN";
type OpportunityAction = "WATCH" | "ACCUMULATE" | "ADD" | "HOLD" | "REDUCE" | "AVOID";

type FactRow = {
  id: string;
  domain: string | null;
  title: string;
  summary: string | null;
  sentiment: number | null;
  reliability: number | null;
  related_tickers: string[] | null;
  updated_at: string;
};

type SignalRow = {
  ticker: string;
  kind: "BUY" | "SELL" | "HOLD";
  score: number | null;
  confidence: number | null;
  reasons: string[] | null;
  ts: string;
};

type PositionRow = {
  ticker: string;
  qty: number;
  avg_price: number;
};

const INVESTMENT_UNIVERSE = [
  {
    symbol: "SPY",
    name: "S&P 500 ETF",
    type: "ETF",
    sector: "미국 대형주",
    themes: ["risk_on", "us_equity", "broad_market"],
    risk: "medium",
  },
  {
    symbol: "QQQ",
    name: "Nasdaq 100 ETF",
    type: "ETF",
    sector: "미국 성장주",
    themes: ["risk_on", "growth", "ai_infra"],
    risk: "high",
  },
  {
    symbol: "SMH",
    name: "Semiconductor ETF",
    type: "ETF",
    sector: "반도체",
    themes: ["semiconductor", "ai_infra", "capex"],
    risk: "high",
  },
  {
    symbol: "SOXX",
    name: "iShares Semiconductor ETF",
    type: "ETF",
    sector: "반도체",
    themes: ["semiconductor", "ai_infra"],
    risk: "high",
  },
  {
    symbol: "XLK",
    name: "Technology Select Sector ETF",
    type: "ETF",
    sector: "기술주",
    themes: ["technology", "growth", "risk_on"],
    risk: "medium-high",
  },
  {
    symbol: "TLT",
    name: "20+ Year Treasury Bond ETF",
    type: "ETF",
    sector: "장기채",
    themes: ["rate_cut", "duration", "defensive"],
    risk: "medium",
  },
  {
    symbol: "IEF",
    name: "7-10 Year Treasury Bond ETF",
    type: "ETF",
    sector: "중기채",
    themes: ["rate_cut", "defensive"],
    risk: "low-medium",
  },
  {
    symbol: "GLD",
    name: "Gold ETF",
    type: "ETF",
    sector: "금",
    themes: ["risk_off", "geopolitics", "inflation"],
    risk: "medium",
  },
  {
    symbol: "XLE",
    name: "Energy Select Sector ETF",
    type: "ETF",
    sector: "에너지",
    themes: ["oil", "inflation", "geopolitics"],
    risk: "medium-high",
  },
  {
    symbol: "ITA",
    name: "Aerospace & Defense ETF",
    type: "ETF",
    sector: "방산",
    themes: ["defense", "geopolitics"],
    risk: "medium",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA",
    type: "Stock",
    sector: "AI 반도체",
    themes: ["ai_infra", "semiconductor", "growth"],
    risk: "high",
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    type: "Stock",
    sector: "AI/클라우드",
    themes: ["ai_infra", "cloud", "quality"],
    risk: "medium",
  },
  {
    symbol: "AVGO",
    name: "Broadcom",
    type: "Stock",
    sector: "반도체/인프라",
    themes: ["ai_infra", "semiconductor", "quality"],
    risk: "high",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function weightedSentiment(rows: FactRow[]) {
  let num = 0;
  let den = 0;
  for (const row of rows) {
    const reliability = row.reliability ?? 0.5;
    num += (row.sentiment ?? 0) * reliability;
    den += reliability;
  }
  return den > 0 ? num / den : 0;
}

function classifyRegime(score: number): MarketRegime {
  if (score >= 0.18) return "RISK_ON";
  if (score <= -0.18) return "RISK_OFF";
  return "NEUTRAL";
}

function classifyTrend(score: number): TrendDirection {
  if (score >= 0.12) return "UP";
  if (score <= -0.12) return "DOWN";
  return "SIDEWAYS";
}

function detectThemes(facts: FactRow[], regime: MarketRegime) {
  const text = facts.map((f) => `${f.title} ${f.summary ?? ""}`.toLowerCase()).join(" ");
  const themes = new Set<string>();

  if (/ai|인공지능|반도체|semiconductor|gpu|데이터센터|data center|hbm|엔비디아|nvidia/.test(text)) {
    themes.add("ai_infra");
    themes.add("semiconductor");
  }
  if (/금리.?인하|rate cut|fomc|연준|fed|국채|bond|yield|수익률/.test(text)) {
    themes.add("rate_cut");
  }
  if (/유가|원유|oil|energy|opec|중동/.test(text)) {
    themes.add("oil");
  }
  if (/전쟁|지정학|geopolitical|방산|defense|군사|관세|tariff/.test(text)) {
    themes.add("geopolitics");
    themes.add("defense");
  }
  if (/인플레|inflation|cpi|ppi|물가/.test(text)) {
    themes.add("inflation");
  }

  if (regime === "RISK_ON") {
    themes.add("risk_on");
    themes.add("growth");
  }
  if (regime === "RISK_OFF") {
    themes.add("risk_off");
    themes.add("defensive");
  }

  return Array.from(themes);
}

function actionFromScore(score: number, owned: boolean): OpportunityAction {
  if (score >= 2.4) return owned ? "ADD" : "ACCUMULATE";
  if (score >= 1.4) return owned ? "HOLD" : "WATCH";
  if (score <= -0.8) return owned ? "REDUCE" : "AVOID";
  return owned ? "HOLD" : "WATCH";
}

function actionLabel(action: OpportunityAction) {
  return {
    WATCH: "관심",
    ACCUMULATE: "분할매수 후보",
    ADD: "비중확대 후보",
    HOLD: "유지",
    REDUCE: "축소 검토",
    AVOID: "회피",
  }[action];
}

function regimeLabel(regime: MarketRegime) {
  return {
    RISK_ON: "Risk-on",
    NEUTRAL: "Neutral",
    RISK_OFF: "Risk-off",
  }[regime];
}

function trendLabel(trend: TrendDirection) {
  return {
    UP: "상승 우위",
    SIDEWAYS: "횡보",
    DOWN: "하락 우위",
  }[trend];
}

function buildOpportunity(args: {
  item: (typeof INVESTMENT_UNIVERSE)[number];
  activeThemes: string[];
  facts: FactRow[];
  signals: SignalRow[];
  ownedTickers: Set<string>;
  regime: MarketRegime;
}) {
  const { item, activeThemes, facts, signals, ownedTickers, regime } = args;
  const matchedThemes = item.themes.filter((theme) => activeThemes.includes(theme));
  const ownSignal = signals.find((s) => s.ticker === item.symbol);
  const factHits = facts.filter((fact) => {
    const tickers = fact.related_tickers ?? [];
    const body = `${fact.title} ${fact.summary ?? ""}`.toLowerCase();
    return tickers.includes(item.symbol) || item.themes.some((theme) => body.includes(theme.replace("_", " ")));
  });

  const signalScore = ownSignal ? Number(ownSignal.score ?? 0) / 1.5 : 0;
  const factScore = weightedSentiment(factHits) * 1.3;
  const themeScore = matchedThemes.length * 0.85;
  const regimePenalty = regime === "RISK_OFF" && item.risk.includes("high") ? -0.7 : 0;
  const score = clamp(themeScore + factScore + signalScore + regimePenalty, -2, 4);
  const owned = ownedTickers.has(item.symbol);
  const action = actionFromScore(score, owned);

  const reasons = [
    matchedThemes.length > 0 ? `현재 시장 키워드와 연결: ${matchedThemes.slice(0, 3).join(", ")}` : null,
    ownSignal ? `기존 시그널: ${ownSignal.kind} · 점수 ${Number(ownSignal.score ?? 0).toFixed(1)}` : null,
    factHits[0] ? `최근 근거: ${factHits[0].title}` : null,
  ].filter(Boolean) as string[];

  return {
    symbol: item.symbol,
    name: item.name,
    type: item.type,
    sector: item.sector,
    action,
    action_label: actionLabel(action),
    confidence: clamp(0.42 + Math.abs(score) / 5, 0.35, 0.9),
    horizon: item.risk.includes("high") ? "단기-중기" : "중기",
    score,
    reasons: reasons.length > 0 ? reasons : ["시장 방향성이 더 명확해질 때까지 관찰"],
    risks: [
      item.risk.includes("high") ? "변동성 확대 시 진입 가격 관리 필요" : "시장 레짐 급변 시 방어적 대응 필요",
      regime === "RISK_OFF" ? "Risk-off 구간에서는 신규 진입 규모를 낮게 시작" : "과열 구간에서는 분할 접근 권장",
    ],
    source_fact_ids: factHits.slice(0, 4).map((f) => f.id),
    owned,
  };
}

export const getMarketDesk = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const [{ data: facts }, { data: signals }, { data: pfRows }] = await Promise.all([
    supabaseAdmin
      .from("kb_facts")
      .select("id,domain,title,summary,sentiment,reliability,related_tickers,updated_at")
      .eq("is_active", true)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(80),
    supabaseAdmin
      .from("signals")
      .select("ticker,kind,score,confidence,reasons,ts")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(120),
    supabaseAdmin.from("portfolios").select("id,name,positions(ticker,qty,avg_price)").eq("name", "default").limit(1),
  ]);

  const factRows = ((facts ?? []) as FactRow[]).filter((f) => f.title);
  const signalRows = ((signals ?? []) as SignalRow[]).filter((s) => s.ticker);
  const positions = ((pfRows?.[0] as any)?.positions ?? []) as PositionRow[];
  const ownedTickers = new Set(positions.filter((p) => Number(p.qty) > 0).map((p) => p.ticker));

  const macroFacts = factRows.filter((f) => f.domain === "macro" || f.domain === "politics");
  const themeFacts = factRows.filter((f) => f.domain === "theme" || f.domain === "news");
  const buySignals = signalRows.filter((s) => s.kind === "BUY").length;
  const sellSignals = signalRows.filter((s) => s.kind === "SELL").length;
  const signalBias = signalRows.length > 0 ? (buySignals - sellSignals) / signalRows.length : 0;
  const marketScore = weightedSentiment(macroFacts.length ? macroFacts : factRows) * 0.65 + signalBias * 0.35;
  const regime = classifyRegime(marketScore);
  const trend = classifyTrend(marketScore);
  const activeThemes = detectThemes(factRows, regime);

  const opportunities = INVESTMENT_UNIVERSE.map((item) =>
    buildOpportunity({
      item,
      activeThemes,
      facts: factRows,
      signals: signalRows,
      ownedTickers,
      regime,
    }),
  )
    .filter((item) => item.score > -0.9 || item.owned)
    .sort((a, b) => Number(b.owned) - Number(a.owned) || b.score - a.score)
    .slice(0, 8);

  const topFacts = factRows.slice(0, 6).map((f) => ({
    id: f.id,
    domain: f.domain,
    title: f.title,
    summary: f.summary,
    sentiment: f.sentiment,
    reliability: f.reliability,
    updated_at: f.updated_at,
  }));

  const portfolioNotes = [
    positions.length === 0
      ? "현재 저장된 시스템 포트폴리오가 없어 추천 후보 중심으로 먼저 확인하세요."
      : `${positions.length}개 보유 종목을 기준으로 추천 후보와 겹침을 확인했습니다.`,
    regime === "RISK_OFF"
      ? "신규 편입보다 현금/방어 ETF 비중을 먼저 점검하는 구간입니다."
      : regime === "RISK_ON"
        ? "성장/테마 노출을 점진적으로 늘릴 수 있는 구간입니다."
        : "과도한 신규 진입보다 관심 후보를 추려 관찰하는 구간입니다.",
  ];

  return {
    generated_at: new Date().toISOString(),
    brief: {
      regime,
      regime_label: regimeLabel(regime),
      trend,
      trend_label: trendLabel(trend),
      score: marketScore,
      headline:
        factRows[0]?.title ??
        "시장 데이터를 연결하면 매일 주요 흐름과 추천 후보가 자동으로 정리됩니다.",
      summary:
        factRows[0]?.summary ??
        "아직 최근 KB fact가 부족합니다. RSS 소스와 AI 정제를 연결한 뒤 시장 브리프 품질이 올라갑니다.",
      active_themes: activeThemes,
      key_drivers: topFacts.slice(0, 3),
    },
    opportunities,
    portfolio: {
      positions,
      notes: portfolioNotes,
      owned_count: positions.length,
      owned_tickers: Array.from(ownedTickers),
    },
    sources: topFacts,
    health: {
      facts: factRows.length,
      signals: signalRows.length,
      opportunities: opportunities.length,
    },
  };
});
