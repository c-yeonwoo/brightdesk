# BrightDesk Active Investment Navigator

## Product direction

BrightDesk should not behave like a passive watchlist. The target product is an aggressive investment navigator:

- Monitor a broad universe: Magnificent 7, major S&P 500 companies, sector ETFs, and large Korean KOSPI/KOSDAQ names.
- Detect where market attention, liquidity, disclosures, and news are concentrating.
- Focus collection and analysis on the most relevant industries and tickers per session.
- Translate market evidence into portfolio actions: watch, accumulate, add, reduce, avoid.

## Universe vs collection

The monitored universe is intentionally much larger than the per-cron collection set.

- `Monitoring universe`: broad candidate pool.
- `Price seed`: rotating subset that gets price/indicator refresh on each market-session cron.
- `Ticker research`: smaller rotating subset for RSS/news collection.
- `Portfolio/watchlist`: always high priority.

This keeps the system aggressive without crawling hundreds of feeds every run.

## Current implementation

- Magnificent 7 are always prioritized.
- Core ETFs are always prioritized for market regime and allocation signals.
- S&P 500 focus names rotate through price seed and ticker research.
- KOSPI/KOSDAQ large-cap focus names rotate through price seed and ticker research.
- User watchlist and portfolio holdings override rotation priority.

## Environment controls

```env
BRIGHTDESK_PRICE_SEED_LIMIT=80
BRIGHTDESK_TICKER_RESEARCH_LIMIT=30
BRIGHTDESK_TICKER_RESEARCH_RSS_LIMIT=5
BRIGHTDESK_EXTRA_MONITOR_TICKERS=
BRIGHTDESK_PRICE_SEED_ALWAYS_TICKERS=
BRIGHTDESK_RESEARCH_ALWAYS_TICKERS=
```

## Next improvements

- Add KRX-backed dynamic top market-cap updater.
- Add sector heat scoring from price momentum, KB fact density, DART activity, and news velocity.
- Let the dashboard explain why a sector is currently being watched aggressively.
- Add portfolio action thresholds by regime: risk-on, neutral, risk-off.
