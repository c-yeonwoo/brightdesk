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


  const pf = await getOrCreateSystemPortfolio();
  const overview = await getPortfolioOverview(pf.id);

  // 자산 곡선
  const { data: snapshots } = await supabaseAdmin
    .from("portfolio_snapshots")
    .select("date,cash,holdings_value,total_value")
    .eq("portfolio_id", pf.id)
    .order("date", { ascending: true })
    .limit(180);

  // 24h 시그널 + 거래 (거래는 근거 시그널과 조인)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: recentSigs }, { data: recentTxnsRaw }] = await Promise.all([
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
  ]);

  // 각 거래의 근거 시그널 합치기
  const signalIds = Array.from(
    new Set(((recentTxnsRaw ?? []) as any[]).map((t) => t.signal_id).filter(Boolean)),
  );
  const sigMap = new Map<string, any>();
  if (signalIds.length > 0) {
    const { data: sigRows } = await supabaseAdmin
      .from("signals")
      .select("id,kind,score,confidence,technical_score,fundamental_score,kb_score,reasons,weights,fact_ids")
      .in("id", signalIds);
    for (const s of (sigRows ?? []) as any[]) sigMap.set(s.id, s);
  }

  // 거래 원장 (각 거래에 근거 첨부)
  const tradeLedger = ((recentTxnsRaw ?? []) as any[]).map((t) => {
    const sig = t.signal_id ? sigMap.get(t.signal_id) : null;
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
      signal: sig
        ? {
            id: sig.id,
            kind: sig.kind,
            score: Number(sig.score),
            confidence: sig.confidence != null ? Number(sig.confidence) : null,
            technical: sig.technical_score != null ? Number(sig.technical_score) : null,
            fundamental: sig.fundamental_score != null ? Number(sig.fundamental_score) : null,
            kb: sig.kb_score != null ? Number(sig.kb_score) : null,
            reasons: Array.isArray(sig.reasons) ? sig.reasons : [],
            weights: sig.weights ?? null,
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

  return {
    portfolio: overview.portfolio,
    summary: overview.summary,
    positions: overview.positions,
    curve: mergedCurve,
    recent_signals: recentSigs ?? [],
    trade_ledger: tradeLedger,
    txns_7d_count: txns7.length,
    recent_facts: recentFacts ?? [],
    winrate: { buy: buyWR, sell: sellWR },
    regime,
    exit_alerts: exitChecks.filter((e) => e.triggered),
  };
});

    winrate: { buy: buyWR, sell: sellWR },
  };
});
