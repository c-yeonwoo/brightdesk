import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { usePlainMode } from "@/lib/plain-mode";

interface Action {
  icon: "buy" | "sell" | "exit" | "ok";
  title: string;
  desc: string;
}

export function TodaysActions({
  exitAlerts,
  recentSignals,
}: {
  exitAlerts: any[];
  recentSignals: any[];
}) {
  const { plain } = usePlainMode();

  const actions: Action[] = [];

  // 손절/익절 트리거 우선
  for (const e of (exitAlerts ?? []).slice(0, 2)) {
    actions.push({
      icon: "exit",
      title: `${e.ticker} ${e.reason === "STOP_LOSS" ? "손절 검토" : "익절 검토"}`,
      desc: plain
        ? `${e.ticker}이(가) ${e.pl_pct >= 0 ? "+" : ""}${e.pl_pct.toFixed(1)}% — ${
            e.reason === "STOP_LOSS" ? "더 빠지기 전에 일부 정리" : "수익 일부 실현"
          }을 고려하세요.`
        : e.message,
    });
  }

  // 강한 매수/매도 신호
  const strongBuys = recentSignals
    .filter((s) => (s.kind === "BUY" || s.kind === "ADD") && Number(s.score) >= 1.5 && Number(s.confidence ?? 0) >= 0.65)
    .slice(0, 3 - actions.length);
  for (const s of strongBuys) {
    actions.push({
      icon: "buy",
      title: `${s.ticker} 매수 적기`,
      desc: plain
        ? `AI 확신도 ${Math.round(Number(s.confidence ?? 0) * 100)}% — 지금이 매수 타이밍으로 보여요.`
        : `score ${Number(s.score).toFixed(2)} · conf ${(Number(s.confidence ?? 0) * 100).toFixed(0)}%`,
    });
    if (actions.length >= 3) break;
  }

  const strongSells = recentSignals
    .filter((s) => (s.kind === "SELL" || s.kind === "REDUCE") && Number(s.score) <= -1.5)
    .slice(0, 3 - actions.length);
  for (const s of strongSells) {
    actions.push({
      icon: "sell",
      title: `${s.ticker} 매도 검토`,
      desc: plain
        ? `약세 신호 감지 — 비중을 줄이거나 정리를 고려하세요.`
        : `score ${Number(s.score).toFixed(2)}`,
    });
    if (actions.length >= 3) break;
  }

  if (actions.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-success/30 bg-success/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          오늘은 급한 액션이 없어요
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          포트폴리오가 안정적입니다. 새 시그널이 발생하면 알려드릴게요.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          📋 오늘 챙겨야 할 액션
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {actions.length}
          </span>
        </h2>
        <span className="text-[10px] text-muted-foreground">우선순위 순</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {actions.map((a, i) => {
          const conf = {
            buy: { Icon: TrendingUp, color: "var(--success)", bg: "color-mix(in oklab, var(--success) 10%, transparent)" },
            sell: { Icon: TrendingDown, color: "var(--danger)", bg: "color-mix(in oklab, var(--danger) 10%, transparent)" },
            exit: { Icon: AlertTriangle, color: "var(--warning)", bg: "color-mix(in oklab, var(--warning) 10%, transparent)" },
            ok: { Icon: CheckCircle2, color: "var(--success)", bg: "color-mix(in oklab, var(--success) 10%, transparent)" },
          }[a.icon];
          const Icon = conf.Icon;
          return (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border-l-2 bg-muted/30 p-2.5"
              style={{ borderLeftColor: conf.color, background: conf.bg }}
            >
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: conf.color, color: "white" }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-xs font-semibold">
                  <Icon className="h-3 w-3" style={{ color: conf.color }} />
                  {a.title}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{a.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
