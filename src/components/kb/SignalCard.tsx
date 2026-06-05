import { ArrowDown, ArrowUp, Calculator, Minus, Target } from "lucide-react";
import { lightFor, lightHex, plainConclusion, plainConfidence, plainRsi, usePlainMode } from "@/lib/plain-mode";
import { TermTooltip } from "./TermTooltip";

interface Props {
  ticker: string;
  kind: "BUY" | "SELL" | "HOLD" | "REDUCE" | "ADD";
  totalScore: number;
  technicalScore?: number | null;
  fundamentalScore?: number | null;
  kbScore?: number | null;
  confidence?: number | null;
  winrate?: number | null;
  winrateN?: number;
  kbReliability?: number | null;
  baseAlloc?: number;
  currentWeight?: number;
  targetWeight?: number;
  reasons: string[];
  rsi14?: number | null;
  macdHist?: number | null;
  factIds?: string[];
}

const KIND_STYLE: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  BUY: { color: "var(--success)", bg: "color-mix(in oklab, var(--success) 12%, transparent)", label: "매수", icon: ArrowUp },
  ADD: { color: "var(--success)", bg: "color-mix(in oklab, var(--success) 8%, transparent)", label: "비중확대", icon: ArrowUp },
  SELL: { color: "var(--danger)", bg: "color-mix(in oklab, var(--danger) 12%, transparent)", label: "매도", icon: ArrowDown },
  REDUCE: { color: "var(--warning)", bg: "color-mix(in oklab, var(--warning) 10%, transparent)", label: "비중축소", icon: ArrowDown },
  HOLD: { color: "var(--muted-foreground)", bg: "var(--muted)", label: "관망", icon: Minus },
};

function Bar({ label, value, max = 3, tone }: { label: string; value: number; max?: number; tone?: string }) {
  const pct = Math.max(-100, Math.min(100, (value / max) * 100));
  const color = value > 0 ? "var(--success)" : value < 0 ? "var(--danger)" : "var(--muted-foreground)";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div
          className="absolute top-0 h-full"
          style={{
            left: pct >= 0 ? "50%" : `${50 + pct / 2}%`,
            width: `${Math.abs(pct) / 2}%`,
            background: tone ?? color,
          }}
        />
      </div>
      <span className="w-10 text-right tabular-nums" style={{ color }}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  );
}

export function SignalCard(p: Props) {
  const { plain } = usePlainMode();
  const style = KIND_STYLE[p.kind] ?? KIND_STYLE.HOLD;
  const Icon = style.icon;
  const winratePct = p.winrate != null ? Math.round(p.winrate * 100) : null;
  const confPct = p.confidence != null ? Math.round(p.confidence * 100) : null;
  const light = lightFor(p.kind, p.totalScore, p.confidence);
  const lightColor = lightHex(light);
  const conclusion = plainConclusion({
    ticker: p.ticker,
    kind: p.kind,
    totalScore: p.totalScore,
    confidence: p.confidence,
    winrate: p.winrate,
    winrateN: p.winrateN,
  });
  const rsiPlain = plainRsi(p.rsi14);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: lightColor, boxShadow: `0 0 0 3px color-mix(in oklab, ${lightColor} 18%, transparent)` }}
              aria-label={`신호등 ${light}`}
            />
            <span className="text-base font-semibold tabular-nums">{p.ticker}</span>
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: style.bg, color: style.color }}
            >
              <Icon className="h-3 w-3" />
              {style.label}
            </span>
          </div>

          {/* 평이한 한 줄 결론 */}
          {plain && (
            <p
              className="mt-1.5 text-[12px] font-medium leading-snug"
              style={{ color: style.color }}
            >
              {conclusion}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {plain ? (
              <>
                {confPct != null && <span>{plainConfidence(p.confidence)}</span>}
                {winratePct != null && p.winrateN! > 0 && (
                  <span>이런 신호의 과거 적중률 {winratePct}%</span>
                )}
              </>
            ) : (
              <>
                <span>
                  종합 <span className="tabular-nums" style={{ color: style.color }}>{p.totalScore >= 0 ? "+" : ""}{p.totalScore.toFixed(2)}</span>
                </span>
                {confPct != null && (
                  <span>
                    <TermTooltip term="신뢰도" /> {confPct}%
                  </span>
                )}
                {winratePct != null && p.winrateN! > 0 && (
                  <span>
                    <TermTooltip term="승률" /> {winratePct}% (n={p.winrateN})
                  </span>
                )}
                {p.winrateN === 0 && <span className="opacity-60">승률 데이터 부족</span>}
              </>
            )}
          </div>
        </div>
        {p.targetWeight != null && (
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {plain ? "추천 비중" : "목표 비중"}
            </div>
            <div className="text-lg font-semibold tabular-nums" style={{ color: style.color }}>
              {(p.targetWeight * 100).toFixed(1)}%
            </div>
            {p.currentWeight != null && (
              <div className="text-[10px] text-muted-foreground">
                현재 {(p.currentWeight * 100).toFixed(1)}%
              </div>
            )}
          </div>
        )}
      </div>

      {!plain && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          {p.technicalScore != null && <Bar label="기술" value={p.technicalScore} max={3} />}
          {p.fundamentalScore != null && <Bar label="기본" value={p.fundamentalScore} max={2} />}
          {p.kbScore != null && <Bar label="KB" value={p.kbScore} max={2} />}
        </div>
      )}

      {p.targetWeight != null && p.confidence != null && (p.kind === "BUY" || p.kind === "ADD") && (
        <div
          className="mt-3 rounded-lg border-l-2 px-2.5 py-2 text-[11px]"
          style={{
            borderLeftColor: style.color,
            background: "color-mix(in oklab, var(--muted) 40%, transparent)",
          }}
        >
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Calculator className="h-2.5 w-2.5" />
            {plain ? "왜 이 비중인가요?" : "비중 산식"}
          </div>
          {plain ? (
            <div className="leading-relaxed text-foreground/80">
              기본 {((p.baseAlloc ?? 0.15) * 100).toFixed(0)}%에서 시작 →
              AI 확신({(p.confidence * 100).toFixed(0)}%)
              {p.winrate != null && (p.winrateN ?? 0) > 0 && <> · 과거 적중률({Math.round(p.winrate * 100)}%)</>}
              {p.kbReliability != null && <> · 뉴스 신뢰도({p.kbReliability.toFixed(2)})</>}
              을 곱해서 →
              <span className="ml-1 font-semibold" style={{ color: style.color }}>
                {(p.targetWeight * 100).toFixed(1)}%
              </span>
              를 추천해요.
            </div>
          ) : (
            <div className="font-mono tabular-nums leading-relaxed text-foreground/80">
              {((p.baseAlloc ?? 0.15) * 100).toFixed(0)}%
              <span className="text-muted-foreground"> 기본 × </span>
              {(p.confidence * 100).toFixed(0)}%
              <span className="text-muted-foreground"> 신뢰</span>
              {p.winrate != null && (p.winrateN ?? 0) > 0 && (
                <>
                  {" × "}
                  {Math.round(p.winrate * 100)}%
                  <span className="text-muted-foreground"> 승률</span>
                </>
              )}
              {p.kbReliability != null && (
                <>
                  {" × "}
                  {p.kbReliability.toFixed(2)}
                  <span className="text-muted-foreground"> KB</span>
                </>
              )}
              <span className="text-muted-foreground"> = </span>
              <span className="font-semibold" style={{ color: style.color }}>
                {(p.targetWeight * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      <ul className="mt-3 space-y-1 border-t pt-3 text-[11px] text-muted-foreground">
        {p.reasons.slice(0, plain ? 3 : 6).map((r, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <Target className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      {(p.rsi14 != null || p.macdHist != null || (p.factIds && p.factIds.length > 0)) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground">
          {plain ? (
            <>
              {rsiPlain && <span>📊 {rsiPlain}</span>}
              {p.factIds && p.factIds.length > 0 && <span>📰 관련 뉴스 {p.factIds.length}건 반영</span>}
            </>
          ) : (
            <>
              {p.rsi14 != null && (
                <span><TermTooltip term="RSI" /> {p.rsi14.toFixed(1)}</span>
              )}
              {p.macdHist != null && (
                <span><TermTooltip term="MACD" />-H {p.macdHist.toFixed(3)}</span>
              )}
              {p.factIds && p.factIds.length > 0 && <span>근거 Fact {p.factIds.length}건</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
