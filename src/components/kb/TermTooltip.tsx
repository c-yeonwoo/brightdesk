import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

const GLOSSARY: Record<string, string> = {
  RSI: "Relative Strength Index. 0~100 사이 값으로 30 이하면 '많이 빠짐(저점)', 70 이상이면 '과열(고점)'으로 봅니다.",
  MACD: "이동평균 차이를 이용한 추세 지표. 양수면 상승 추세, 음수면 하락 추세를 의미합니다.",
  MDD: "Maximum Drawdown. 과거 최고점 대비 최대 하락폭. -10%면 가장 안 좋을 때 10%까지 빠졌다는 뜻.",
  Sharpe: "위험 대비 수익 효율. 1 이상이면 좋고, 2 이상이면 매우 좋은 전략으로 봅니다.",
  알파: "벤치마크(KOSPI 등) 대비 초과 수익. +5%p면 시장보다 5%포인트 잘했다는 뜻.",
  승률: "과거 같은 종류의 신호가 5일 후 수익을 냈던 비율.",
  신뢰도: "AI가 이 신호를 얼마나 확신하는지 (0~100%). 점수와 데이터가 일치할수록 올라갑니다.",
  KB: "Knowledge Base. 뉴스/공시/리포트에서 추출한 사실(Fact)을 종합한 정성 점수.",
  레짐: "시장 국면. 강세(Bull)/약세(Bear)/횡보(Range)로 구분하며, 국면에 따라 전략 비중이 달라집니다.",
  배분: "한 종목에 투자할 자산 비중. 신뢰도·승률에 따라 자동 조정됩니다.",
};

export function TermTooltip({ term, children, definition }: { term: string; children?: ReactNode; definition?: string }) {
  const def = definition ?? GLOSSARY[term];
  if (!def) return <>{children ?? term}</>;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-0.5 border-b border-dotted border-muted-foreground/40">
            {children ?? term}
            <HelpCircle className="h-2.5 w-2.5 opacity-50" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-[11px] leading-relaxed">
          <div className="font-semibold">{term}</div>
          <div className="mt-1 opacity-90">{def}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
