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


## Initial market backfill

데이터가 부족한 신규 배포 직후에는 5거래일을 기다리지 않고, 수동 백필로 최근 1개월 이상 가격/지표를 먼저 적재한다.

Endpoint:

`POST /api/public/cron/backfill-market?range=3mo&limit=220`

Header:

`x-cron-secret: <CRON_SECRET>`

Behavior:

- 전체 monitoring universe에서 최대 `BRIGHTDESK_MARKET_BACKFILL_LIMIT`개 티커를 선택한다.
- Yahoo daily prices를 `3mo | 6mo | 1y | 2y` 범위로 받아 `prices`, `indicators`를 upsert한다.
- 기본 수집/FRED/DART/RSS와 ticker research를 한 번 실행한다.
- 가격/지표가 깔린 뒤 전체 signal을 생성하고 dashboard snapshot을 갱신한다.
- 이 백필은 일반 hourly cron보다 무겁기 때문에 배포 직후, 유니버스 대폭 변경 직후, 데이터 복구 시 수동 실행한다.

## Stronger navigator upgrades

### Dynamic KRX top universe

- `BRIGHTDESK_KRX_TOP100_AUTO=true`이면 Naver Finance 시총 페이지에서 KOSPI/KOSDAQ 상위 코드를 읽어 monitoring universe에 합친다.
- 실패 시 기존 정적 KOSPI/KOSDAQ 대표 리스트로 fallback한다.
- 기본값은 KOSPI 100개, KOSDAQ 100개다.

### Sector heat score

Sector heat는 최근 30일 기준으로 아래 신호를 합산한다.

- 가격 모멘텀: 섹터 내 종목의 최근 가격 변화
- KB 밀도/감성: DART, SEC, FRED, RSS, 뉴스에서 생성된 KB fact 수와 sentiment
- 시그널 방향: BUY/SELL/HOLD 신호의 점수와 confidence
- 출처 다양성: 여러 source에서 같은 산업을 동시에 가리키는지

점수는 `sector_heat`로 dashboard, recommendation, trade ledger에 노출한다.

### Industry KB grouping

별도 테이블을 늘리기보다 `kb_facts.related_tickers`, `domain`, `raw_documents.source_doc_ids`를 이용해 산업별 KB를 동적으로 묶는다.

- DART: 국내 기업 공시 근거
- SEC: 미국 기업 공시 근거
- FRED: 거시/금리/물가 근거
- RSS/news: 산업 관심도와 내러티브 근거
- ticker research: 관심/보유 종목별 추가 근거

### Portfolio action explanation

추천 액션은 이제 다음 필드를 포함한다.

- `sector`
- `sector_heat_score`
- `sector_rank`
- `sector_reasons`
- `decision_summary`
- `winrate`, `winrate_n`

즉, 단순히 BUY/SELL만 말하지 않고 “왜 지금 이 섹터와 종목인가”를 함께 저장한다.

### Action log and outcome linkage

가상 운용 거래 노트에는 다음 값이 남는다.

- signal decision
- signal score/confidence
- sector heat
- 5거래일 사후 적중률
- 핵심 signal reason

Dashboard trade ledger는 거래별 signal과 `signal_outcomes`를 함께 보여줄 수 있도록 payload를 확장했다.

### Naver news collector

Naver breaking news is collected as a market-attention source, not as official disclosure.

Default sections:

- 금융: `https://news.naver.com/breakingnews/section/101/259`
- 증권: `https://news.naver.com/breakingnews/section/101/258`
- 산업/재계: `https://news.naver.com/breakingnews/section/101/261`

Reliability policy:

- Base reliability is roughly `0.56 ~ 0.58`.
- Articles published within the last 3 hours are boosted up to `0.64`.
- Articles within 12 hours are boosted up to `0.62`.
- The source is useful for detecting what the market is currently paying attention to, but portfolio actions should still be confirmed against prices, filings, macro data, and signal outcomes.

Cron behavior:

- Included in the normal hourly collection path.
- Dedupe uses article URL/content hash, so repeated hourly runs only add newly discovered articles.
