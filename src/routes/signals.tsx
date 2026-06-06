import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, AlertTriangle, Loader2, Minus, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/kb/AppShell";
import { SignalCard } from "@/components/kb/SignalCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listFactsByIds } from "@/lib/kb.functions";
import { submitSignalFeedback } from "@/lib/signal-feedback.functions";
import {
  generateAllSignals,
  generateSignal,
  getLatestSignalPerTicker,
  listSignals,
} from "@/lib/signals.functions";
import { fmtDateTime, relativeTime } from "@/lib/kb-format";

export const Route = createFileRoute("/signals")({
  head: () => ({
    meta: [
      { title: "시그널 · KB Monitor" },
      { name: "description", content: "기술지표 + KB 감성을 결합한 매매 시그널" },
    ],
  }),
  component: SignalsPage,
});

type FeedbackStatus = "idle" | "saving" | "saved" | "saved_offline" | "error";
type FeedbackDecision = "approve" | "defer" | "reject";
type SignalFeedbackPayload = {
  signalId: string;
  ticker: string;
  decision: FeedbackDecision;
  reason?: string | null;
  notes?: string | null;
  sessionId?: string | null;
  created_at?: string;
};

const FEEDBACK_SESSION_KEY = "signals:feedback-session-id";
const FEEDBACK_QUEUE_KEY = "signals:feedback-local";

const kindStyle = (k: string) => {
  if (k === "BUY")
    return { cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", Icon: ArrowUp, tone: "var(--success)" };
  if (k === "SELL")
    return { cls: "text-rose-600 bg-rose-500/10 border-rose-500/30", Icon: ArrowDown, tone: "var(--danger)" };
  return { cls: "text-muted-foreground bg-muted border-border", Icon: Minus, tone: "var(--muted-foreground)" };
};

function SignalsPage() {
  const qc = useQueryClient();
  const [ticker, setTicker] = useState("");
  const [refreshingTicker, setRefreshingTicker] = useState<string | null>(null);
  const [inspectSignal, setInspectSignal] = useState<any | null>(null);
  const [ignoreUntil, setIgnoreUntil] = useState<number>(0);
  const [lastAction, setLastAction] = useState<{ mode: "all" | "one"; ticker?: string } | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, FeedbackStatus>>({});
  const [feedbackError, setFeedbackError] = useState<Record<string, string>>({});
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [flushHint, setFlushHint] = useState<string | null>(null);

  const loadFeedbackQueue = (): SignalFeedbackPayload[] => {
    const raw = window?.localStorage?.getItem(FEEDBACK_QUEUE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SignalFeedbackPayload[]) : [];
    } catch {
      return [];
    }
  };

  const setOfflineQueueFromStorage = () => setOfflineQueueCount(loadFeedbackQueue().length);

  const saveFeedbackLocal = (payload: Omit<SignalFeedbackPayload, "created_at">, notes?: string) => {
    const rows = loadFeedbackQueue();
    rows.push({
      ...payload,
      notes: notes ?? payload.notes ?? null,
      created_at: new Date().toISOString(),
    });
    window?.localStorage?.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(rows.slice(-200)));
    setOfflineQueueFromStorage();
  };

  const getSessionId = () => {
    let sid = window?.localStorage?.getItem(FEEDBACK_SESSION_KEY);
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window?.localStorage?.setItem(FEEDBACK_SESSION_KEY, sid);
    }
    return sid;
  };

  const flushFeedbackQueue = async (opts?: { silent?: boolean }) => {
    const rows = loadFeedbackQueue();
    if (rows.length === 0) return;
    if (!opts?.silent) setFlushHint("오프라인 피드백 동기화 중입니다...");
    setIsFlushingQueue(true);

    const keptRows: SignalFeedbackPayload[] = [];
    for (const row of rows) {
      try {
        await submitSignalFeedback({
          data: {
            signalId: row.signalId,
            ticker: row.ticker,
            decision: row.decision,
            reason: row.reason,
            notes: row.notes,
            sessionId: row.sessionId,
          },
        });
      } catch {
        keptRows.push(row);
      }
    }

    window?.localStorage?.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(keptRows));
    setOfflineQueueFromStorage();
    if (!opts?.silent) {
      setFlushHint(
        keptRows.length === 0 ? "오프라인 피드백을 모두 동기화했습니다." : "일부 피드백 동기화에 실패해 임시 보관했습니다.",
      );
    }
    setIsFlushingQueue(false);
  };

  const submitFeedback = async (
    signal: any,
    decision: FeedbackDecision,
    reason: string | null = null,
  ) => {
    const id = signal.id as string;
    setFeedbackStatus((prev) => ({ ...prev, [id]: "saving" }));
    setFeedbackError((prev) => ({ ...prev, [id]: "" }));
    const payload: SignalFeedbackPayload = {
      signalId: id,
      ticker: signal.ticker,
      decision,
      reason,
      sessionId: getSessionId(),
      notes: null,
    };
    try {
      await submitSignalFeedback({ data: payload });
      setFeedbackStatus((prev) => ({ ...prev, [id]: "saved" }));
    } catch (e) {
      const msg = (e as Error).message;
      saveFeedbackLocal(payload, msg);
      setFeedbackStatus((prev) => ({ ...prev, [id]: "saved_offline" }));
      setFeedbackError((prev) => ({ ...prev, [id]: msg }));
    }
  };

  const latest = useQuery({
    queryKey: ["signals-latest"],
    queryFn: () => getLatestSignalPerTicker(),
  });
  const history = useQuery({
    queryKey: ["signals-history"],
    queryFn: () => listSignals({ data: { limit: 100 } }),
  });

  const genOne = useMutation({
    mutationFn: (t: string) => generateSignal({ data: { ticker: t } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals-latest"] });
      qc.invalidateQueries({ queryKey: ["signals-history"] });
      setLastAction(null);
    },
  });
  const genAll = useMutation({
    mutationFn: () => generateAllSignals(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals-latest"] });
      qc.invalidateQueries({ queryKey: ["signals-history"] });
      setLastAction(null);
    },
  });

  const refreshOne = (t: string) => {
    setRefreshingTicker(t);
    setLastAction({ mode: "one", ticker: t });
    genOne.mutate(t, {
      onSettled: () => setRefreshingTicker(null),
    });
  };

  const rerunByFailure = () => {
    if (!lastAction) return;
    if (lastAction.mode === "all") genAll.mutate();
    else if (lastAction.ticker) refreshOne(lastAction.ticker);
  };

  const latestRows = (latest.data ?? []) as any[];
  const historyRows = (history.data ?? []) as any[];
  const factIds = (inspectSignal?.fact_ids ?? []) as string[];
  const staleKey = "signals:stale-banner-ignored-until";

  const factQuery = useQuery({
    queryKey: ["signal-facts", inspectSignal?.id],
    queryFn: () =>
      listFactsByIds({
        data: {
          ids: factIds,
        },
      }),
    enabled: Boolean(inspectSignal && factIds.length > 0),
  });

  useEffect(() => {
    const stored = window?.localStorage?.getItem(staleKey);
    if (stored) setIgnoreUntil(Number(stored));
  }, []);

  useEffect(() => {
    setOfflineQueueFromStorage();
    void flushFeedbackQueue({ silent: true });
  }, []);

  const isStaleSuppressed = Date.now() < ignoreUntil;

  const suppressStaleBanner = (mins = 15) => {
    const until = Date.now() + mins * 60_000;
    setIgnoreUntil(until);
    window?.localStorage?.setItem(staleKey, String(until));
  };

  const staleMessage = (() => {
    if (!latestRows.length) return null;
    const latestTs = latestRows[0]?.ts;
    if (!latestTs) return null;

    const diffMs = Date.now() - new Date(latestTs).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (!Number.isFinite(diffMin) || diffMin < 15) return null;

    if (diffMin >= 60 * 24)
      return `마지막 시그널 반영이 ${Math.floor(diffMin / 60 / 24)}일 넘게 지연돼요. 먼저 수집 상태를 확인하고 재생성하세요.`;
    if (diffMin >= 60)
      return `마지막 시그널 반영이 ${Math.floor(diffMin / 60)}시간 지연돼요. 실시간이 중요한 종목은 잠시 미결정 상태로 두는 걸 권장해요.`;
    return `마지막 시그널 반영이 ${diffMin}분 지연돼요.`;
  })();

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">시그널</h1>
          <p className="text-sm text-muted-foreground">
            기술지표(RSI·MACD·MA)와 KB 감성을 결합한 규칙기반 매매 시그널.
            종목별 카드의 핵심 3줄만 보고 바로 판단하세요.
          </p>
        </div>
        <Button
          onClick={() => {
            setLastAction({ mode: "all" });
            genAll.mutate();
          }}
          disabled={genAll.isPending}
          className="h-9"
        >
          {genAll.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          전체 종목 시그널 생성
        </Button>
      </div>

      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-3 rounded-lg border-l-2 border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/90">2분 가이드</p>
          <p>1) 상위 카드 1~3개를 확인하고 결정을 정리합니다.</p>
          <p>2) 액션은 점수/신뢰도/과거 적중률 근거로 우선순위를 정합니다.</p>
          <p>3) 종목별 재생성으로 개별 데이터 신뢰도를 갱신합니다.</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="티커 (예: AAPL)"
            className="h-9 max-w-xs uppercase tabular-nums"
          />
          <Button
            onClick={() => ticker.trim() && refreshOne(ticker.trim())}
            disabled={!ticker.trim() || genOne.isPending}
            variant="secondary"
            className="h-9"
          >
            {genOne.isPending && refreshingTicker === ticker.trim() ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {genOne.isPending && refreshingTicker === ticker.trim() ? "생성중…" : "이 종목만 생성"}
          </Button>
        </div>
        {genAll.data && (
          <div className="mt-3 text-xs text-muted-foreground">
            {genAll.data.count}개 종목 처리 완료
          </div>
        )}
      </div>

      {staleMessage && !isStaleSuppressed && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>{staleMessage}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLastAction({ mode: "all" });
                genAll.mutate();
              }}
              disabled={genAll.isPending}
            >
              {genAll.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              사용자 관점에서 재동기화
            </Button>
            <Button size="sm" variant="outline" onClick={() => suppressStaleBanner(15)}>
              잠시 무시 (15분)
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/pipeline" className="inline-flex items-center">
                운영 모드 확인
              </Link>
            </Button>
          </div>
          {genAll.error && (
            <p className="mt-2 text-[11px] text-amber-900/80 dark:text-amber-200">
              재동기화 실패: {(genAll.error as Error).message}
            </p>
          )}
        </div>
      )}

      {(genAll.error || genOne.error) && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="mb-1 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              최신 시그널 갱신이 일시적으로 실패했습니다. 아래에서 빠르게 재시도하거나 운영 상태를 점검하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={rerunByFailure} disabled={genAll.isPending || genOne.isPending}>
              {genOne.isPending || genAll.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              실패 복구 재시도
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/pipeline" className="inline-flex items-center">
                지원 요청(운영 모드 확인)
              </Link>
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-amber-900/80 dark:text-amber-200">
            {genAll.error ? (genAll.error as Error).message : (genOne.error as Error).message}
          </p>
        </div>
      )}

      {offlineQueueCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1">
              <p>전송 실패 피드백 {offlineQueueCount}건이 임시 보관돼 있어요.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => flushFeedbackQueue()}
                  disabled={isFlushingQueue}
                >
                  {isFlushingQueue ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  )}
                  {isFlushingQueue ? "동기화 중…" : "전송 재시도"}
                </Button>
              </div>
              {flushHint ? <p className="mt-1 text-[11px] text-amber-900/80">{flushHint}</p> : null}
            </div>
          </div>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">최신 시그널 (종목별)</h2>
        {latest.isLoading ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : !latest.data || latest.data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            아직 시그널이 없습니다. 위 버튼으로 생성하세요.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {latestRows.map((s: any) => {
              const reasons = (s.reasons ?? []) as string[];
              return (
                <div key={s.id} className="space-y-2">
                <SignalCard
                  ticker={s.ticker}
                  kind={s.kind}
                  totalScore={Number(s.score)}
                    technicalScore={s.technical_score != null ? Number(s.technical_score) : null}
                    fundamentalScore={s.fundamental_score != null ? Number(s.fundamental_score) : null}
                    kbScore={s.kb_score != null ? Number(s.kb_score) : null}
                  confidence={s.confidence != null ? Number(s.confidence) : null}
                  reasons={reasons}
                  rsi14={s.rsi14 != null ? Number(s.rsi14) : null}
                  macdHist={s.macd_hist != null ? Number(s.macd_hist) : null}
                  factIds={s.fact_ids ?? []}
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => submitFeedback(s, "approve")}
                        disabled={feedbackStatus[s.id] === "saving"}
                      >
                        {feedbackStatus[s.id] === "saving" ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => submitFeedback(s, "reject", "low_confidence")}
                        disabled={feedbackStatus[s.id] === "saving"}
                      >
                        무시: 신뢰 낮음
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitFeedback(s, "reject", "unclear_reason")}
                        disabled={feedbackStatus[s.id] === "saving"}
                      >
                        무시: 이유 불명확
                      </Button>

                      {feedbackStatus[s.id] && feedbackStatus[s.id] !== "saving" ? (
                        <span className="text-xs text-muted-foreground">
                          {feedbackStatus[s.id] === "saved"
                            ? "피드백 반영"
                            : feedbackStatus[s.id] === "saved_offline"
                              ? "오프라인 저장"
                              : feedbackError[s.id]
                                ? `오류: ${feedbackError[s.id]}`
                                : ""}
                        </span>
                      ) : null}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refreshOne(s.ticker)}
                        disabled={refreshingTicker === s.ticker || genOne.isPending || Boolean(feedbackStatus[s.id]?.startsWith("saved"))}
                      >
                        {(refreshingTicker === s.ticker || genOne.isPending) ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        {refreshingTicker === s.ticker || genOne.isPending ? "재생성 중…" : "이 종목만 갱신"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setInspectSignal(s)} disabled={Boolean(feedbackStatus[s.id]?.startsWith("saved"))}>
                        근거 상세
                      </Button>
                    </>
                  }
                />
                  <div className="rounded-lg border bg-card/80 px-3 py-2 text-[11px] text-muted-foreground">
                    <p>업데이트: {relativeTime(s.ts)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">시그널 이력</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">시각</th>
                <th className="px-3 py-2 text-left">티커</th>
                <th className="px-3 py-2 text-left">유형</th>
                <th className="px-3 py-2 text-right">score</th>
                <th className="px-3 py-2 text-right">RSI</th>
                <th className="px-3 py-2 text-right">MACD hist</th>
                <th className="px-3 py-2 text-left">근거</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((s: any) => {
                const { cls, tone } = kindStyle(s.kind);
                return (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {fmtDateTime(s.ts)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{s.ticker}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
                        style={{ color: tone }}
                      >
                        {s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{s.score}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {s.rsi14?.toFixed?.(1) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {s.macd_hist?.toFixed?.(3) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{(s.reasons ?? []).slice(0, 2).join(" · ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!inspectSignal} onOpenChange={(open) => !open && setInspectSignal(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>근거 상세</DialogTitle>
            <DialogDescription>
              {inspectSignal?.ticker} · {inspectSignal?.kind} · {inspectSignal ? relativeTime(inspectSignal.ts) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3 text-xs">
                <p className="text-muted-foreground">총점</p>
                <p className="mt-1 font-semibold tabular-nums">{inspectSignal ? Number(inspectSignal.score).toFixed(2) : "-"}</p>
              </div>
              <div className="rounded-lg border p-3 text-xs">
                <p className="text-muted-foreground">신뢰도</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {inspectSignal?.confidence != null ? `${Math.round(Number(inspectSignal.confidence) * 100)}%` : "-"}
                </p>
              </div>
              <div className="rounded-lg border p-3 text-xs">
                <p className="text-muted-foreground">RSI(14)</p>
                <p className="mt-1 font-semibold tabular-nums">{inspectSignal?.rsi14 != null ? Number(inspectSignal.rsi14).toFixed(1) : "-"}</p>
              </div>
              <div className="rounded-lg border p-3 text-xs">
                <p className="text-muted-foreground">MACD hist</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {inspectSignal?.macd_hist != null ? Number(inspectSignal.macd_hist).toFixed(3) : "-"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border p-3 text-xs">
              <p className="mb-2 text-muted-foreground">판단 근거</p>
              {((inspectSignal?.reasons ?? []) as string[]).length > 0 ? (
                <ul className="space-y-1 text-foreground">
                  {(inspectSignal?.reasons ?? []).map((r: string, i: number) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">표시 가능한 근거가 없습니다.</p>
              )}
            </div>

            <div className="rounded-lg border p-3 text-xs">
              <p className="mb-2 text-muted-foreground">
                관련 KB Fact ({factIds.length}개)
              </p>
              {!inspectSignal ? null : factIds.length === 0 ? (
                <p className="text-muted-foreground">현재 신호와 연결된 fact가 없습니다.</p>
              ) : factQuery.isLoading ? (
                <p className="text-muted-foreground">팩트 정보를 불러오는 중…</p>
              ) : (
                <ul className="space-y-2">
                  {(factQuery.data ?? []).map((f: any) => (
                    <li key={f.id} className="rounded bg-muted/40 px-2 py-1">
                      <div className="font-medium">{f.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.domain} · 신뢰도 {f.reliability != null ? Number(f.reliability).toFixed(2) : "-"}
                      </div>
                      {f.summary && <div className="mt-0.5 text-[11px] text-muted-foreground">{f.summary}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setInspectSignal(null)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
