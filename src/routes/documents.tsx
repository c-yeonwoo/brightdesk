import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { AppShell } from "@/components/kb/AppShell";
import { ReliabilityBar } from "@/components/kb/ReliabilityBar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { getDocumentBody, listDocuments, listSources } from "@/lib/kb.functions";
import { formatSourceLabel, fmtDateTime } from "@/lib/kb-format";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "원본 문서 · KB Monitor" },
      { name: "description", content: "raw_documents 원본 데이터를 탐색합니다." },
    ],
  }),
  component: DocsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        문서를 불러올 수 없습니다: {error.message}
      </div>
    </AppShell>
  ),
});

function DocsPage() {
  const [source, setSource] = useState<string>("all");
  const [processed, setProcessed] = useState<"all" | "yes" | "no">("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: catalog = [] as { source: string; count: number }[] } = useQuery({
    queryKey: ["kb-sources"],
    queryFn: () => listSources(),
  });

  const filters = useMemo(
    () => ({
      source: source === "all" ? undefined : (source as any),
      processed,
      q: q.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [source, processed, q, from, to],
  );

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["docs", filters],
    queryFn: () => listDocuments({ data: filters }),
  });

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">원본 문서</h1>
          <p className="text-sm text-muted-foreground">raw_documents 테이블 원본 데이터.</p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {docs.length.toLocaleString()}건
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="소스" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 소스</SelectItem>
            {(catalog ?? []).map((entry) => (
              <SelectItem key={entry.source} value={entry.source}>
                {formatSourceLabel(entry.source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={processed} onValueChange={(v: any) => setProcessed(v)}>
          <SelectTrigger className="h-9 w-32 text-sm">
            <SelectValue placeholder="처리 여부" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">처리/미처리</SelectItem>
            <SelectItem value="yes">처리 완료</SelectItem>
            <SelectItem value="no">미처리</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-40 text-sm"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-40 text-sm"
        />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목 검색"
            className="h-9 pl-8 text-sm"
          />
        </div>
        {(source !== "all" || processed !== "all" || q || from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setSource("all");
              setProcessed("all");
              setQ("");
              setFrom("");
              setTo("");
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
              <th className="px-3 py-2.5 font-medium">소스</th>
              <th className="px-3 py-2.5 font-medium">신뢰도</th>
              <th className="px-3 py-2.5 font-medium">발행</th>
              <th className="px-3 py-2.5 font-medium">수집</th>
              <th className="px-3 py-2.5 font-medium text-center">처리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  불러오는 중…
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  조건에 맞는 문서가 없습니다.
                </td>
              </tr>
            ) : (
              (docs as any[]).map((d) => (
                <tr
                  key={d.id}
                  className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  onClick={() => setSelectedId(d.id)}
                >
                  <td className="max-w-[480px] px-4 py-2.5">
                    <div className="truncate font-medium">{d.title ?? "(제목 없음)"}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                      {formatSourceLabel(d.source as string)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5"><ReliabilityBar value={d.reliability} /></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {fmtDateTime(d.published_at)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {fmtDateTime(d.collected_at)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {d.processed_at ? (
                      <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium" style={{ color: "var(--success)" }}>
                        완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium" style={{ color: "var(--warning)" }}>
                        대기
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DocSheet id={selectedId} onClose={() => setSelectedId(null)} />
    </AppShell>
  );
}

function DocSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: doc, isLoading } = useQuery({
    queryKey: ["doc", id],
    queryFn: () => getDocumentBody({ data: { id: id! } }),
    enabled: !!id,
  });
  const d = doc as any;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading || !d ? (
          <div className="p-6 text-sm text-muted-foreground">불러오는 중…</div>
        ) : (
          <>
            <SheetHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                  {formatSourceLabel(d.source as string)}
                </span>
                {d.external_id && (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {d.external_id}
                  </code>
                )}
              </div>
              <SheetTitle className="text-base leading-snug">
                {d.title ?? "(제목 없음)"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                발행 {fmtDateTime(d.published_at)} · 수집 {fmtDateTime(d.collected_at)} ·{" "}
                {d.processed_at ? `처리 ${fmtDateTime(d.processed_at)}` : "미처리"}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-2 gap-3 px-1">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  신뢰도
                </div>
                <div className="mt-1"><ReliabilityBar value={d.reliability} /></div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  R2 키
                </div>
                <div className="mt-1 truncate font-mono text-[11px]">{d.r2_key ?? "—"}</div>
              </div>
            </div>
            <div className="mt-4 px-1">
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">본문</div>
              <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 font-sans text-sm leading-relaxed">
                {d.body ?? "(본문 없음)"}
              </pre>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
