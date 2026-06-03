import { sentimentColor, sentimentLabel } from "@/lib/kb-format";

export function SentimentGauge({ value }: { value: number | null }) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, ((v + 1) / 2) * 100));
  const color = sentimentColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute top-0 h-full"
          style={{
            left: pct >= 50 ? "50%" : `${pct}%`,
            width: `${Math.abs(pct - 50)}%`,
            background: color,
          }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
      </div>
      <span className="text-xs tabular-nums" style={{ color }}>
        {value == null ? "—" : value.toFixed(2)}
      </span>
      <span className="text-[10px] text-muted-foreground">{sentimentLabel(value)}</span>
    </div>
  );
}
