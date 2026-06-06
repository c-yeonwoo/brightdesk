import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/kb/AppShell";
import { DomainBadge } from "@/components/kb/DomainBadge";
import { SentimentGauge } from "@/components/kb/SentimentGauge";
import { ReliabilityBar } from "@/components/kb/ReliabilityBar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { getFactDetail, listFacts, toggleFactActive } from "@/lib/kb.functions";
import {
  DOMAIN_LABEL,
  formatSourceLabel,
  fmtDateTime,
  relativeTime,
} from "@/lib/kb-format";
import type { KbFact } from "@/lib/kb-client.server";

export const Route = createFileRoute("/facts")({
  head: () => ({
    meta: [
      { title: "KB Facts · KB Monitor" },
      { name: "description", content: "지식베이스 fact를 탐색·필터·큐레이션합니다." },
    ],
  }),
  component: FactsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Fact 목록을 불러올 수 없습니다: {error.message}
      </div>
    </AppShell>
  ),
});

const DOMAINS = ["macro", "theme", "news", "politics"] as const;

function FactsPage() {
  const [domain, setDomain] = useState<string>("all");
  const [active, setActive] = useState<string>("active");
  const [ticker, setTicker] = useState("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      domain: domain === "all" ? undefined : (domain as any),
      activeOnly:
        active === "all" ? undefined : active === "active" ? true : false,
      ticker: ticker.trim() || undefined,
      q: q.trim() || undefined,
    }),
    [domain, active, ticker, q],
  );

  const { data: facts = [], isLoading } = useQuery({
    queryKey: ["facts", filters],
    queryFn: () => listFacts({ data: filters }),
  });

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">KB Facts</h1>
          <p className="text-sm text-muted-foreground">
            분야·티커·키워드로 fact를 탐색하고 상세를 확인하세요.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {facts.length.toLocaleString()}건
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Select value={domain} onValueChange={setDomain}>
          <SelectTrigger className="h-9 w-28 text-sm">
            <SelectValue placeholder="분야" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 분야</SelectItem>
            {DOMAINS.map((d) => (
              <SelectItem key={d} value={d}>
                {DOMAIN_LABEL[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={active} onValueChange={setActive}>
          <SelectTrigger className="h-9 w-32 text-sm">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">활성+비활성</SelectItem>
            <SelectItem value="active">활성만</SelectItem>
            <SelectItem value="inactive">비활성만</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="티커 (예: AAPL)"
            className="h-9 w-40 pl-3 text-sm uppercase"
          />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목·요약 검색"
            className="h-9 pl-8 text-sm"
          />
        </div>
        {(domain !== "all" || active !== "active" || ticker || q) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setDomain("all");
              setActive("active");
              setTicker("");
              setQ("");
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> 초기화
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">제목</th>
              <th className="px-3 py-2.5 font-medium">분야</th>
              <th className="px-3 py-2.5 font-medium">감성</th>
              <th className="px-3 py-2.5 font-medium">신뢰도</th>
              <th className="px-3 py-2.5 font-medium">관련 티커</th>
              <th className="px-3 py-2.5 font-medium text-right">갱신</th>
              <th className="px-3 py-2.5 font-medium text-center">상태</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  불러오는 중…
                </td>
              </tr>
            ) : facts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  조건에 맞는 fact가 없습니다.
                </td>
              </tr>
            ) : (
              (facts as KbFact[]).map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  onClick={() => setSelectedId(f.id)}
                >
                  <td className="max-w-[420px] px-4 py-2.5">
                    <div className="truncate font-medium">{f.title}</div>
                    {f.summary && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {f.summary}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5"><DomainBadge domain={f.domain} /></td>
                  <td className="px-3 py-2.5"><SentimentGauge value={f.sentiment} /></td>
                  <td className="px-3 py-2.5"><ReliabilityBar value={f.reliability} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(f.related_tickers ?? []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tabular-nums text-secondary-foreground"
                        >
                          {t}
                        </span>
                      ))}
                      {(f.related_tickers ?? []).length > 4 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{(f.related_tickers ?? []).length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                    {relativeTime(f.updated_at)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {f.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium" style={{ color: "var(--success)" }}>
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        비활성
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FactDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />
    </AppShell>
  );
}

function FactDetailSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["fact", id],
    queryFn: () => getFactDetail({ data: { id: id! } }),
    enabled: !!id,
  });
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null);

  const mut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleFactActive({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.is_active ? "활성화했습니다" : "비활성화했습니다");
      qc.invalidateQueries({ queryKey: ["fact", v.id] });
      qc.invalidateQueries({ queryKey: ["facts"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e: any) => toast.error(`실패: ${e?.message ?? e}`),
  });

  const fact = data?.fact as KbFact | null | undefined;
  const sources = (data?.sources ?? []) as Array<{
    id: string;
    title: string | null;
    source: string;
    reliability: number | null;
    published_at: string | null;
  }>;

  return (
    <>
      <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {isLoading || !fact ? (
            <div className="p-6 text-sm text-muted-foreground">불러오는 중…</div>
          ) : (
            <>
              <SheetHeader className="space-y-3">
                <div className="flex items-center gap-2">
                  <DomainBadge domain={fact.domain} />
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {fact.fact_key}
                  </code>
                </div>
                <SheetTitle className="text-base leading-snug">{fact.title}</SheetTitle>
                <SheetDescription className="flex items-center gap-3 text-xs">
                  <span>최초 {fmtDateTime(fact.first_seen_at)}</span>
                  <span>·</span>
                  <span>갱신 {fmtDateTime(fact.updated_at)}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5 px-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      감성
                    </div>
                    <div className="mt-1">
                      <SentimentGauge value={fact.sentiment} />
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      신뢰도
                    </div>
                    <div className="mt-1">
                      <ReliabilityBar value={fact.reliability} />
                    </div>
                  </div>
                </div>

                {fact.summary && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      요약
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {fact.summary}
                    </p>
                  </div>
                )}

                {(fact.related_tickers ?? []).length > 0 && (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      관련 티커
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {fact.related_tickers!.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium uppercase text-secondary-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    근거 문서 ({sources.length})
                  </div>
                  {sources.length === 0 ? (
                    <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                      연결된 원본 문서가 없습니다.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {sources.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-start gap-3 rounded-md border bg-card p-2.5"
                        >
                          <div className="flex-1">
                            <div className="line-clamp-2 text-sm font-medium">
                              {s.title ?? "(제목 없음)"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {formatSourceLabel(s.source)} ·{" "}
                              {fmtDateTime(s.published_at)}
                            </div>
                          </div>
                          <ReliabilityBar value={s.reliability} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div>
                    <div className="text-sm font-medium">활성 상태</div>
                    <div className="text-xs text-muted-foreground">
                      스테일하면 비활성화해 검색·랭킹에서 제외됩니다.
                    </div>
                  </div>
                  <Switch
                    checked={fact.is_active}
                    disabled={mut.isPending}
                    onCheckedChange={(v) => setPendingToggle(v)}
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingToggle !== null}
        onOpenChange={(o) => !o && setPendingToggle(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle ? "Fact를 활성화할까요?" : "Fact를 비활성화할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle
                ? "활성화하면 다시 검색·랭킹 결과에 반영됩니다."
                : "비활성화하면 KB 사용처에서 이 fact가 제외됩니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!fact || pendingToggle === null) return;
                mut.mutate({ id: fact.id, is_active: pendingToggle });
                setPendingToggle(null);
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
