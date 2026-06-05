import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Check, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMatchingAlerts } from "@/lib/alerts.functions";

interface AlertRules {
  enabled: boolean;
  minConfidence: number; // 0..1
  kinds: ("BUY" | "SELL")[];
  tickers: string[]; // empty = all
  sinceHours: number;
  channelEmail: boolean; // 자리만 — 추후 라우팅
  channelPush: boolean;
}

const DEFAULT_RULES: AlertRules = {
  enabled: true,
  minConfidence: 0.6,
  kinds: ["BUY", "SELL"],
  tickers: [],
  sinceHours: 24,
  channelEmail: false,
  channelPush: false,
};

const STORAGE_KEY = "brightdesk.alert.rules.v1";
const SEEN_KEY = "brightdesk.alert.seen.v1";

function loadRules(): AlertRules {
  if (typeof window === "undefined") return DEFAULT_RULES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES;
    return { ...DEFAULT_RULES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RULES;
  }
}

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function AlertCenter() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rules, setRules] = useState<AlertRules>(DEFAULT_RULES);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRules(loadRules());
    setSeen(loadSeen());
  }, []);

  const saveRules = (next: AlertRules) => {
    setRules(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["alerts", rules],
    enabled: rules.enabled,
    refetchInterval: 60_000,
    queryFn: () =>
      getMatchingAlerts({
        data: {
          minConfidence: rules.minConfidence,
          kinds: rules.kinds,
          tickers: rules.tickers,
          sinceHours: rules.sinceHours,
          limit: 50,
        },
      }),
  });

  const alerts = (data ?? []) as any[];
  const unread = useMemo(
    () => alerts.filter((a) => !seen.has(a.id)).length,
    [alerts, seen],
  );

  const markAllSeen = () => {
    const next = new Set(seen);
    for (const a of alerts) next.add(a.id);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    } catch {}
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setTimeout(markAllSeen, 1500);
        }}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        title="알림"
      >
        {rules.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        {rules.enabled && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-danger-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setEditing(false);
            }}
          />
          <div className="absolute right-0 top-10 z-50 w-[380px] overflow-hidden rounded-xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Bell className="h-3.5 w-3.5" /> 시그널 알림
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="알림 설정"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {editing ? (
              <RulesEditor
                rules={rules}
                onChange={saveRules}
                onClose={() => {
                  setEditing(false);
                  refetch();
                }}
              />
            ) : (
              <AlertList alerts={alerts} loading={isLoading} enabled={rules.enabled} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AlertList({
  alerts,
  loading,
  enabled,
}: {
  alerts: any[];
  loading: boolean;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        알림이 꺼져 있습니다. 설정에서 켜주세요.
      </div>
    );
  }
  if (loading) {
    return <div className="p-6 text-center text-xs text-muted-foreground">불러오는 중…</div>;
  }
  if (alerts.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        조건에 맞는 신규 시그널이 없습니다.
      </div>
    );
  }
  return (
    <ul className="max-h-[420px] divide-y overflow-auto">
      {alerts.map((a) => {
        const conf = a.confidence != null ? Math.round(Number(a.confidence) * 100) : null;
        const kindColor =
          a.kind === "BUY" || a.kind === "ADD"
            ? "var(--success)"
            : a.kind === "SELL" || a.kind === "REDUCE"
              ? "var(--danger)"
              : "var(--muted-foreground)";
        return (
          <li key={a.id} className="px-3 py-2.5 hover:bg-muted/30">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold tabular-nums">{a.ticker}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    background: `color-mix(in oklab, ${kindColor} 14%, transparent)`,
                    color: kindColor,
                  }}
                >
                  {a.kind}
                </span>
                {conf != null && (
                  <span className="text-[10px] text-muted-foreground">신뢰도 {conf}%</span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(a.ts).toLocaleString("ko-KR", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {Array.isArray(a.reasons) && a.reasons.length > 0 && (
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {a.reasons.slice(0, 2).join(" · ")}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RulesEditor({
  rules,
  onChange,
  onClose,
}: {
  rules: AlertRules;
  onChange: (r: AlertRules) => void;
  onClose: () => void;
}) {
  const [tickerInput, setTickerInput] = useState(rules.tickers.join(", "));
  const toggleKind = (k: AlertRules["kinds"][number]) => {
    const next = rules.kinds.includes(k)
      ? rules.kinds.filter((x) => x !== k)
      : [...rules.kinds, k];
    onChange({ ...rules, kinds: next });
  };

  return (
    <div className="space-y-3 p-3 text-xs">
      <label className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-2">
        <span className="font-medium">알림 활성화</span>
        <input
          type="checkbox"
          checked={rules.enabled}
          onChange={(e) => onChange({ ...rules, enabled: e.target.checked })}
        />
      </label>

      <div>
        <div className="mb-1.5 font-medium">최소 신뢰도 ({Math.round(rules.minConfidence * 100)}%)</div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={rules.minConfidence * 100}
          onChange={(e) => onChange({ ...rules, minConfidence: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </div>

      <div>
        <div className="mb-1.5 font-medium">시그널 종류</div>
        <div className="flex flex-wrap gap-1.5">
          {(["BUY", "SELL"] as const).map((k) => {
            const on = rules.kinds.includes(k);
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={
                  "rounded-md border px-2 py-1 text-[11px] " +
                  (on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground")
                }
              >
                {on && <Check className="mr-1 inline h-2.5 w-2.5" />}
                {k}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 font-medium">종목 필터 (쉼표 구분, 비우면 전체)</div>
        <input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value)}
          onBlur={() => {
            const list = tickerInput
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean);
            onChange({ ...rules, tickers: list });
          }}
          placeholder="AAPL, NVDA, TSLA"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
        />
      </div>

      <div>
        <div className="mb-1.5 font-medium">조회 기간</div>
        <select
          value={rules.sinceHours}
          onChange={(e) => onChange({ ...rules, sinceHours: Number(e.target.value) })}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
        >
          <option value={1}>지난 1시간</option>
          <option value={6}>지난 6시간</option>
          <option value={24}>지난 24시간</option>
          <option value={72}>지난 3일</option>
          <option value={168}>지난 7일</option>
        </select>
      </div>

      <div className="rounded-md border border-dashed border-border p-2 text-[10px] text-muted-foreground">
        <div className="mb-1 font-medium text-foreground/70">전송 채널 (Pro 출시 예정)</div>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            disabled
            checked={rules.channelEmail}
            onChange={(e) => onChange({ ...rules, channelEmail: e.target.checked })}
          />
          이메일 알림
        </label>
        <label className="mt-0.5 flex items-center gap-1.5">
          <input
            type="checkbox"
            disabled
            checked={rules.channelPush}
            onChange={(e) => onChange({ ...rules, channelPush: e.target.checked })}
          />
          웹 푸시
        </label>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
        >
          완료
        </button>
      </div>
    </div>
  );
}
