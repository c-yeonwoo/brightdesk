import type { KbDomain, SourceType } from "./kb-client.server";

export const DOMAIN_LABEL: Record<KbDomain, string> = {
  macro: "거시",
  theme: "테마",
  news: "뉴스",
  politics: "정치",
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  broker_pdf: "증권사 리포트",
  mijueun_youtube: "미주은 유튜브",
  snoomi_kakao: "스누미 카톡",
  news: "뉴스",
};

export const DOMAIN_COLOR_VAR: Record<KbDomain, string> = {
  macro: "var(--domain-macro)",
  theme: "var(--domain-theme)",
  news: "var(--domain-news)",
  politics: "var(--domain-politics)",
};

export function freshnessLevel(iso: string | null): "fresh" | "stale" | "old" | "none" {
  if (!iso) return "none";
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / (1000 * 60 * 60);
  if (h <= 24) return "fresh";
  if (h <= 72) return "stale";
  return "old";
}

export function freshnessColor(l: ReturnType<typeof freshnessLevel>): string {
  switch (l) {
    case "fresh":
      return "var(--success)";
    case "stale":
      return "var(--warning)";
    case "old":
      return "var(--danger)";
    default:
      return "var(--muted-foreground)";
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}일 전`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}달 전`;
  return `${Math.round(mo / 12)}년 전`;
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sentimentColor(s: number | null): string {
  if (s == null) return "var(--muted-foreground)";
  if (s > 0.2) return "var(--success)";
  if (s < -0.2) return "var(--danger)";
  return "var(--warning)";
}

export function sentimentLabel(s: number | null): string {
  if (s == null) return "—";
  if (s > 0.5) return "강한 긍정";
  if (s > 0.2) return "긍정";
  if (s < -0.5) return "강한 부정";
  if (s < -0.2) return "부정";
  return "중립";
}
