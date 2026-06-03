import { DOMAIN_COLOR_VAR, DOMAIN_LABEL } from "@/lib/kb-format";
import type { KbDomain } from "@/lib/kb-client.server";

export function DomainBadge({ domain }: { domain: KbDomain | string }) {
  const d = domain as KbDomain;
  const color = DOMAIN_COLOR_VAR[d] ?? "var(--muted-foreground)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        color,
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {DOMAIN_LABEL[d] ?? d}
    </span>
  );
}
