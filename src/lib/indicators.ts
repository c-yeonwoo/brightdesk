// Pure TypeScript technical indicators. Input arrays must be chronologically ordered (oldest → newest).

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // seed with SMA of first `period` values
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const macdLine = values.map((_, i) =>
    ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null,
  );
  // signal = EMA of macdLine over non-null prefix
  const firstIdx = macdLine.findIndex((v) => v != null);
  const sigOut: (number | null)[] = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const tail = macdLine.slice(firstIdx).filter((v): v is number => v != null);
    const sig = ema(tail, signal);
    for (let i = 0; i < sig.length; i++) sigOut[firstIdx + i] = sig[i];
  }
  const hist = macdLine.map((v, i) =>
    v != null && sigOut[i] != null ? v - (sigOut[i] as number) : null,
  );
  return { macd: macdLine, signal: sigOut, hist };
}

export interface PriceRow {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorRow {
  date: string;
  rsi14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
}

export function computeIndicators(prices: PriceRow[]): IndicatorRow[] {
  const closes = prices.map((p) => p.close);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const m20 = sma(closes, 20);
  const m60 = sma(closes, 60);
  const m120 = sma(closes, 120);
  return prices.map((p, i) => ({
    date: p.date,
    rsi14: r[i],
    macd: m.macd[i],
    macd_signal: m.signal[i],
    macd_hist: m.hist[i],
    ma20: m20[i],
    ma60: m60[i],
    ma120: m120[i],
  }));
}
