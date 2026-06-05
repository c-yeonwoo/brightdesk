import { supabaseAdmin } from "@/integrations/supabase/client.server";

// 종목 통화 판별
// - 한국: 6자리 숫자(005930), .KS/.KQ/.KRX 접미사, KOSPI 지수(^KS11) 등
// - 그 외: USD (AAPL, NVDA, BRK-B 등)
export function isUsTicker(ticker: string): boolean {
  const t = ticker.toUpperCase().trim();
  if (!t) return false;
  if (/^\d{6}$/.test(t)) return false;
  if (/\.(KS|KQ|KRX)$/.test(t)) return false;
  if (t === "KRW=X") return false;
  if (t.startsWith("^KS") || t.startsWith("^KQ")) return false;
  return true;
}

export function currencyOf(ticker: string): "USD" | "KRW" {
  return isUsTicker(ticker) ? "USD" : "KRW";
}

let cachedSpot: { rate: number; at: number } | null = null;
const SPOT_TTL_MS = 30 * 60 * 1000; // 30분 캐시

// 최신 USD/KRW (1 USD = ? KRW). DB(prices.KRW=X) → Yahoo fallback → 안전 fallback
export async function getUsdKrwSpot(): Promise<number> {
  if (cachedSpot && Date.now() - cachedSpot.at < SPOT_TTL_MS) return cachedSpot.rate;

  const { data } = await supabaseAdmin
    .from("prices")
    .select("close,date")
    .eq("ticker", "KRW=X")
    .order("date", { ascending: false })
    .limit(1);
  let rate = data && data.length > 0 ? Number((data[0] as any).close) : 0;

  if (!rate || !Number.isFinite(rate)) {
    try {
      const res = await fetch(
        "https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?interval=1d&range=5d",
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
      );
      if (res.ok) {
        const j: any = await res.json();
        const closes: (number | null)[] =
          j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        for (let i = closes.length - 1; i >= 0; i--) {
          const v = closes[i];
          if (v != null && Number.isFinite(v)) { rate = v; break; }
        }
      }
    } catch {}
  }
  if (!rate || !Number.isFinite(rate)) rate = 1380; // 안전 fallback

  cachedSpot = { rate, at: Date.now() };
  return rate;
}

// 특정 일자 환율 (백테스트/체결 기록용). 없으면 spot.
export async function getUsdKrwOn(date: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("prices")
    .select("close,date")
    .eq("ticker", "KRW=X")
    .lte("date", date.slice(0, 10))
    .order("date", { ascending: false })
    .limit(1);
  if (data && data.length > 0) {
    const v = Number((data[0] as any).close);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return getUsdKrwSpot();
}

// 종목 native 가격/금액을 KRW로 환산
export async function priceToKrw(amount: number, ticker: string, date?: string): Promise<number> {
  if (!isUsTicker(ticker)) return amount;
  const rate = date ? await getUsdKrwOn(date) : await getUsdKrwSpot();
  return amount * rate;
}

// 환율 일별 히스토리 수집 (prices 테이블에 ticker='KRW=X'로 저장)
export async function refreshFxHistory() {
  const { refreshTickerPrices } = await import("./prices.server");
  cachedSpot = null;
  return refreshTickerPrices("KRW=X", "1y");
}
