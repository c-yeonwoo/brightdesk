import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { plain: boolean; setPlain: (v: boolean) => void; toggle: () => void };
const PlainCtx = createContext<Ctx>({ plain: true, setPlain: () => {}, toggle: () => {} });

const KEY = "brightdesk.plainMode";

export function PlainModeProvider({ children }: { children: ReactNode }) {
  const [plain, setPlainState] = useState<boolean>(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v != null) setPlainState(v === "1");
    } catch {}
  }, []);

  const setPlain = (v: boolean) => {
    setPlainState(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
  };

  return (
    <PlainCtx.Provider value={{ plain, setPlain, toggle: () => setPlain(!plain) }}>
      {children}
    </PlainCtx.Provider>
  );
}

export function usePlainMode() {
  return useContext(PlainCtx);
}

// ---------- 신호등 ----------
export type TrafficLight = "green" | "yellow" | "red" | "gray";

export function lightFor(kind: string, totalScore: number, confidence?: number | null): TrafficLight {
  const c = confidence ?? 0.5;
  if (kind === "BUY" || kind === "ADD") {
    if (totalScore >= 1.5 && c >= 0.65) return "green";
    if (totalScore >= 0.5) return "yellow";
    return "gray";
  }
  if (kind === "SELL" || kind === "REDUCE") {
    if (totalScore <= -1.5 && c >= 0.65) return "red";
    if (totalScore <= -0.5) return "yellow";
    return "gray";
  }
  return "gray";
}

export function lightHex(l: TrafficLight): string {
  switch (l) {
    case "green": return "var(--success)";
    case "yellow": return "var(--warning)";
    case "red": return "var(--danger)";
    default: return "var(--muted-foreground)";
  }
}

// ---------- 평이한 한 줄 결론 ----------
export function plainConclusion(args: {
  ticker: string;
  kind: string;
  totalScore: number;
  confidence?: number | null;
  winrate?: number | null;
  winrateN?: number;
}): string {
  const { ticker, kind, totalScore, confidence, winrate, winrateN } = args;
  const c = confidence ?? 0;
  const winPct = winrate != null && (winrateN ?? 0) > 0 ? Math.round(winrate * 100) : null;

  const strong = Math.abs(totalScore) >= 1.5 && c >= 0.65;
  const mild = Math.abs(totalScore) >= 0.5;

  if (kind === "BUY" || kind === "ADD") {
    if (strong) return `${ticker}, 지금이 매수 적기로 보입니다.${winPct ? ` (과거 비슷한 신호 ${winPct}% 적중)` : ""}`;
    if (mild) return `${ticker}, 조심스럽게 매수해볼 만한 구간입니다.`;
    return `${ticker}, 매수 신호는 약합니다. 좀 더 지켜보세요.`;
  }
  if (kind === "SELL" || kind === "REDUCE") {
    if (strong) return `${ticker}, 일부 또는 전량 매도를 고려할 시점입니다.`;
    if (mild) return `${ticker}, 비중을 조금 줄여두는 게 안전합니다.`;
    return `${ticker}, 약한 매도 신호 — 급할 건 없습니다.`;
  }
  return `${ticker}, 지금은 관망이 최선입니다.`;
}

export function plainConfidence(c?: number | null): string {
  if (c == null) return "—";
  if (c >= 0.8) return "AI가 매우 확신 ⭐⭐⭐⭐⭐";
  if (c >= 0.65) return "꽤 확신 ⭐⭐⭐⭐";
  if (c >= 0.5) return "보통 ⭐⭐⭐";
  if (c >= 0.35) return "약함 ⭐⭐";
  return "매우 약함 ⭐";
}

export function plainRsi(rsi?: number | null): string | null {
  if (rsi == null) return null;
  if (rsi <= 30) return "가격이 많이 빠진 상태 (저점 부근)";
  if (rsi >= 70) return "가격이 과열된 상태 (고점 부근)";
  return "가격 흐름은 중립";
}

// 손실 시뮬레이션 — MDD를 원화로
export function mddInKrw(invest: number, mdd: number): { worst: number; loss: number } {
  const worst = Math.round(invest * (1 - mdd));
  const loss = invest - worst;
  return { worst, loss };
}
