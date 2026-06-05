import { ArrowDownRight, ArrowUpRight, Info, ShieldAlert, Target as TargetIcon } from "lucide-react";
import { useState } from "react";

type SellReason = "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING" | "REGIME_DOWNGRADE" | "SIGNAL";

const SELL_REASON_STYLE: Record<SellReason, { label: string; color: string; Icon: any }> = {
  STOP_LOSS:         { label: "손절",     color: "var(--danger)",  Icon: ShieldAlert },
  TAKE_PROFIT:       { label: "익절",     color: "var(--success)", Icon: TargetIcon },
  TRAILING:          { label: "트레일링", color: "var(--warning)", Icon: ShieldAlert },
  REGIME_DOWNGRADE:  { label: "레짐악화", color: "var(--warning)", Icon: ShieldAlert },
  SIGNAL:            { label: "시그널",   color: "var(--muted-foreground)", Icon: Info },
};

function parseSellReason(note?: string | null): SellReason | null {
  if (!note) return null;
  const m = note.match(/sell_reason:([A-Z_]+)/);
  return m ? (m[1] as SellReason) : null;
}



type Trade = {
  id: string;
  ticker: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  gross: number;
  fee: number;
  tax: number;
  executed_at: string;
  note?: string | null;
  signal: {
    id: string;
    kind: string;
    score: number;
    confidence: number | null;
    technical: number | null;
    fundamental: number | null;
    kb: number | null;
    reasons: any[];
    weights: any;
  } | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(n);
}

function ScoreBar({ label, value, max = 3 }: { label: string; value: number | null; max?: number }) {
  if (value == null) return null;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            left: pos ? "50%" : `${50 - pct / 2}%`,
            background: pos ? "var(--success)" : "var(--danger)",
          }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
      </div>
      <span
        className="w-10 text-right text-[11px] tabular-nums"
        style={{ color: pos ? "var(--success)" : "var(--danger)" }}
      >
        {pos ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  );
}

export function TradeLedger({ trades }: { trades: Trade[] }) {
  const [openId, setOpenId] = useState<string | null>(trades[0]?.id ?? null);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground">
        아직 체결된 거래가 없습니다. 1시간 cron이 신뢰도 임계치를 넘는 시그널을 만나면 자동 체결됩니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-semibold">거래 원장 · 매매 근거</h2>
        <span className="text-[11px] text-muted-foreground">
          모든 거래는 시그널 점수·이유와 함께 기록됩니다
        </span>
      </div>
      <ul className="divide-y">
        {trades.map((t) => {
          const open = openId === t.id;
          const isBuy = t.side === "BUY";
          const sig = t.signal;
          const confPct = sig?.confidence != null ? sig.confidence * 100 : null;
          const sellReason = !isBuy ? parseSellReason(t.note) : null;
          const reasonStyle = sellReason ? SELL_REASON_STYLE[sellReason] : null;

          return (
            <li key={t.id}>
              <button
                onClick={() => setOpenId(open ? null : t.id)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/40"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ background: isBuy ? "color-mix(in oklab, var(--success) 12%, transparent)" : "color-mix(in oklab, var(--danger) 12%, transparent)" }}
                >
                  {isBuy ? (
                    <ArrowUpRight className="h-4 w-4" style={{ color: "var(--success)" }} />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" style={{ color: "var(--danger)" }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{t.ticker}</span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: isBuy ? "color-mix(in oklab, var(--success) 14%, transparent)" : "color-mix(in oklab, var(--danger) 14%, transparent)",
                        color: isBuy ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {t.side}
                    </span>
                    {reasonStyle && (() => {
                      const ReasonIcon = reasonStyle.Icon;
                      return (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            background: `color-mix(in oklab, ${reasonStyle.color} 14%, transparent)`,
                            color: reasonStyle.color,
                          }}
                        >
                          <ReasonIcon className="h-2.5 w-2.5" />
                          {reasonStyle.label}
                        </span>
                      );
                    })()}



                    {confPct != null && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        신뢰도 {confPct.toFixed(0)}%
                      </span>
                    )}
                    {!sig && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        <Info className="h-2.5 w-2.5" />
                        근거 누락
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {fmt(t.qty)}주 × {fmt(t.price)}원 = {fmt(t.gross)}원
                    <span className="mx-1.5">·</span>
                    {new Date(t.executed_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  {open ? "근거 접기" : "근거 보기"}
                </div>
              </button>

              {open && (
                <div className="border-t bg-muted/20 px-5 py-4">
                  {sig ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          3-Factor 점수
                        </h4>
                        <div className="space-y-1.5">
                          <ScoreBar label="기술" value={sig.technical} max={3} />
                          <ScoreBar label="기본" value={sig.fundamental} max={2} />
                          <ScoreBar label="KB" value={sig.kb} max={2} />
                          <div className="mt-2 border-t pt-2">
                            <ScoreBar label="종합" value={sig.score} max={3} />
                          </div>
                        </div>
                        {sig.weights && (
                          <div className="mt-2 text-[10px] text-muted-foreground">
                            가중치 · 기술 {((sig.weights.technical ?? 0) * 100).toFixed(0)}% / 기본{" "}
                            {((sig.weights.fundamental ?? 0) * 100).toFixed(0)}% / KB{" "}
                            {((sig.weights.kb ?? 0) * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          매매 근거
                        </h4>
                        {sig.reasons.length === 0 ? (
                          <p className="text-xs text-muted-foreground">기록된 사유 없음</p>
                        ) : (
                          <ul className="space-y-1">
                            {sig.reasons.map((r: any, i: number) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs">
                                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                                <span>
                                  {typeof r === "string" ? r : r.label ?? r.reason ?? JSON.stringify(r)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-3 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          <span className="rounded bg-card px-1.5 py-0.5">수수료 {fmt(t.fee)}원</span>
                          {t.tax > 0 && <span className="rounded bg-card px-1.5 py-0.5">세금 {fmt(t.tax)}원</span>}
                          <span className="rounded bg-card px-1.5 py-0.5">시그널 #{sig.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-warning">
                      이 거래는 시그널 근거 없이 기록되었습니다. 시스템 무결성 점검이 필요합니다.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
