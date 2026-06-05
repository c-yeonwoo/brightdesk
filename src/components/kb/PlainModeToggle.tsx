import { BookOpen, Code2 } from "lucide-react";
import { usePlainMode } from "@/lib/plain-mode";
import { Switch } from "@/components/ui/switch";

export function PlainModeToggle() {
  const { plain, setPlain } = usePlainMode();
  return (
    <label
      className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
      title="쉬운 모드 ↔ 전문가 모드 전환"
    >
      <span className={`inline-flex items-center gap-1 ${plain ? "text-success" : "text-muted-foreground"}`}>
        <BookOpen className="h-3 w-3" />
        쉬움
      </span>
      <Switch
        checked={!plain}
        onCheckedChange={(v) => setPlain(!v)}
        aria-label="쉬운/전문가 모드 토글"
      />
      <span className={`inline-flex items-center gap-1 ${!plain ? "text-primary" : "text-muted-foreground"}`}>
        <Code2 className="h-3 w-3" />
        전문가
      </span>
    </label>
  );
}
