import { BookOpen, Code2 } from "lucide-react";
import { usePlainMode } from "@/lib/plain-mode";

export function PlainModeToggle() {
  const { plain, toggle } = usePlainMode();
  return (
    <button
      onClick={toggle}
      aria-label={plain ? "전문가 모드로 전환" : "쉬운 모드로 전환"}
      title={plain ? "전문가 모드로 전환 (지표 원본 표시)" : "쉬운 모드로 전환 (평이한 설명)"}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
    >
      {plain ? (
        <>
          <BookOpen className="h-3 w-3 text-success" />
          <span>쉬운 모드</span>
        </>
      ) : (
        <>
          <Code2 className="h-3 w-3 text-primary" />
          <span>전문가 모드</span>
        </>
      )}
    </button>
  );
}
