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

function dashboardPosture(regime: MarketRegime, trend: TrendDirection) {
  if (regime === "RISK_ON" && trend === "UP") return "공격적 관찰";
  if (regime === "RISK_ON") return "선별 진입";
  if (regime === "RISK_OFF") return "방어 우선";
  if (trend === "DOWN") return "리스크 축소";
  return "중립 관찰";
}

function dashboardBias(regime: MarketRegime, trend: TrendDirection) {
  if (regime === "RISK_OFF") return "현금/방어자산 여력 확보";
  if (trend === "UP") return "강한 근거가 있는 후보부터 분할 접근";
  if (trend === "DOWN") return "신규 진입보다 손실 제한 기준 점검";
  return "관심 후보 압축 후 확인 매수";
}

function dataDepthLabel(factCount: number, signalCount: number) {
  if (factCount >= 20 && signalCount >= 20) return "충분";
  if (factCount >= 8 || signalCount >= 8) return "보통";
  return "낮음";
}

function shouldUseMockDashboard() {
  if (process.env.BRIGHTDESK_MOCK_DASHBOARD === "true") return true;
  if (process.env.BRIGHTDESK_MOCK_DASHBOARD === "false") return false;
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

function buildMockMarketDesk() {
  const now = new Date().toISOString();
  const factRows: FactRow[] = [
    {
      id: "mock-fact-1",
      domain: "macro",
      title: "FOMC 이후 금리 인하 기대는 유지되지만 속도는 완만해지는 흐름",
      summary:
        "물가 둔화는 이어지고 있으나 고용과 서비스 물가가 아직 단단해 장기채와 성장주에는 지표 확인이 필요한 국면입니다.",
      sentiment: 0.18,
      reliability: 0.82,
      related_tickers: ["TLT", "IEF", "QQQ"],
      updated_at: now,
    },
    {
      id: "mock-fact-2",
      domain: "theme",
      title: "AI 인프라 투자와 HBM 수요가 반도체 체인 강세를 지지",
      summary:
        "데이터센터 capex와 GPU 공급망 수요가 이어지며 반도체 ETF와 고품질 AI 인프라 종목이 시장 주도 후보로 남아 있습니다.",
      sentiment: 0.42,
      reliability: 0.78,
      related_tickers: ["SMH", "SOXX", "NVDA", "AVGO", "000660.KS"],
      updated_at: now,
    },
    {
      id: "mock-fact-3",
      domain: "politics",
      title: "중동 리스크와 관세 뉴스가 에너지·방산 섹터 변동성을 확대",
      summary:
        "지정학 뉴스는 단기적으로 유가와 방산 섹터를 지지하지만, 전반적인 위험자산에는 변동성 요인으로 작동할 수 있습니다.",
      sentiment: -0.05,
      reliability: 0.7,
      related_tickers: ["XLE", "ITA", "GLD"],
      updated_at: now,
    },
    {
      id: "mock-fact-4",
      domain: "news",
      title: "미국 대형 기술주는 실적 모멘텀과 밸류에이션 부담이 공존",
      summary:
        "클라우드와 AI 매출 기대는 유지되지만 이미 높아진 가격에는 분할 접근과 손절 기준이 필요합니다.",
      sentiment: 0.2,
      reliability: 0.74,
      related_tickers: ["MSFT", "QQQ", "XLK"],
      updated_at: now,
    },
  ];
  const signalRows: SignalRow[] = [
    {
      ticker: "SMH",
      kind: "BUY",
      score: 2.7,
      confidence: 0.76,
      reasons: ["AI 인프라 테마 강도", "반도체 KB 근거 우위"],
      ts: now,
    },
    {
      ticker: "QQQ",
      kind: "BUY",
      score: 1.9,
      confidence: 0.68,
      reasons: ["Risk-on 후보", "성장주 추세 유지"],
      ts: now,
    },
    {
      ticker: "TLT",
      kind: "HOLD",
      score: 0.8,
      confidence: 0.58,
      reasons: ["금리 인하 기대는 있으나 지표 확인 필요"],
      ts: now,
    },
    {
      ticker: "XLE",
      kind: "HOLD",
      score: 1.1,
      confidence: 0.61,
      reasons: ["지정학 리스크 헤지 후보"],
      ts: now,
    },
  ];
  const positions: PositionRow[] = [
    { ticker: "SPY", qty: 12, avg_price: 510 },
    { ticker: "QQQ", qty: 5, avg_price: 430 },
    { ticker: "MSFT", qty: 4, avg_price: 390 },
  ];
  const ownedTickers = new Set(positions.map((p) => p.ticker));
  const macroFacts = factRows.filter((f) => f.domain === "macro" || f.domain === "politics");
  const buySignals = signalRows.filter((s) => s.kind === "BUY").length;
  const sellSignals = signalRows.filter((s) => s.kind === "SELL").length;
  const signalBias = (buySignals - sellSignals) / signalRows.length;
  const marketScore = weightedSentiment(macroFacts) * 0.65 + signalBias * 0.35;
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
  const topPositive = opportunities.filter((o) => ["ACCUMULATE", "ADD", "HOLD"].includes(o.action)).slice(0, 3);
  const topDefensive = opportunities.filter((o) => ["REDUCE", "AVOID"].includes(o.action)).slice(0, 2);

  return {
    is_mock: true,
    generated_at: now,
    market_read: {
      posture: dashboardPosture(regime, trend),
      action_bias: dashboardBias(regime, trend),
      confidence: 0.72,
      data_depth: "샘플",
      positive_candidates: topPositive.length,
      defensive_candidates: topDefensive.length,
    },
    brief: {
      regime,
      regime_label: regimeLabel(regime),
      trend,
      trend_label: trendLabel(trend),
      score: marketScore,
      headline: "AI 인프라가 주도하지만, 금리와 지정학 리스크를 함께 봐야 하는 장세",
      summary:
        "현재 샘플 데이터 기준으로는 반도체·AI 인프라 쪽 모멘텀이 가장 강하고, 금리 인하 기대는 성장주와 장기채에 우호적입니다. 다만 지정학 리스크와 유가 변수 때문에 신규 진입은 분할 접근이 더 적합합니다.",
      active_themes: activeThemes,
      key_drivers: topFacts.slice(0, 3),
    },
    opportunities,
    portfolio: {
      positions,
      notes: [
        "샘플 포트폴리오 SPY, QQQ, MSFT 기준으로 추천 후보와 겹침을 확인했습니다.",
        "AI/성장 노출이 이미 있으므로 SMH 같은 후보는 작은 단위의 추가 진입 시나리오가 적합합니다.",
      ],
      owned_count: positions.length,
      owned_tickers: Array.from(ownedTickers),
      allocation_guidance: [
        { label: "성장/테마", value: "선별 확대", tone: "positive" },
        { label: "방어/현금", value: "유지", tone: "neutral" },
        { label: "신규 진입", value: "분할", tone: "positive" },
      ],
    },
    paper_portfolio: {
      label: "1,000만원 실증 포트폴리오",
      initial_value: 10_000_000,
      current_value: 10_684_000,
      cash_weight: 0.18,
      return_pct: 6.84,
      benchmark_label: "SPY",
      benchmark_return_pct: 4.2,
      max_drawdown_pct: -3.6,
      trades_30d: 9,
      note: "실거래가 아닌 가상 운용입니다. 하루 4회 신호와 결과를 점검합니다.",
    },
    next_actions: [
      "SMH부터 검토: AI 인프라와 반도체 KB 근거가 가장 강하게 연결됩니다.",
      "QQQ/MSFT 보유 노출이 이미 있으므로 신규 AI 후보는 중복 비중을 확인하세요.",
      "FOMC와 CPI 전후에는 진입 단위를 줄이고, 장기채는 지표 확인 후 접근하세요.",
    ],
    risk_alerts: [
      "샘플 데이터입니다. 실제 판단 전에는 문서/웹 링크를 넣어 KB 근거를 보강해야 합니다.",
      "지정학/유가 뉴스가 단기 변동성을 키울 수 있습니다.",
    ],
    sources: topFacts,
    health: {
      facts: factRows.length,
      signals: signalRows.length,
      opportunities: opportunities.length,
    },
  };
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

async function buildLiveMarketDesk() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildSectorHeatMap } = await import("./sector-intel.server");
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
  const systemPortfolio = (pfRows?.[0] as any) ?? null;
  const positions = (systemPortfolio?.positions ?? []) as PositionRow[];
  const ownedTickers = new Set(positions.filter((p) => Number(p.qty) > 0).map((p) => p.ticker));
  const paperOverview = systemPortfolio?.id
    ? await import("./portfolio.server")
        .then(({ getPortfolioOverview }) => getPortfolioOverview(systemPortfolio.id))
        .catch(() => null)
    : null;
  const paperSummary = paperOverview?.summary;
  const paperInitial = Number(paperOverview?.portfolio?.initial_cash ?? 10_000_000);
  const paperTotal = Number(paperSummary?.total ?? 10_000_000);
  const paperCash = Number(paperSummary?.cash ?? 10_000_000);
  const paperHoldings = Number(paperSummary?.holdings ?? 0);
  const paperTransactions = Array.isArray(paperOverview?.transactions) ? paperOverview.transactions.length : 0;

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

  const confidence = clamp(0.38 + Math.min(factRows.length, 30) / 80 + Math.min(signalRows.length, 40) / 120, 0.3, 0.86);
  const sectorHeat = await buildSectorHeatMap({ days: 30, limit: 12 });
  const hottestSectors = sectorHeat.slice(0, 4);
  const topPositive = opportunities.filter((o) => ["ACCUMULATE", "ADD", "HOLD"].includes(o.action)).slice(0, 3);
  const topDefensive = opportunities.filter((o) => ["REDUCE", "AVOID"].includes(o.action)).slice(0, 2);
  const nextActions = [
    topPositive[0]
      ? `${topPositive[0].symbol}부터 검토: ${topPositive[0].action_label} · ${topPositive[0].reasons[0]}`
      : "추천 후보가 부족합니다. 먼저 문서/웹 링크를 넣어 KB 근거를 보강하세요.",
    hottestSectors[0]
      ? `섹터 heat 1위 ${hottestSectors[0].sector}: ${hottestSectors[0].reasons[0] ?? "가격/KB/시그널 동시 확인"}`
      : "섹터 heat 데이터가 부족합니다. 백필을 먼저 실행하세요.",
    positions.length > 0
      ? `보유 ${positions.length}개 종목과 신규 후보의 중복 노출을 확인하세요.`
      : "내 포트폴리오를 입력하면 보유 종목 기준으로 비중 확대/축소 신호가 정리됩니다.",
    regime === "RISK_OFF"
      ? "Risk-off 구간이므로 신규 매수는 평소보다 작은 단위로 쪼개는 것이 안전합니다."
      : "확신도가 높은 후보도 한 번에 진입하지 말고 분할 기준을 먼저 정하세요.",
  ];
  const riskAlerts = [
    regime === "RISK_OFF" ? "시장 레짐이 방어적으로 기울어져 고변동 성장주 비중 관리가 필요합니다." : null,
    activeThemes.includes("geopolitics") ? "지정학/정책 뉴스가 가격 변동성을 키울 수 있습니다." : null,
    activeThemes.includes("inflation") ? "물가 지표 재가속 시 장기채와 성장주에 압력이 생길 수 있습니다." : null,
    factRows.length < 8 ? "최근 KB 근거가 아직 얇아 추천은 관찰용으로 보는 편이 안전합니다." : null,
  ].filter(Boolean) as string[];

  const allocationGuidance =
    regime === "RISK_OFF"
      ? [
          { label: "방어/현금", value: "높임", tone: "defensive" },
          { label: "성장/테마", value: "낮춤", tone: "caution" },
          { label: "신규 진입", value: "작게", tone: "neutral" },
        ]
      : regime === "RISK_ON"
        ? [
            { label: "성장/테마", value: "선별 확대", tone: "positive" },
            { label: "방어/현금", value: "유지", tone: "neutral" },
            { label: "신규 진입", value: "분할", tone: "positive" },
          ]
        : [
            { label: "성장/테마", value: "관찰", tone: "neutral" },
            { label: "방어/현금", value: "균형", tone: "neutral" },
            { label: "신규 진입", value: "확인 후", tone: "caution" },
          ];

  return {
    generated_at: new Date().toISOString(),
    market_read: {
      posture: dashboardPosture(regime, trend),
      action_bias: dashboardBias(regime, trend),
      confidence,
      data_depth: dataDepthLabel(factRows.length, signalRows.length),
      positive_candidates: topPositive.length,
      defensive_candidates: topDefensive.length,
    },
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
      sector_heat: hottestSectors,
      key_drivers: topFacts.slice(0, 3),
    },
    opportunities,
    sector_heat: sectorHeat,
    portfolio: {
      positions,
      notes: portfolioNotes,
      owned_count: positions.length,
      owned_tickers: Array.from(ownedTickers),
      allocation_guidance: allocationGuidance,
    },
    paper_portfolio: {
      label: "1,000만원 실증 포트폴리오",
      initial_value: paperInitial,
      current_value: paperTotal,
      cash_weight: paperTotal > 0 ? paperCash / paperTotal : 1,
      return_pct: paperInitial > 0 ? ((paperTotal - paperInitial) / paperInitial) * 100 : 0,
      benchmark_label: "SPY",
      benchmark_return_pct: null,
      max_drawdown_pct: 0,
      trades_30d: paperTransactions,
      note:
        paperHoldings > 0
          ? "실거래가 아닌 가상 운용입니다. 크론이 신호와 추천 후보를 기준으로 분할 운용합니다."
          : "아직 체결된 가상 포지션이 없습니다. 다음 크론에서 starter allocation이 실행됩니다.",
    },
    next_actions: nextActions,
    risk_alerts: riskAlerts,
    sources: topFacts,
    health: {
      facts: factRows.length,
      signals: signalRows.length,
      opportunities: opportunities.length,
    },
  };
}

function inferMarketSessionLabel(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (minutes < 9 * 60 + 30) return "장 시작 전";
  if (minutes < 12 * 60) return "장 시작 후";
  if (minutes < 16 * 60) return "장 종료 전";
  return "장 종료 후";
}

function buildMockHistory() {
  const base = Date.now();
  return [
    {
      id: "mock-history-1",
      generated_at: new Date(base - 60 * 60 * 1000).toISOString(),
      session_label: "장 종료 후",
      regime: "RISK_ON",
      trend: "UP",
      score: 0.32,
      confidence: 0.72,
      headline: "AI 인프라 강세가 유지되며 반도체 후보가 우선순위로 부상",
      top_actions: ["SMH 분할 접근", "QQQ/MSFT 중복 노출 확인"],
      top_opportunities: [{ symbol: "SMH", action_label: "분할매수 후보" }],
      active_themes: ["ai_infra", "semiconductor", "rate_cut"],
      risk_alerts: ["지정학/유가 뉴스 변동성 확인"],
    },
    {
      id: "mock-history-2",
      generated_at: new Date(base - 3 * 60 * 60 * 1000).toISOString(),
      session_label: "장 종료 전",
      regime: "NEUTRAL",
      trend: "SIDEWAYS",
      score: 0.08,
      confidence: 0.64,
      headline: "장중 변동성은 있으나 성장주 주도력은 훼손되지 않음",
      top_actions: ["신규 진입 단위 축소", "보유 성장주 손절 기준 확인"],
      top_opportunities: [{ symbol: "QQQ", action_label: "관심" }],
      active_themes: ["growth", "ai_infra"],
      risk_alerts: ["FOMC 전후 변동성 확대 가능"],
    },
    {
      id: "mock-history-3",
      generated_at: new Date(base - 8 * 60 * 60 * 1000).toISOString(),
      session_label: "장 시작 전",
      regime: "NEUTRAL",
      trend: "SIDEWAYS",
      score: 0.04,
      confidence: 0.58,
      headline: "개장 전에는 금리와 유가 변수를 확인하며 관찰 우선",
      top_actions: ["CPI/FOMC 관련 문서 확인", "현금 비중 유지"],
      top_opportunities: [{ symbol: "TLT", action_label: "관심" }],
      active_themes: ["rate_cut", "geopolitics"],
      risk_alerts: ["샘플 데이터입니다"],
    },
  ];
}

export async function recordMarketDeskSnapshot(runKey?: string, sessionLabel?: string) {
  if (shouldUseMockDashboard()) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desk = await buildLiveMarketDesk();
  const row = {
    run_key: runKey ?? null,
    session_label: sessionLabel ?? inferMarketSessionLabel(),
    generated_at: desk.generated_at,
    regime: desk.brief.regime,
    trend: desk.brief.trend,
    score: desk.brief.score,
    confidence: desk.market_read.confidence,
    headline: desk.brief.headline,
    summary: desk.brief.summary,
    top_actions: desk.next_actions.slice(0, 3),
    top_opportunities: desk.opportunities.slice(0, 4).map((o) => ({
      symbol: o.symbol,
      action_label: o.action_label,
      score: o.score,
      confidence: o.confidence,
      owned: o.owned,
    })),
    active_themes: desk.brief.active_themes,
    risk_alerts: desk.risk_alerts,
    payload: desk,
  };

  const { error } = await (supabaseAdmin as any)
    .from("market_dashboard_snapshots")
    .upsert(row, { onConflict: "run_key" });
  if (error) throw error;
  return row;
}

export const getMarketDesk = createServerFn({ method: "GET" }).handler(async () => {
  if (shouldUseMockDashboard()) {
    return buildMockMarketDesk();
  }
  return buildLiveMarketDesk();
});

export const listMarketDeskHistory = createServerFn({ method: "GET" }).handler(async () => {
  if (shouldUseMockDashboard()) {
    return buildMockHistory();
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("market_dashboard_snapshots")
    .select("id,generated_at,session_label,regime,trend,score,confidence,headline,top_actions,top_opportunities,active_themes,risk_alerts")
    .order("generated_at", { ascending: false })
    .limit(12);
  return data ?? [];
});
