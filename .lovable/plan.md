# BrightDesk 재편 플랜

## 핵심 컨셉

- **Track A (BrightDesk Live)**: 1,000만원으로 24/7 실시간 운용. 1시간마다 수집→분석→리밸런싱. 서비스의 "실증" 트랙.
- **Track B (My Portfolio)**: 유저가 자기 포트폴리오를 입력하면 KB+시그널 근거로 AI가 매수/매도/비중 재구성을 추천.
- **모든 결정은 근거(KB+기본적+기술적) + 승률 통계**가 항상 표시.

## 메뉴 재편 (7개 → 4개)

```
대시보드  │  내 포트폴리오  │  인사이트  │  데이터
```

- **대시보드**: Track A 라이브 성과(자산 곡선·현재 보유·24h 액션) + 오늘의 결정 요약 + KB 하이라이트 + "내 포트폴리오 분석" CTA
- **내 포트폴리오** (Track B): 입력 → AI 재구성 추천(매수/매도/비중+근거+예상승률) → 과거 추천 히스토리
- **인사이트**: 종합 분석(섹터/종목/시나리오 탭) + 시그널 히스토리 + Facts 타임라인 — 기존 signals/scenarios/facts/tickers 통합
- **데이터**: 파이프라인 상태 + 원본 문서 + 일별 갱신 현황 — 기존 pipeline/documents 통합

기존 라우트(`/signals`, `/scenarios`, `/facts`, `/tickers`, `/actions`, `/documents`, `/pipeline`)는 새 페이지의 탭/섹션으로 흡수. 라우트 자체는 당분간 유지 후 deprecate.

## 분석 엔진 강화 (근거 + 승률)

기존 `signals.server.ts`는 기술적+KB 감성만 점수화. 다음을 추가:

### 1. 기본적 분석 레이어
- 종목별 `fundamentals` 테이블: PER/PBR/ROE/매출성장/부채비율/배당 (수집은 일 1회)
- `computeFundamentalScore(ticker)` → -2..+2 점수 + 근거 문자열 배열

### 2. 시그널 산출 구조 개편
- `computeSignal()`을 3개 컴포넌트로 분해:
  - `technicalScore` (RSI/MACD/MA) + reasons
  - `fundamentalScore` (재무지표) + reasons
  - `kbScore` (KB 감성·신뢰도 가중) + reasons + fact_ids
- 최종 `score = w_t*technical + w_f*fundamental + w_k*kb` (가중치는 scenario.params)
- DB `signals` 테이블에 `technical_score`, `fundamental_score`, `kb_score`, `weights` 컬럼 추가

### 3. 승률 추적
- 새 테이블 `signal_outcomes`: signal_id, ticker, kind, entry_price, t+5d/t+20d return, hit(목표달성여부)
- 일배치(cron): 과거 시그널의 N일 후 가격 → outcome 기록
- 집계 뷰 `signal_winrate_by_kind`: BUY/SELL × (score 구간) → 승률·평균수익률·표본수
- UI에서 모든 시그널 카드에 "유사 조건 과거 승률 62% (n=48, +3.2%)" 표시

### 4. 비중 산정 근거화
- 단순 `allocPctPerTrade` 대신:
  - 기본 비중 = `min(maxPerStock, baseAlloc * confidenceMultiplier)`
  - `confidence = sigmoid(score)` × 승률 × KB신뢰도
  - 각 비중 표시 시 "신뢰도 0.71 × 승률 62% × KB신뢰도 0.8 = 비중 12%" 풀어서 노출

## DB 마이그레이션 (1차)

```sql
-- Track 구분
ALTER TABLE portfolios ADD COLUMN kind TEXT NOT NULL DEFAULT 'system'
  CHECK (kind IN ('system','user'));
ALTER TABLE portfolios ADD COLUMN owner_id UUID; -- 추후 auth용, nullable

-- 시그널 점수 분해
ALTER TABLE signals
  ADD COLUMN technical_score NUMERIC,
  ADD COLUMN fundamental_score NUMERIC,
  ADD COLUMN kb_score NUMERIC,
  ADD COLUMN weights JSONB,
  ADD COLUMN confidence NUMERIC;

-- 기본적 분석
CREATE TABLE fundamentals (
  id UUID PK, ticker TEXT, as_of DATE,
  per NUMERIC, pbr NUMERIC, roe NUMERIC,
  revenue_growth NUMERIC, debt_ratio NUMERIC, dividend_yield NUMERIC,
  source TEXT, fetched_at TIMESTAMPTZ
);

-- 승률 추적
CREATE TABLE signal_outcomes (
  id UUID PK, signal_id UUID, ticker TEXT, kind TEXT,
  entry_date DATE, entry_price NUMERIC,
  ret_5d NUMERIC, ret_20d NUMERIC, hit BOOLEAN,
  evaluated_at TIMESTAMPTZ
);

-- 유저 포트폴리오 입력
CREATE TABLE user_portfolio_inputs (
  id UUID PK, portfolio_id UUID, ticker TEXT, qty NUMERIC,
  avg_price NUMERIC, created_at TIMESTAMPTZ
);

-- AI 재구성 추천 결과
CREATE TABLE rebalance_recommendations (
  id UUID PK, portfolio_id UUID, generated_at TIMESTAMPTZ,
  actions JSONB,   -- [{action,ticker,from_weight,to_weight,reasons,confidence,winrate}]
  rationale TEXT, expected_return NUMERIC, expected_risk NUMERIC
);
```

모든 public 테이블 GRANT + RLS 포함.

## Cron 설정

`/api/public/cron/hourly-rebalance` (신규):
1. `runCollection()` + `runRefiner()`
2. `generateSignalsForAll()` (3-팩터 점수)
3. Track A 자동 실행: `applyAllRecentSignals(systemPortfolioId)` — 단, **조건충족시에만** 매매 (confidence ≥ 임계값)
4. `snapshotPortfolio(systemPortfolioId)`

일배치(`/api/public/cron/daily-outcomes`):
- 미평가 시그널 → N일후 가격 조회 → `signal_outcomes` 기록

pg_cron 등록은 마이그레이션과 별도로 insert 도구로.

## 실행 순서 (이번 턴)

1. **마이그레이션**: 위 DDL 일괄 (kind/시그널확장/fundamentals/outcomes/user_inputs/recommendations)
2. **메뉴 재편**: `AppShell.tsx` 4메뉴로 단순화
3. **새 라우트 3종**: `/insights`, `/data`, `/my-portfolio` (기존 라우트는 리다이렉트 또는 deprecated 유지)
4. **분석 엔진**: `fundamentals.server.ts` + `signals.server.ts` 3-팩터 개편 + `outcomes.server.ts` (승률 계산)
5. **시그널 UI 컴포넌트**: `SignalCard` — 3-팩터 분해, 근거 리스트, 승률 배지, 비중 산식 항상 노출
6. **Track A 분리**: `getOrCreateSystemPortfolio()` (kind='system') + Track A 전용 `executeIfConfident()`
7. **Track B**: `/my-portfolio` 입력 폼(수동+CSV) → "AI 재구성" 버튼 → 추천 카드 렌더
8. **대시보드 리디자인**: Track A 자산곡선 + 오늘의 액션 + KB 하이라이트 + Track B CTA
9. **Cron 라우트 2개** + pg_cron 등록 SQL

## 기술 메모 (비기술 유저는 무시)

- 기본적 분석 수집은 일단 yahoo/financial summary 또는 더미 시드 (수집기는 향후 확장)
- 승률 계산은 가격 데이터가 있는 종목 한정, 표본 < 5면 "데이터 부족" 표시
- Track A는 confidence threshold 0.6 + 일 최대 거래수 cap (과매매 방지)
- Track B 추천은 read-only — 절대 실거래 X
- 가중치 기본값: w_t=0.35, w_f=0.30, w_k=0.35 (scenario에서 튜닝)

## 다음 턴 이후

- 유저 인증 (Track B 다중 유저화)
- CSV/증권사 API 업로드
- 시나리오 자동 그리드 서치로 가중치 최적화
- 백테스트 결과를 승률 통계에 합산
