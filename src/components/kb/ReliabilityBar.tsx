export function ReliabilityBar({ value }: { value: number | null }) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, v * 100));
  const color =
    v >= 0.7 ? "var(--success)" : v >= 0.4 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {value == null ? "—" : v.toFixed(2)}
      </span>
    </div>
  );
}
