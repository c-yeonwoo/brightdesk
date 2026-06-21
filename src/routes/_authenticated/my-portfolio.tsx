import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, Trash2, Sparkles, Loader2, FileUp } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { SignalCard } from "@/components/kb/SignalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { listTickerSuggestions } from "@/lib/kb.functions";
import {
  generateRebalanceRecommendation,
  saveUserHoldings,
  getUserHoldings,
  listRecommendations,
  listWatchlist,
  addWatchlistTicker,
  removeWatchlistTicker,
  listWatchlistInsights,
} from "@/lib/recommendations.functions";

export const Route = createFileRoute("/_authenticated/my-portfolio")({
  head: () => ({
    meta: [
      { title: "포트폴리오 · BrightDesk" },
      { name: "description", content: "보유 포트폴리오와 레퍼런스 포트폴리오를 비교합니다." },
    ],
  }),
  component: MyPortfolioPage,
});

interface Row { ticker: string; qty: string; avg_price: string }
const EMPTY: Row = { ticker: "", qty: "", avg_price: "" };
const QUICK_TICKERS = [
  { ticker: "SPY", label: "S&P 500 ETF" },
  { ticker: "QQQ", label: "Nasdaq 100 ETF" },
  { ticker: "SMH", label: "Semiconductor ETF" },
  { ticker: "SOXX", label: "iShares Semiconductor ETF" },
  { ticker: "XLK", label: "Technology ETF" },
  { ticker: "TLT", label: "Long Treasury ETF" },
  { ticker: "GLD", label: "Gold ETF" },
  { ticker: "XLE", label: "Energy ETF" },
  { ticker: "NVDA", label: "NVIDIA" },
  { ticker: "MSFT", label: "Microsoft" },
  { ticker: "AVGO", label: "Broadcom" },
  { ticker: "005930.KS", label: "삼성전자" },
  { ticker: "000660.KS", label: "SK하이닉스" },
  { ticker: "035420.KS", label: "NAVER" },
];
const USE_LOCAL_MOCK = import.meta.env.DEV && import.meta.env.VITE_BRIGHTDESK_MOCK_DASHBOARD !== "false";
const MOCK_HOLDINGS = {
  portfolio_id: "mock-portfolio",
  holdings: [
    { ticker: "SPY", qty: 12, avg_price: 510 },
    { ticker: "QQQ", qty: 5, avg_price: 430 },
    { ticker: "MSFT", qty: 4, avg_price: 390 },
    { ticker: "005930.KS", qty: 20, avg_price: 72000 },
  ],
};
const MOCK_RECOMMENDATION = {
  total_value: 18_420_000,
  expected_return: 8.4,
  rationale:
    "반도체 모멘텀은 유지하되 이미 성장주 노출이 있어 SMH는 분할 접근, 장기채는 FOMC 이후 확인 진입이 적합합니다.",
  actions: [
    {
      ticker: "SMH",
      action: "ADD",
      total_score: 2.4,
      technical_score: 0.8,
      fundamental_score: 0.6,
      kb_score: 1.0,
      confidence: 0.76,
      winrate: 0.62,
      winrate_n: 24,
      current_weight: 0,
      target_weight: 0.12,
      reasons: ["HBM과 데이터센터 수요가 KB 근거에서 반복 확인", "반도체 ETF가 개별주보다 변동성 관리에 유리"],
      fact_ids: [],
    },
    {
      ticker: "QQQ",
      action: "HOLD",
      total_score: 1.5,
      technical_score: 0.5,
      fundamental_score: 0.4,
      kb_score: 0.6,
      confidence: 0.68,
      winrate: 0.58,
      winrate_n: 31,
      current_weight: 0.24,
      target_weight: 0.22,
      reasons: ["성장주 추세는 유지", "이미 보유 노출이 있어 추가 매수보다 유지가 적합"],
      fact_ids: [],
    },
    {
      ticker: "TLT",
      action: "WATCH",
      total_score: 0.7,
      technical_score: 0.1,
      fundamental_score: 0.2,
      kb_score: 0.4,
      confidence: 0.56,
      winrate: 0.51,
      winrate_n: 18,
      current_weight: 0,
      target_weight: 0.08,
      reasons: ["금리 인하 기대는 우호적이나 CPI/FOMC 확인 필요"],
      fact_ids: [],
    },
  ],
};
const MOCK_HISTORY = [
  {
    id: "mock-rec-1",
    generated_at: new Date().toISOString(),
    actions: MOCK_RECOMMENDATION.actions,
    rationale: MOCK_RECOMMENDATION.rationale,
  },
  {
    id: "mock-rec-2",
    generated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    actions: MOCK_RECOMMENDATION.actions.slice(0, 2),
    rationale: "전일 기준으로는 QQQ 유지, MSFT 보유, 방어자산 관찰이 우선이었습니다.",
  },
];
const MOCK_WATCHLIST = [
  { id: "mock-watch-1", ticker: "NVDA", label: "NVIDIA", priority: 2, last_researched_at: new Date().toISOString() },
  { id: "mock-watch-2", ticker: "TLT", label: "장기채 ETF", priority: 3, last_researched_at: null },
  { id: "mock-watch-3", ticker: "TSLA", label: "Tesla", priority: 4, last_researched_at: null },
];
const MOCK_WATCHLIST_INSIGHTS = {
  tickers: MOCK_WATCHLIST,
  facts: [
    {
      id: "mock-kb-nvda",
      domain: "theme",
      title: "AI capex 기대가 반도체 ETF와 NVDA 모멘텀을 지지",
      summary: "데이터센터 투자와 HBM 수요가 반복적으로 확인되며 반도체 관심종목의 긍정 근거로 분류됩니다.",
      related_tickers: ["NVDA", "SMH", "SOXX"],
      sentiment: 0.62,
      reliability: 0.76,
      updated_at: new Date().toISOString(),
    },
    {
      id: "mock-kb-tlt",
      domain: "macro",
      title: "장기채는 물가와 FOMC 확인 전까지 관찰 구간",
      summary: "금리 인하 기대는 우호적이지만 서비스 물가와 고용 지표 확인이 필요합니다.",
      related_tickers: ["TLT", "IEF"],
      sentiment: 0.18,
      reliability: 0.68,
      updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

function MyPortfolioPage() {
  const qc = useQueryClient();
  const { data: saved } = useQuery({
    queryKey: ["user-holdings"],
    queryFn: async () => {
      if (USE_LOCAL_MOCK) return MOCK_HOLDINGS;
      return getUserHoldings();
    },
  });
  const { data: history } = useQuery({
    queryKey: ["rec-history"],
    queryFn: async () => {
      if (USE_LOCAL_MOCK) return MOCK_HISTORY;
      return listRecommendations({ data: { limit: 5 } });
    },
  });
  const { data: tickerSuggestions = [] } = useQuery({
    queryKey: ["ticker-suggestions"],
    queryFn: async () => {
      if (USE_LOCAL_MOCK) return QUICK_TICKERS.map((item, index) => ({ ticker: item.ticker, count: 12 - index }));
      return listTickerSuggestions();
    },
  });
  const { data: watchlist = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: async () => {
      if (USE_LOCAL_MOCK) return MOCK_WATCHLIST;
      return listWatchlist();
    },
  });
  const { data: watchInsights } = useQuery({
    queryKey: ["watchlist-insights"],
    queryFn: async () => {
      if (USE_LOCAL_MOCK) return MOCK_WATCHLIST_INSIGHTS;
      return listWatchlistInsights({ data: { limit: 12 } });
    },
  });

  const [rows, setRows] = useState<Row[]>([EMPTY]);
  const [watchTicker, setWatchTicker] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");

  // Hydrate from saved (once)
  const savedHoldings = saved?.holdings ?? [];
  useEffect(() => {
    if (savedHoldings.length > 0 && rows.length === 1 && !rows[0].ticker) {
      setRows(savedHoldings.map((h: any) => ({ ticker: h.ticker, qty: String(h.qty), avg_price: h.avg_price ? String(h.avg_price) : "" })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, EMPTY]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const parseCsv = () => {
    const lines = csvText.trim().split(/\r?\n/);
    const next: Row[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length < 2) continue;
      if (/ticker/i.test(parts[0])) continue;
      next.push({ ticker: parts[0], qty: parts[1], avg_price: parts[2] ?? "" });
    }
    if (next.length > 0) setRows(next);
    setCsvOpen(false);
  };

  const holdings = rows
    .filter((r) => r.ticker.trim() && Number(r.qty) > 0)
    .map((r) => ({
      ticker: r.ticker.toUpperCase().trim(),
      qty: Number(r.qty),
      avg_price: r.avg_price ? Number(r.avg_price) : null,
    }));

  const saveMut = useMutation({
    mutationFn: async () => (USE_LOCAL_MOCK ? { ok: true, portfolio_id: "mock-portfolio", count: holdings.length } : saveUserHoldings({ data: { holdings } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-holdings"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["watchlist-insights"] });
    },
  });

  const addWatchMut = useMutation({
    mutationFn: async () =>
      USE_LOCAL_MOCK
        ? { ok: true, ticker: watchTicker.toUpperCase() }
        : addWatchlistTicker({ data: { ticker: watchTicker, priority: 3 } }),
    onSuccess: () => {
      setWatchTicker("");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const removeWatchMut = useMutation({
    mutationFn: async (ticker: string) =>
      USE_LOCAL_MOCK ? { ok: true } : removeWatchlistTicker({ data: { ticker } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["watchlist-insights"] });
    },
  });
  const watchFacts = watchInsights?.facts ?? [];

  const recMut = useMutation({
    mutationFn: async () =>
      USE_LOCAL_MOCK
        ? MOCK_RECOMMENDATION
        : generateRebalanceRecommendation({
            data: { holdings, save: true },
          }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rec-history"] }),
  });

  const rec = recMut.data;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="mb-2 inline-flex rounded-full border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {USE_LOCAL_MOCK ? "샘플 포트폴리오" : "포트폴리오"}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">포트폴리오</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          보유 종목을 입력하면 리밸런싱 방향을 제안합니다. 향후 레퍼런스 포트폴리오도 함께 비교합니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        {/* Input panel */}
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">보유 종목 입력</h2>
            <button
              onClick={() => setCsvOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <FileUp className="h-3 w-3" /> CSV 붙여넣기
            </button>
          </div>

          {csvOpen && (
            <div className="mb-3 space-y-2">
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={5}
                placeholder={"ticker,qty,avg_price\n005930.KS,10,72000\nAAPL,5,180"}
                className="w-full rounded-md border bg-background p-2 font-mono text-xs"
              />
              <Button size="sm" onClick={parseCsv}>적용</Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_70px_90px_32px] gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
              <span>티커</span><span>수량</span><span>평단(선택)</span><span/>
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_70px_90px_32px] gap-2 rounded-md border border-transparent p-1 sm:border-0 sm:p-0"
              >
                <TickerPicker
                  value={r.ticker}
                  onChange={(ticker) => setRow(i, { ticker })}
                  suggestions={tickerSuggestions}
                />
                <Input
                  value={r.qty}
                  onChange={(e) => setRow(i, { qty: e.target.value })}
                  placeholder="수량"
                  className="h-10 text-xs sm:h-8"
                  inputMode="decimal"
                  aria-label="수량"
                />
                <Input
                  value={r.avg_price}
                  onChange={(e) => setRow(i, { avg_price: e.target.value })}
                  placeholder="평단"
                  className="h-10 text-xs sm:h-8"
                  inputMode="decimal"
                  aria-label="평단"
                />
                <button
                  onClick={() => removeRow(i)}
                  className="flex h-10 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-8"
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              onClick={addRow}
              className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> 종목 추가
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <Button
              onClick={() => recMut.mutate()}
              disabled={holdings.length === 0 || recMut.isPending}
              className="w-full"
            >
              {recMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              리밸런싱 제안 보기
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="w-full"
            >
              {saveMut.isSuccess ? "저장됨" : "보유 종목 저장"}
            </Button>
          </div>

          <div className="mt-3 text-[11px] text-muted-foreground">
            한국 종목은 <code>.KS</code> (005930.KS) / 미국은 티커 그대로 (AAPL).
          </div>

          <div className="mt-5 border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">관심종목 리서치</h2>
              <span className="text-[11px] text-muted-foreground">{watchlist.length}개</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              여기에 둔 티커는 크론이 관련 자료를 모아 종목별 KB로 정리합니다.
            </p>
            <div className="flex gap-2">
              <TickerPicker
                value={watchTicker}
                onChange={setWatchTicker}
                suggestions={tickerSuggestions}
              />
              <Button
                type="button"
                size="sm"
                disabled={!watchTicker.trim() || addWatchMut.isPending}
                onClick={() => addWatchMut.mutate()}
                className="h-10 shrink-0 sm:h-8"
              >
                추가
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {watchlist.map((item: any) => (
                <span
                  key={item.id ?? item.ticker}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
                >
                  <span className="font-mono font-semibold">{item.ticker}</span>
                  {item.last_researched_at ? (
                    <span className="text-[10px] text-muted-foreground">수집됨</span>
                  ) : null}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeWatchMut.mutate(item.ticker)}
                    aria-label={`${item.ticker} 관심종목 제거`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {watchlist.length === 0 && (
                <span className="text-xs text-muted-foreground">아직 관심종목이 없습니다.</span>
              )}
            </div>
          </div>
        </div>

        {/* Recommendation panel */}
        <div>
          {!rec && !recMut.isPending && (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="text-sm font-medium">아직 추천이 없습니다</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                왼쪽에 보유 종목을 입력하고 <strong>리밸런싱 제안 보기</strong>를 눌러주세요.
              </p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                액션은 점수, 신뢰도, 과거 적중률을 함께 봅니다.
              </p>
            </div>
          )}

          {recMut.isPending && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">분석 중…</p>
            </div>
          )}

          {rec && (
            <>
              <div className="mb-3 rounded-xl border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">재구성 요약</h2>
                  <span className="text-[11px] text-muted-foreground">
                    총평가액 {Math.round(rec.total_value).toLocaleString()}원
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{rec.rationale}</p>
                <div className="mt-3 flex gap-4 text-xs">
                  <span>예상 기대수익률 <strong className="tabular-nums" style={{ color: rec.expected_return >= 0 ? "var(--success)" : "var(--danger)" }}>{rec.expected_return >= 0 ? "+" : ""}{rec.expected_return}%</strong></span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {rec.actions.map((a: any) => (
                  <SignalCard
                    key={a.ticker}
                    ticker={a.ticker}
                    kind={a.action}
                    totalScore={a.total_score}
                    technicalScore={a.technical_score}
                    fundamentalScore={a.fundamental_score}
                    kbScore={a.kb_score}
                    confidence={a.confidence}
                    winrate={a.winrate}
                    winrateN={a.winrate_n}
                    currentWeight={a.current_weight}
                    targetWeight={a.target_weight}
                    reasons={a.reasons}
                    factIds={a.fact_ids}
                  />
                ))}
              </div>
            </>
          )}

          {history && history.length > 0 && (
            <div className="mt-6 rounded-xl border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">최근 추천 히스토리</h3>
              <ul className="divide-y text-xs">
                {history.map((h: any) => (
                  <li key={h.id} className="py-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{new Date(h.generated_at).toLocaleString()}</span>
                      <span>{(h.actions ?? []).length}개 액션</span>
                    </div>
                    <div className="mt-1 text-foreground">{h.rationale}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">관심종목 KB</h3>
              <span className="text-[11px] text-muted-foreground">{watchFacts.length}개 근거</span>
            </div>
            {watchFacts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                아직 관심종목과 연결된 KB가 없습니다. 관심종목을 추가한 뒤 크론을 실행하면 관련 공시·뉴스·거시 근거가 여기에 쌓입니다.
              </div>
            ) : (
              <div className="space-y-3">
                {watchFacts.map((fact: any) => (
                  <div key={fact.id} className="rounded-lg border bg-background p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {fact.domain}
                      </span>
                      {(fact.related_tickers ?? []).slice(0, 4).map((ticker: string) => (
                        <span key={ticker} className="font-mono text-[10px] text-muted-foreground">
                          {ticker}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        신뢰도 {Math.round(Number(fact.reliability ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="text-xs font-semibold">{fact.title}</div>
                    {fact.summary ? (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{fact.summary}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function TickerPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (ticker: string) => void;
  suggestions: { ticker: string; count?: number }[];
}) {
  const [open, setOpen] = useState(false);
  const merged = mergeTickerSuggestions(suggestions);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-xs shadow-sm hover:bg-muted/40 sm:h-8",
            !value && "text-muted-foreground",
          )}
          aria-label="티커"
        >
          <span className="truncate font-mono">{value || "티커 검색"}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-0">
        <Command>
          <CommandInput
            placeholder="티커, ETF, 종목명 검색..."
            value={value}
            onValueChange={(next) => onChange(next.toUpperCase())}
          />
          <CommandList>
            <CommandEmpty>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-primary hover:bg-muted"
                onClick={() => {
                  if (value.trim()) {
                    onChange(value.trim().toUpperCase());
                    setOpen(false);
                  }
                }}
              >
                입력값 그대로 사용
              </button>
            </CommandEmpty>
            <CommandGroup heading="빠른 선택">
              {merged.map((item) => (
                <CommandItem
                  key={item.ticker}
                  value={`${item.ticker} ${item.label ?? ""}`}
                  onSelect={() => {
                    onChange(item.ticker);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-3.5 w-3.5", value.toUpperCase() === item.ticker ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold">{item.ticker}</div>
                    {item.label && <div className="truncate text-[11px] text-muted-foreground">{item.label}</div>}
                  </div>
                  {item.count ? (
                    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      KB {item.count}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function mergeTickerSuggestions(suggestions: { ticker: string; count?: number }[]) {
  const map = new Map<string, { ticker: string; label?: string; count?: number }>();
  for (const item of QUICK_TICKERS) map.set(item.ticker, item);
  for (const item of suggestions ?? []) {
    const ticker = item.ticker.toUpperCase();
    const current = map.get(ticker);
    map.set(ticker, { ticker, label: current?.label, count: item.count });
  }
  return Array.from(map.values()).slice(0, 40);
}
