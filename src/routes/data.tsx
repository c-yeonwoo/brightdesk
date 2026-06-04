import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/kb/AppShell";

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
  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">데이터</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          수집 파이프라인과 원본 문서. BrightDesk는 1시간마다 자동 수집·갱신합니다.
        </p>
      </div>

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

      <div className="mt-6 rounded-xl border border-dashed bg-muted/30 p-5 text-xs text-muted-foreground">
        파이프라인/원본 화면은 향후 이 페이지의 탭으로 통합 예정입니다.
      </div>
    </AppShell>
  );
}
