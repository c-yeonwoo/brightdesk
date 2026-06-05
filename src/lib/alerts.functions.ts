import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * 시그널 알림 매칭.
 * 알림 룰(클라이언트 localStorage)이 보낸 조건과 매치되는 최근 시그널을 반환.
 * 별도 DB 테이블 없이 signals 테이블 위에 derived view로 동작.
 */
export const getMatchingAlerts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        minConfidence: z.number().min(0).max(1).optional(),
        kinds: z.array(z.enum(["BUY", "SELL", "ADD", "REDUCE"])).optional(),
        tickers: z.array(z.string().min(1).max(20)).optional(),
        sinceHours: z.number().int().min(1).max(168).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(
      Date.now() - (data.sinceHours ?? 24) * 3600 * 1000,
    ).toISOString();

    let q = supabaseAdmin
      .from("signals")
      .select(
        "id,ticker,ts,kind,score,confidence,technical_score,fundamental_score,kb_score,reasons",
      )
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(data.limit ?? 50);

    if (data.kinds && data.kinds.length > 0) q = q.in("kind", data.kinds);
    if (data.tickers && data.tickers.length > 0) {
      q = q.in("ticker", data.tickers.map((t) => t.toUpperCase()));
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const filtered = (rows ?? []).filter((r: any) => {
      if (data.minConfidence != null) {
        const c = r.confidence != null ? Number(r.confidence) : 0;
        if (c < data.minConfidence) return false;
      }
      return true;
    });
    return filtered;
  });
