import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Trash2, Sparkles, Loader2, FileUp } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { SignalCard } from "@/components/kb/SignalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generateRebalanceRecommendation,
  saveUserHoldings,
  getUserHoldings,
  listRecommendations,
} from "@/lib/recommendations.functions";

export const Route = createFileRoute("/my-portfolio")({
  head: () => ({
    meta: [
      { title: "내 포트폴리오 · BrightDesk" },
      { name: "description", content: "내 보유 종목을 입력하면 AI가 KB·기술·기본 분석을 종합해 매수/매도/비중을 재구성 추천합니다." },
    ],
  }),
  component: MyPortfolioPage,
});

interface Row { ticker: string; qty: string; avg_price: string }
const EMPTY: Row = { ticker: "", qty: "", avg_price: "" };

function MyPortfolioPage() {
  const qc = useQueryClient();
  const { data: saved } = useQuery({
    queryKey: ["user-holdings"],
    queryFn: () => getUserHoldings(),
  });
  const { data: history } = useQuery({
    queryKey: ["rec-history"],
    queryFn: () => listRecommendations({ data: { limit: 5 } }),
  });

  const [rows, setRows] = useState<Row[]>([EMPTY]);
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
    mutationFn: () => saveUserHoldings({ data: { holdings } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-holdings"] }),
  });

  const recMut = useMutation({
    mutationFn: () =>
      generateRebalanceRecommendation({
        data: { holdings, save: true },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rec-history"] }),
  });

  const rec = recMut.data;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">내 포트폴리오</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          내 보유 종목을 입력하면 AI가 <strong>KB 인사이트 · 기술적 · 기본적 분석</strong>을 종합해
          매수/매도/비중을 재구성 추천합니다. (실거래 X)
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
                <Input
                  value={r.ticker}
                  onChange={(e) => setRow(i, { ticker: e.target.value })}
                  placeholder="005930.KS"
                  className="h-10 text-xs sm:h-8"
                  aria-label="티커"
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
              AI 재구성 추천 받기
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
        </div>

        {/* Recommendation panel */}
        <div>
          {!rec && !recMut.isPending && (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="text-sm font-medium">아직 추천이 없습니다</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                왼쪽에 보유 종목을 입력하고 <strong>AI 재구성 추천 받기</strong>를 눌러주세요.
              </p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                각 액션은 <strong>기술적 · 기본적 · KB 종합 점수</strong>와
                <strong> 과거 시그널 승률</strong>을 근거로 산정됩니다.
              </p>
            </div>
          )}

          {recMut.isPending && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">KB · 기술 · 기본 분석을 종합하는 중…</p>
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
        </div>
      </div>
    </AppShell>
  );
}
