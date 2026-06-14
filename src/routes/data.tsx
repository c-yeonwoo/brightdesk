import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, FileText, Radio, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { listCronRunHistory } from "@/lib/cron-history.functions";

export const Route = createFileRoute("/data")({
  head: () => ({
    meta: [
      { title: "데이터 · BrightDesk" },
      { name: "description", content: "수집 파이프라인 상태와 원본 문서 현황" },
    ],
  }),
  component: DataPage,
});

function DataPage() {
  const useMock = import.meta.env.DEV && import.meta.env.VITE_BRIGHTDESK_MOCK_DASHBOARD !== "false";
  const { data: cronHistory = [] } = useQuery({
    queryKey: ["cron-run-history"],
    queryFn: async () => (useMock ? MOCK_CRON_HISTORY : listCronRunHistory()),
    refetchInterval: 60 * 1000,
  });
  const pipeline = [
    { label: "08:45 장 시작 전", status: "success", text: "FOMC, 환율, 전일 미국장 요약 반영" },
    { label: "10:00 장 시작 후", status: "success", text: "개장 직후 변동성과 섹터 강도 업데이트" },
    { label: "15:00 장 종료 전", status: "pending", text: "리스크 체크와 보유 종목 점검 예정" },
    { label: "17:00 장 종료 후", status: "pending", text: "하루장 요약 스냅샷 저장 예정" },
  ];
  const sources = [
    { name: "Manual Upload", count: 8, processed: 7, reliability: 0.76 },
    { name: "Web URL", count: 5, processed: 5, reliability: 0.72 },
    { name: "Market RSS", count: 24, processed: 22, reliability: 0.68 },
  ];

  return (
    <AppShell>
      <div className="mb-5">
        {useMock && (
          <div className="mb-2 inline-flex rounded-full border bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
            샘플 데이터
          </div>
        )}
        <h1 className="text-xl font-semibold tracking-tight">데이터</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          수집, 정제, cron 실행 상태를 확인합니다.
        </p>
      </div>

      {useMock && (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <SummaryCard icon={Database} label="원본 문서" value="37" helper="웹/문서/RSS" />
          <SummaryCard icon={FileText} label="KB Facts" value="84" helper="활성 79" />
          <SummaryCard icon={Radio} label="미처리" value="3" helper="정제 대기" />
          <SummaryCard icon={ShieldCheck} label="평균 신뢰도" value="72%" helper="최근 14일" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/pipeline"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
        >
          <div className="text-sm font-semibold group-hover:text-primary">수집 파이프라인 →</div>
          <p className="mt-1 text-xs text-muted-foreground">
            소스별 수집 상태, 마지막 실행 시각, 처리/미처리 통계
          </p>
        </Link>
        <Link
          to="/documents"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
        >
          <div className="text-sm font-semibold group-hover:text-primary">원본 문서 →</div>
          <p className="mt-1 text-xs text-muted-foreground">
            raw_documents 목록 · 일자별 갱신 현황
          </p>
        </Link>
      </div>

      {useMock ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              오늘 갱신 플랜
            </h2>
            <div className="space-y-3">
              {pipeline.map((item) => (
                <div key={item.label} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{item.label}</div>
                    <span
                      className={
                        "rounded-full px-2 py-1 text-[10px] font-semibold " +
                        (item.status === "success" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")
                      }
                    >
                      {item.status === "success" ? "완료" : "예정"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" />
              소스별 처리 현황
            </h2>
            <div className="space-y-3">
              {sources.map((source) => (
                <div key={source.name} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{source.name}</span>
                    <span className="text-muted-foreground">{source.processed}/{source.count}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((source.processed / source.count) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    평균 신뢰도 {Math.round(source.reliability * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed bg-muted/30 p-5 text-xs text-muted-foreground">
          파이프라인/원본 화면은 향후 이 페이지의 탭으로 통합 예정입니다.
        </div>
      )}

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Cron 실행 히스토리
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              최근 30건의 실행 상태입니다.
            </p>
          </div>
          <Link
            to="/pipeline"
            className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            파이프라인 상세 →
          </Link>
        </div>

        {cronHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            아직 cron 실행 이력이 없습니다. 수동 실행 또는 다음 market-session cron 이후 표시됩니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">작업</th>
                  <th className="px-3 py-2 text-left">상태</th>
                  <th className="px-3 py-2 text-left">시작</th>
                  <th className="px-3 py-2 text-right">소요</th>
                  <th className="px-3 py-2 text-left">메시지</th>
                </tr>
              </thead>
              <tbody>
                {cronHistory.map((run: any) => (
                  <tr key={run.id ?? run.run_key} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{formatCronName(run.namespace)}</div>
                      <div className="mt-0.5 max-w-[260px] truncate font-mono text-[10px] text-muted-foreground">
                        {run.run_key}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {run.started_at ? new Date(run.started_at).toLocaleString("ko-KR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={run.error_message ? "text-danger" : "text-muted-foreground"}>
                        {run.error_message || "정상 완료"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

const MOCK_CRON_HISTORY = [
  {
    id: "mock-cron-1",
    namespace: "cron.hourly-rebalance",
    run_key: "cron.hourly-rebalance:market:postopen",
    status: "success",
    error_message: null,
    started_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 88 * 60 * 1000).toISOString(),
    duration_ms: 120_000,
  },
  {
    id: "mock-cron-2",
    namespace: "cron.hourly-rebalance",
    run_key: "cron.hourly-rebalance:market:preopen",
    status: "success",
    error_message: null,
    started_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 3 * 60 * 60 * 1000 + 94_000).toISOString(),
    duration_ms: 94_000,
  },
  {
    id: "mock-cron-3",
    namespace: "cron.collect",
    run_key: "cron.collect:manual:test",
    status: "failed",
    error_message: "샘플 실패: CRON_SECRET mismatch",
    started_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    finished_at: new Date(Date.now() - 24 * 60 * 60 * 1000 + 5_000).toISOString(),
    duration_ms: 5_000,
  },
];

function formatCronName(namespace: string) {
  if (namespace === "cron.hourly-rebalance") return "Market session refresh";
  if (namespace === "cron.collect") return "Collection/refine";
  return namespace;
}

function formatDuration(durationMs?: number | null) {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "success"
      ? "bg-success/10 text-success"
      : status === "failed"
        ? "bg-danger/10 text-danger"
        : "bg-warning/10 text-warning";
  const label = status === "success" ? "성공" : status === "failed" ? "실패" : "실행중";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}
