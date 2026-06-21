import { createServerFn } from "@tanstack/react-start";

/**
 * Track A (BrightDesk Live) 통합 대시보드 데이터
 *
 * 핵심 원칙: 모든 매매(transactions)는 반드시 근거 시그널(signals)과 조인되어
 * 점수·이유·신뢰도가 함께 전달된다. 근거 없는 거래는 노출하지 않는다.
 */
export const getLiveDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getOrCreateSystemPortfolio, getPortfolioOverview } = await import("./portfolio.server");
  const { getWinrate } = await import("./outcomes.server");
  const { getMarketRegime, getNormalizedBenchmarkCurve } = await import("./regime.server");
  const { checkExits } = await import("./risk.server");
  const { buildSectorHeatMap, explainTickerWithSectorHeat } = await import("./sector-intel.server");


  const pf = await getOrCreateSystemPortfolio();
  const overview = await getPortfolioOverview(pf.id);
  const weekSince = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // 자산 곡선
  const { data: snapshots } = await supabaseAdmin
    .from("portfolio_snapshots")
    .select("date,cash,holdings_value,total_value")
    .eq("portfolio_id", pf.id)
    .order("date", { ascending: true })
    .limit(180);

  // 24h 시그널 + 거래 (거래는 근거 시그널과 조인)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: recentSigs }, { data: recentTxnsRaw }, { data: weeklySignals }, { data: weeklyOutcomes }] = await Promise.all([
    supabaseAdmin
      .from("signals")
      .select("id,ticker,ts,kind,score,confidence,technical_score,fundamental_score,kb_score,reasons,weights,rsi14,macd_hist")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("transactions")
      .select("id,ticker,side,qty,price,fee,tax,executed_at,signal_id,note")
      .eq("portfolio_id", pf.id)
      .order("executed_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("signals")
      .select("id,ticker,ts,kind,score,confidence")
      .gte("ts", weekSince)
      .order("ts", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("signal_outcomes")
      .select("signal_id,hit,ret_5d,ret_20d")
      .gte("entry_date", weekSince)
      .order("entry_date", { ascending: false })
      .limit(500),
  ]);

  // 각 거래의 근거 시그널 합치기
  const signalIds = Array.from(
    new Set(((recentTxnsRaw ?? []) as any[]).map((t) => t.signal_id).filter(Boolean)),
  );
  const sigMap = new Map<string, any>();
  const outcomeMap = new Map<string, any>();
  if (signalIds.length > 0) {
    const [{ data: sigRows }, { data: outcomeRows }] = await Promise.all([
      supabaseAdmin
        .from("signals")
        .select("id,ticker,kind,score,confidence,technical_score,fundamental_score,kb_score,reasons,weights,fact_ids")
        .in("id", signalIds),
      supabaseAdmin
        .from("signal_outcomes")
        .select("signal_id,hit,ret_5d,ret_20d,evaluated_at")
        .in("signal_id", signalIds),
    ]);
    for (const s of (sigRows ?? []) as any[]) sigMap.set(s.id, s);
    for (const o of (outcomeRows ?? []) as any[]) outcomeMap.set(o.signal_id, o);
  }

  const sectorHeat = await buildSectorHeatMap({ days: 30, limit: 12 });

  // 거래 원장 (각 거래에 근거 첨부)
  const tradeLedger = ((recentTxnsRaw ?? []) as any[]).map((t) => {
    const sig = t.signal_id ? sigMap.get(t.signal_id) : null;
    const outcome = t.signal_id ? outcomeMap.get(t.signal_id) : null;
    const sector = explainTickerWithSectorHeat(t.ticker, sectorHeat);
    const gross = Number(t.qty) * Number(t.price);
    return {
      id: t.id,
      ticker: t.ticker,
      side: t.side,
      qty: Number(t.qty),
      price: Number(t.price),
      gross,
      fee: Number(t.fee ?? 0),
      tax: Number(t.tax ?? 0),
      executed_at: t.executed_at,
      note: t.note,
      sector,
      outcome: outcome
        ? {
            hit: outcome.hit,
            ret_5d: outcome.ret_5d != null ? Number(outcome.ret_5d) : null,
            ret_20d: outcome.ret_20d != null ? Number(outcome.ret_20d) : null,
            evaluated_at: outcome.evaluated_at,
          }
        : null,
      signal: sig
        ? {
            id: sig.id,
            ticker: sig.ticker,
            kind: sig.kind,
            score: Number(sig.score),
            confidence: sig.confidence != null ? Number(sig.confidence) : null,
            technical: sig.technical_score != null ? Number(sig.technical_score) : null,
            fundamental: sig.fundamental_score != null ? Number(sig.fundamental_score) : null,
            kb: sig.kb_score != null ? Number(sig.kb_score) : null,
            reasons: Array.isArray(sig.reasons) ? sig.reasons : [],
            weights: sig.weights ?? null,
            decision_summary: [
              `${t.ticker} ${sig.kind} · 점수 ${Number(sig.score ?? 0).toFixed(2)}`,
              sector.sector_heat_score != null
                ? `${sector.sector} heat ${sector.sector_heat_score.toFixed(2)}`
                : `${sector.sector} heat 대기`,
              Array.isArray(sig.reasons) && sig.reasons[0] ? sig.reasons[0] : null,
            ].filter(Boolean).join(" · "),
          }
        : null,
    };
  });

  // KB 최신 인사이트
  const { data: recentFacts } = await supabaseAdmin
    .from("kb_facts")
    .select("id,title,summary,sentiment,reliability,related_tickers,updated_at,domain")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(8);

  // 전체 승률 (BUY/SELL)
  const [buyWR, sellWR, regime, benchmarkCurve, exitChecks] = await Promise.all([
    getWinrate({ kind: "BUY" }),
    getWinrate({ kind: "SELL" }),
    getMarketRegime("^KS11"),
    getNormalizedBenchmarkCurve(Number(overview.portfolio?.initial_cash ?? 10000000), "^KS11", 180),
    checkExits(pf.id).catch(() => []),
  ]);

  // 자산곡선 + 벤치마크 머지 (date 기준)
  const benchMap = new Map(benchmarkCurve.map((b) => [b.date, b.benchmark_value]));
  const mergedCurve = (snapshots ?? []).map((s: any) => ({
    ...s,
    benchmark_value: benchMap.get(s.date) ?? null,
  }));

  // 최근 7일 거래만 별도 카운트
  const day7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const txns7 = tradeLedger.filter((t) => t.executed_at >= day7);

  const recentWeekSignals = (weeklySignals ?? []) as any[];
  const weekOutcomeRows = (weeklyOutcomes ?? []) as any[];
  const weekSignalByKind = { BUY: 0, SELL: 0, HOLD: 0 };
  let weekConfSum = 0;
  let weekConfCount = 0;
  for (const s of recentWeekSignals) {
    if (s.kind in weekSignalByKind) weekSignalByKind[s.kind as keyof typeof weekSignalByKind]++;
    if (s.confidence != null) {
      const confidence = Number(s.confidence);
      if (!Number.isNaN(confidence)) {
        weekConfSum += confidence;
        weekConfCount++;
      }
    }
  }

  const weekOutcomeCount = weekOutcomeRows.length;
  const weekHitCount = weekOutcomeRows.filter((r: any) => r.hit === true).length;
  const weekRet5Rows = weekOutcomeRows.map((r: any) => Number(r.ret_5d)).filter((v) => Number.isFinite(v));
  const weekRet20Rows = weekOutcomeRows.map((r: any) => Number(r.ret_20d)).filter((v) => Number.isFinite(v));
  const weekRet5 = weekRet5Rows.length ? weekRet5Rows.reduce((acc, n) => acc + n, 0) / weekRet5Rows.length : null;
  const weekRet20 = weekRet20Rows.length ? weekRet20Rows.reduce((acc, n) => acc + n, 0) / weekRet20Rows.length : null;

  const snapRows = (snapshots ?? []) as any[];
  const weekTarget = Date.parse(weekSince);
  let weekBaseValue: number | null = null;
  for (const row of snapRows) {
    if (Date.parse(row.date) <= weekTarget) weekBaseValue = Number(row.total_value);
  }
  if (weekBaseValue === null && snapRows.length > 0) weekBaseValue = Number(snapRows[0].total_value);

  const latestSnap = snapRows.length > 0 ? snapRows[snapRows.length - 1] : null;
  const latestTotal = latestSnap ? Number(latestSnap.total_value) : null;
  const weekReturnAmount = latestTotal != null && weekBaseValue != null ? latestTotal - weekBaseValue : null;
  const weekReturnPct = weekReturnAmount != null && weekBaseValue ? (weekReturnAmount / weekBaseValue) * 100 : null;

  return {
    portfolio: overview.portfolio,
    summary: overview.summary,
    positions: overview.positions,
    curve: mergedCurve,
    recent_signals: recentSigs ?? [],
    trade_ledger: tradeLedger,
    txns_7d_count: txns7.length,
    recent_facts: recentFacts ?? [],
    sector_heat: sectorHeat,
    winrate: { buy: buyWR, sell: sellWR },
    regime,
    exit_alerts: exitChecks.filter((e) => e.triggered),
    weekly_summary: {
      period_start: weekSince,
      signal_count: recentWeekSignals.length,
      signal_by_kind: weekSignalByKind,
      avg_confidence: weekConfCount > 0 ? weekConfSum / weekConfCount : null,
      outcomes: {
        count: weekOutcomeCount,
        hit_rate: weekOutcomeCount > 0 ? weekHitCount / weekOutcomeCount : null,
        avg_ret_5d: weekRet5,
        avg_ret_20d: weekRet20,
      },
      return_amount: weekReturnAmount,
      return_pct: weekReturnPct,
      latest_total: latestTotal,
      base_total: weekBaseValue,
    },
  };
});
