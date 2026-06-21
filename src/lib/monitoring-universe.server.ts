const MAGNIFICENT_7 = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"];

const CORE_ETFS = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "VOO",
  "IVV",
  "XLK",
  "XLF",
  "XLV",
  "XLE",
  "XLI",
  "XLY",
  "XLP",
  "XLU",
  "XLB",
  "XLRE",
  "SMH",
  "SOXX",
  "TLT",
  "IEF",
  "GLD",
];

const SP500_FOCUS = [
  "AMD",
  "AVGO",
  "ADBE",
  "CRM",
  "ORCL",
  "NFLX",
  "INTC",
  "QCOM",
  "TXN",
  "MU",
  "JPM",
  "BAC",
  "WFC",
  "GS",
  "MS",
  "V",
  "MA",
  "AXP",
  "BLK",
  "COST",
  "WMT",
  "HD",
  "MCD",
  "NKE",
  "SBUX",
  "TGT",
  "PG",
  "KO",
  "PEP",
  "PM",
  "UNH",
  "LLY",
  "JNJ",
  "MRK",
  "ABBV",
  "TMO",
  "ABT",
  "PFE",
  "XOM",
  "CVX",
  "COP",
  "SLB",
  "LIN",
  "CAT",
  "DE",
  "GE",
  "BA",
  "RTX",
  "LMT",
  "HON",
  "UPS",
  "UNP",
  "NEE",
  "DUK",
  "AMT",
  "PLD",
];

const KOSPI_FOCUS = [
  "005930.KS",
  "000660.KS",
  "373220.KS",
  "207940.KS",
  "005380.KS",
  "000270.KS",
  "005490.KS",
  "068270.KS",
  "035420.KS",
  "035720.KS",
  "051910.KS",
  "006400.KS",
  "028260.KS",
  "012330.KS",
  "105560.KS",
  "055550.KS",
  "086790.KS",
  "032830.KS",
  "015760.KS",
  "034730.KS",
  "009150.KS",
  "017670.KS",
  "096770.KS",
  "003550.KS",
  "010130.KS",
  "018260.KS",
  "033780.KS",
  "066570.KS",
  "011200.KS",
  "316140.KS",
  "086280.KS",
  "024110.KS",
  "030200.KS",
  "251270.KS",
  "361610.KS",
  "402340.KS",
  "329180.KS",
  "352820.KS",
  "259960.KS",
  "302440.KS",
  "138040.KS",
  "010950.KS",
  "011170.KS",
  "009540.KS",
  "267260.KS",
  "047050.KS",
  "010140.KS",
  "042660.KS",
  "064350.KS",
  "003670.KS",
  "326030.KS",
  "034020.KS",
  "000810.KS",
  "088350.KS",
  "271560.KS",
  "128940.KS",
  "161390.KS",
  "180640.KS",
  "090430.KS",
  "010120.KS",
];

const KOSDAQ_FOCUS = [
  "247540.KQ",
  "086520.KQ",
  "091990.KQ",
  "028300.KQ",
  "196170.KQ",
  "068760.KQ",
  "035900.KQ",
  "041510.KQ",
  "112040.KQ",
  "293490.KQ",
  "263750.KQ",
  "214150.KQ",
  "039030.KQ",
  "078600.KQ",
  "145020.KQ",
  "058470.KQ",
  "240810.KQ",
  "067310.KQ",
  "095340.KQ",
  "000250.KQ",
  "066970.KQ",
  "215200.KQ",
  "357780.KQ",
  "348370.KQ",
  "277810.KQ",
  "403870.KQ",
  "089030.KQ",
  "025900.KQ",
  "122870.KQ",
  "067160.KQ",
  "036930.KQ",
  "078340.KQ",
  "121600.KQ",
  "064760.KQ",
  "140860.KQ",
  "101490.KQ",
  "084370.KQ",
  "141080.KQ",
  "290650.KQ",
  "222800.KQ",
];

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

function unique(tickers: string[]) {
  return Array.from(new Set(tickers.map(normalizeTicker).filter(Boolean)));
}

function envTickers(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map(normalizeTicker)
    .filter(Boolean);
}

function rotate<T>(items: T[], offset: number) {
  if (items.length === 0) return items;
  const safe = Math.abs(offset) % items.length;
  return [...items.slice(safe), ...items.slice(0, safe)];
}

function bucketOffset(seed?: string) {
  const raw = seed ?? `${Math.floor(Date.now() / (60 * 60 * 1000))}`;
  let hash = 0;
  for (const ch of raw) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

export function getMonitoringUniverse() {
  return unique([
    ...MAGNIFICENT_7,
    ...CORE_ETFS,
    ...SP500_FOCUS,
    ...KOSPI_FOCUS,
    ...KOSDAQ_FOCUS,
    ...envTickers("BRIGHTDESK_EXTRA_MONITOR_TICKERS"),
  ]);
}

export function getPriceSeedTickers(seed?: string) {
  const limit = Number.parseInt(process.env.BRIGHTDESK_PRICE_SEED_LIMIT ?? "", 10) || 80;
  const always = unique([
    ...CORE_ETFS.slice(0, 8),
    ...MAGNIFICENT_7,
    ...envTickers("BRIGHTDESK_PRICE_SEED_ALWAYS_TICKERS"),
  ]);
  const rotating = rotate(
    unique([...CORE_ETFS.slice(8), ...SP500_FOCUS, ...KOSPI_FOCUS, ...KOSDAQ_FOCUS]),
    bucketOffset(seed),
  );
  return unique([...always, ...rotating]).slice(0, limit);
}

export function getDefaultResearchTickers(seed?: string) {
  const limit = Number.parseInt(process.env.BRIGHTDESK_TICKER_RESEARCH_DEFAULT_LIMIT ?? "", 10) || 30;
  const always = unique([
    ...MAGNIFICENT_7,
    "SPY",
    "QQQ",
    "SMH",
    "TLT",
    "GLD",
    ...envTickers("BRIGHTDESK_RESEARCH_ALWAYS_TICKERS"),
  ]);
  const rotating = rotate(unique([...SP500_FOCUS, ...KOSPI_FOCUS, ...KOSDAQ_FOCUS]), bucketOffset(seed));
  return unique([...always, ...rotating]).slice(0, limit);
}

export function getMonitoringUniverseStats() {
  return {
    total: getMonitoringUniverse().length,
    magnificent7: MAGNIFICENT_7.length,
    coreEtfs: CORE_ETFS.length,
    sp500Focus: SP500_FOCUS.length,
    kospiFocus: KOSPI_FOCUS.length,
    kosdaqFocus: KOSDAQ_FOCUS.length,
  };
}


async function fetchNaverMarketCapTickers(market: "kospi" | "kosdaq", limit: number) {
  const sosok = market === "kospi" ? "0" : "1";
  const suffix = market === "kospi" ? ".KS" : ".KQ";
  const out: string[] = [];
  const pages = Math.ceil(limit / 50);

  for (let page = 1; page <= pages; page++) {
    const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BrightDesk-KRX-Universe/1.0",
        Accept: "text/html,*/*",
      },
    });
    if (!res.ok) throw new Error(`Naver market cap ${market} request failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("euc-kr").decode(buf);
    const matches = html.matchAll(/\/item\/main\.naver\?code=(\d{6})/g);
    for (const match of matches) {
      const ticker = `${match[1]}${suffix}`;
      if (!out.includes(ticker)) out.push(ticker);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }

  return out;
}

export async function getDynamicKrxTopTickers() {
  const enabled = (process.env.BRIGHTDESK_KRX_TOP100_AUTO ?? "true").toLowerCase() !== "false";
  if (!enabled) return [] as string[];
  const kospiLimit = Number.parseInt(process.env.BRIGHTDESK_KRX_KOSPI_LIMIT ?? "", 10) || 100;
  const kosdaqLimit = Number.parseInt(process.env.BRIGHTDESK_KRX_KOSDAQ_LIMIT ?? "", 10) || 100;
  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchNaverMarketCapTickers("kospi", kospiLimit),
      fetchNaverMarketCapTickers("kosdaq", kosdaqLimit),
    ]);
    return unique([...kospi, ...kosdaq]);
  } catch {
    return [] as string[];
  }
}

export async function getMonitoringUniverseAsync() {
  const dynamicKrx = await getDynamicKrxTopTickers();
  return unique([...getMonitoringUniverse(), ...dynamicKrx]);
}

export async function getPriceSeedTickersAsync(seed?: string) {
  const limit = Number.parseInt(process.env.BRIGHTDESK_PRICE_SEED_LIMIT ?? "", 10) || 80;
  const always = unique([
    ...CORE_ETFS.slice(0, 8),
    ...MAGNIFICENT_7,
    ...envTickers("BRIGHTDESK_PRICE_SEED_ALWAYS_TICKERS"),
  ]);
  const dynamicKrx = await getDynamicKrxTopTickers();
  const rotating = rotate(
    unique([...CORE_ETFS.slice(8), ...SP500_FOCUS, ...KOSPI_FOCUS, ...KOSDAQ_FOCUS, ...dynamicKrx]),
    bucketOffset(seed),
  );
  return unique([...always, ...rotating]).slice(0, limit);
}
