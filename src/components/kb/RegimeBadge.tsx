import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  regime: "BULL" | "NEUTRAL" | "BEAR";
  score: number;
  ticker: string;
  change_1d_pct: number | null;
  change_5d_pct: number | null;
  reasons: string[];
  confidence_multiplier: number;
}

const STYLE = {
  BULL:    { color: "var(--success)", label: "BULL", Icon: TrendingUp },
  BEAR:    { color: "var(--danger)",  label: "BEAR", Icon: TrendingDown },
  NEUTRAL: { color: "var(--muted-foreground)", label: "NEUTRAL", Icon: Minus },
} as const;

export function RegimeBadge(p: Props) {
  const s = STYLE[p.regime];
  const Icon = s.Icon;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: `color-mix(in oklab, ${s.color} 14%, transparent)` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">시장 레짐</div>
            <div className="text-sm font-semibold" style={{ color: s.color }}>
              {s.label} <span className="ml-1 text-[11px] tabular-nums opacity-80">{p.score >= 0 ? "+" : ""}{p.score.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          {p.ticker}
          {p.change_1d_pct != null && (
            <div className="tabular-nums" style={{ color: p.change_1d_pct >= 0 ? "var(--success)" : "var(--danger)" }}>
              1d {p.change_1d_pct >= 0 ? "+" : ""}{p.change_1d_pct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[10px] text-muted-foreground">
        <span>BUY 신뢰도 보정 <span className="tabular-nums" style={{ color: s.color }}>×{p.confidence_multiplier.toFixed(2)}</span></span>
        {p.change_5d_pct != null && <span className="tabular-nums">5d {p.change_5d_pct >= 0 ? "+" : ""}{p.change_5d_pct.toFixed(2)}%</span>}
      </div>
      {p.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
          {p.reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="truncate">· {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
