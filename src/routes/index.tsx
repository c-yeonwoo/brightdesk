import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { AlertCircle, Database, FileText, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/kb/AppShell";
import { DomainBadge } from "@/components/kb/DomainBadge";
import { getOverview } from "@/lib/kb.functions";
import {
  DOMAIN_LABEL,
  SOURCE_LABEL,
  freshnessColor,
  freshnessLevel,
  relativeTime,
} from "@/lib/kb-format";
import type { KbDomain, SourceType } from "@/lib/kb-client.server";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "대시보드 · KB Monitor" },
      { name: "description", content: "KB 활성 fact, 신선도, 소스별 통계 한눈에 보기." },
    ],
  }),
  component: OverviewPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        대시보드 데이터를 불러올 수 없습니다: {error.message}
      </div>
    </AppShell>
  ),
});

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "success";
}) {
  const color =
    tone === "warn"
      ? "var(--warning)"
      : tone === "success"
      ? "var(--success)"
      : "var(--primary)";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: () => getOverview(),
  });

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">대시보드</h1>
          <p className="text-sm text-muted-foreground">
            지식베이스 현황과 데이터 신선도를 한눈에 확인하세요.
          </p>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="활성 Fact"
              value={data.activeFacts.toLocaleString()}
              hint={`전체 ${data.totalFacts.toLocaleString()}개 중`}
              icon={Database}
              tone="success"
            />
            <StatCard
              label="비활성 Fact"
              value={(data.totalFacts - data.activeFacts).toLocaleString()}
              hint={`활성 비율 ${data.totalFacts > 0 ? Math.round((data.activeFacts / data.totalFacts) * 100) : 0}%`}
              icon={CheckCircle2}
            />
            <StatCard
              label="원본 문서"
              value={data.totalDocs.toLocaleString()}
              hint="raw_documents 총량"
              icon={FileText}
            />
            <StatCard
              label="미처리 원본"
              value={data.unprocessedCount.toLocaleString()}
              hint="processed_at = NULL"
              icon={AlertCircle}
              tone={data.unprocessedCount > 0 ? "warn" : "success"}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">소스별 문서 수 · 평균 신뢰도</h2>
                <span className="text-xs text-muted-foreground">raw_documents</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.bySource}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="source"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(s) => SOURCE_LABEL[s as SourceType] ?? s}
                      stroke="var(--border)"
                    />
                    <YAxis
                      yAxisId="l"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                    />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      domain={[0, 1]}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      stroke="var(--border)"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, name) =>
                        name === "avgReliability" ? v.toFixed(2) : v
                      }
                      labelFormatter={(s) => SOURCE_LABEL[s as SourceType] ?? s}
                    />
                    <Bar yAxisId="l" dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="문서 수" />
                    <Bar
                      yAxisId="r"
                      dataKey="avgReliability"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                      name="평균 신뢰도"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">분야별 신선도 · 신호등</h2>
              <div className="space-y-3">
                {data.byDomain.map((d) => {
                  const level = freshnessLevel(d.lastUpdated);
                  const color = freshnessColor(level);
                  return (
                    <div key={d.domain} className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: color,
                          boxShadow: `0 0 0 3px color-mix(in oklab, ${color} 20%, transparent)`,
                        }}
                      />
                      <DomainBadge domain={d.domain as KbDomain} />
                      <div className="ml-auto text-right">
                        <div className="text-xs tabular-nums">
                          <span className="font-medium text-foreground">{d.active}</span>
                          <span className="text-muted-foreground">/{d.total}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {relativeTime(d.lastUpdated)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
                초록 ≤ 24h · 노랑 ≤ 72h · 빨강 &gt; 72h
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">분야별 활성 / 비활성</h2>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart
                  data={data.byDomain.map((d) => ({
                    name: DOMAIN_LABEL[d.domain as KbDomain],
                    domain: d.domain,
                    활성: d.active,
                    비활성: d.inactive,
                  }))}
                  layout="vertical"
                  stackOffset="expand"
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="활성" stackId="a" fill="var(--success)">
                    {data.byDomain.map((d, i) => (
                      <Cell key={i} fill={`var(--domain-${d.domain})`} />
                    ))}
                  </Bar>
                  <Bar dataKey="비활성" stackId="a" fill="var(--muted)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
