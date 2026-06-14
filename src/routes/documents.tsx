import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, ImageIcon, LinkIcon, Loader2, RefreshCw, Search, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import {
  getDocumentBody,
  listDocuments,
  listSources,
  refineDocumentForKb,
  uploadDocumentForKb,
} from "@/lib/kb.functions";
import { formatSourceLabel, fmtDateTime } from "@/lib/kb-format";
import { requireClientAdmin } from "@/lib/access-control";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const Route = createFileRoute("/documents")({
  beforeLoad: async () => {
    await requireClientAdmin();
  },
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
  const qc = useQueryClient();
  const [source, setSource] = useState<string>("all");
  const [processed, setProcessed] = useState<"all" | "yes" | "no">("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

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

  const uploadMut = useMutation({
    mutationFn: async () => {
      const title = uploadTitle.trim() || uploadFile?.name || uploadUrl.trim() || "수동 업로드 문서";
      if (uploadUrl.trim()) {
        return uploadDocumentForKb({
          data: {
            title,
            url: uploadUrl.trim(),
            reliability: 0.68,
            refine: true,
          },
        });
      }
      if (uploadFile) {
        const mimeType = uploadFile.type || guessMimeType(uploadFile.name);
        if (mimeType === "text/plain" || uploadFile.name.toLowerCase().endsWith(".md")) {
          const text = await uploadFile.text();
          return uploadDocumentForKb({
            data: {
              title,
              fileName: uploadFile.name,
              mimeType: "text/plain",
              text,
              reliability: 0.72,
              refine: true,
            },
          });
        }
        const base64 = await readFileAsDataUrl(uploadFile);
        return uploadDocumentForKb({
          data: {
            title,
            fileName: uploadFile.name,
            mimeType,
            base64,
            reliability: 0.72,
            refine: true,
          },
        });
      }
      return uploadDocumentForKb({
        data: {
          title,
          text: uploadText,
          mimeType: "text/plain",
          reliability: 0.72,
          refine: true,
        },
      });
    },
    onSuccess: (result: any) => {
      setUploadTitle("");
      setUploadText("");
      setUploadUrl("");
      setUploadFile(null);
      qc.invalidateQueries({ queryKey: ["docs"] });
      qc.invalidateQueries({ queryKey: ["kb-sources"] });
      if (result?.id) {
        setSelectedId(result.id);
        qc.invalidateQueries({ queryKey: ["doc", result.id] });
      }
      toast.success(
        result?.refine?.ok
          ? `문서 분석 완료 · fact ${result.refine.facts}개`
          : result?.refine?.error
            ? `문서 저장 완료 · 정제 확인 필요: ${result.refine.error}`
            : "문서가 KB 큐에 저장되었습니다.",
      );
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "문서 업로드 실패");
    },
  });

  const canUpload =
    !uploadMut.isPending &&
    (uploadUrl.trim().length > 0 ||
      (uploadText.trim().length >= 20 && uploadTitle.trim().length > 0) ||
      uploadFile != null);

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

      <section className="mb-4 rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4" />
              문서 넣기
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              웹페이지 링크, 텍스트, PDF, 이미지를 넣으면 원문 저장 후 KB fact로 자동 분류합니다.
            </p>
          </div>
          <Button
            onClick={() => uploadMut.mutate()}
            disabled={!canUpload}
            className="h-9"
          >
            {uploadMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <SparkUploadIcon file={uploadFile} />
            )}
            분석해서 KB 저장
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <Input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="문서 제목"
              className="h-9 text-sm"
            />
            <div className="relative">
              <LinkIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={uploadUrl}
                onChange={(e) => {
                  setUploadUrl(e.target.value);
                  if (e.target.value.trim()) setUploadFile(null);
                }}
                placeholder="웹페이지 링크 붙여넣기"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-background px-4 py-5 text-center transition-colors hover:bg-muted/40">
              <input
                type="file"
                accept=".txt,.md,.pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadUrl.trim().length > 0}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > MAX_UPLOAD_BYTES) {
                    toast.error("파일은 8MB 이하만 업로드할 수 있습니다.");
                    e.currentTarget.value = "";
                    return;
                  }
                  setUploadFile(file);
                  if (file && !uploadTitle.trim()) setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
                }}
              />
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                {uploadFile?.type.startsWith("image/") ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {uploadFile ? uploadFile.name : "PDF / 이미지 / 텍스트 파일 선택"}
              </div>
              <div className="text-xs text-muted-foreground">
                링크는 서버에서 본문을 추출하고, PDF는 텍스트 추출, 이미지는 AI vision으로 OCR합니다.
              </div>
            </label>
          </div>
          <Textarea
            value={uploadText}
            onChange={(e) => setUploadText(e.target.value)}
            disabled={uploadFile != null || uploadUrl.trim().length > 0}
            placeholder="텍스트를 직접 붙여넣을 수도 있습니다. 예: FOMC 요약, 리서치 노트, 기사 전문, 투자 메모..."
            className="min-h-36 resize-y text-sm leading-6"
          />
        </div>
      </section>

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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

function guessMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "text/plain";
}

function SparkUploadIcon({ file }: { file: File | null }) {
  if (file?.type.startsWith("image/")) return <ImageIcon className="mr-2 h-4 w-4" />;
  if (file) return <FileText className="mr-2 h-4 w-4" />;
  return <Upload className="mr-2 h-4 w-4" />;
}

function DocSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: doc, isLoading } = useQuery({
    queryKey: ["doc", id],
    queryFn: () => getDocumentBody({ data: { id: id! } }),
    enabled: !!id,
  });
  const refineMut = useMutation({
    mutationFn: () => refineDocumentForKb({ data: { id: id! } }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["doc", id] });
      qc.invalidateQueries({ queryKey: ["docs"] });
      toast.success(`KB 정제 완료 · fact ${result.facts}개`);
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "KB 정제 실패");
    },
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
            <div className="mt-4 flex flex-wrap gap-2 px-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refineMut.mutate()}
                disabled={refineMut.isPending}
              >
                {refineMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                KB 정제 재실행
              </Button>
            </div>
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
            <div className="mt-4 px-1">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  생성된 KB Facts
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {(d.derived_facts ?? []).length}개
                </span>
              </div>
              {(d.derived_facts ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  아직 이 문서에서 생성된 fact가 없습니다. 처리 대기이거나 AI 정제 결과가 비어 있을 수 있습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {(d.derived_facts ?? []).map((fact: any) => (
                    <div key={fact.id} className="rounded-lg border bg-background p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                          {fact.domain}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          신뢰도 {Math.round(Number(fact.reliability ?? 0.5) * 100)}%
                        </span>
                        <span
                          className="text-[11px]"
                          style={{
                            color:
                              Number(fact.sentiment ?? 0) >= 0
                                ? "var(--success)"
                                : "var(--danger)",
                          }}
                        >
                          sentiment {Number(fact.sentiment ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-sm font-medium">{fact.title}</div>
                      {fact.summary && (
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {fact.summary}
                        </div>
                      )}
                      {(fact.related_tickers ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {fact.related_tickers.map((ticker: string) => (
                            <span key={ticker} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                              {ticker}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
