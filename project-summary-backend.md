# BrightDesk 프로젝트 요약 및 백엔드 작업 리스트

작성일: 2026-06-05

## 1) 프로젝트 의도 요약
이 저장소는 “투자 의사결정 데스크” 성격의 웹 앱입니다.
- 핵심 목적은 **실시간 시장 신호 생성 + KB 기반 감성 팩트 반영 + 포트폴리오/시뮬레이션/권고 제시**입니다.
- 운영 콘셉트는 두 트랙으로 나뉩니다.
  - **Track A (데모/자동 운용):** `/`(대시보드), `/portfolio`, `/actions`에서 신호 기반 자동매매 시뮬레이션/체결 추천을 보여줌.
  - **Track B (사용자 입력 기반 권고):** `/my-portfolio`에서 사용자가 보유종목을 입력해 AI 재구성 추천을 생성.
- 데이터 파이프라인은 크게 4단계:
  1) 수집(원본 문서): `collectors.server.ts`
  2) 정제(요인 추출/KB fact): `collectors.server.ts` + `kb.functions.ts`
  3) 가격·지표 생성: `prices.server.ts`, `indicators.ts`
  4) 시그널/리스크/실행/리포팅: `signals.server.ts`, `risk.server.ts`, `portfolio.server.ts`, `dashboard.functions.ts`

## 2) 현재 구조 핵심 맵
- 라우트(페이지)
  - 대시보드: [`src/routes/index.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/index.tsx)
  - 포트폴리오: [`src/routes/portfolio.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/portfolio.tsx), [`src/routes/my-portfolio.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/my-portfolio.tsx)
  - 인사이트/시그널/팩트: [`src/routes/insights.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/insights.tsx), [`src/routes/signals.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/signals.tsx), [`src/routes/facts.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/facts.tsx), [`src/routes/documents.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/documents.tsx), [`src/routes/tickers.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/tickers.tsx)
  - 시나리오: [`src/routes/scenarios.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/scenarios.tsx), 액션: [`src/routes/actions.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/actions.tsx)
  - 파이프라인/데이터: [`src/routes/pipeline.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/pipeline.tsx), [`src/routes/data.tsx`](/Users/ys.choi/dev-private/brightdesk/src/routes/data.tsx)
  - 크론 API: [`src/routes/api/public/cron/collect.ts`](/Users/ys.choi/dev-private/brightdesk/src/routes/api/public/cron/collect.ts), [`src/routes/api/public/cron/hourly-rebalance.ts`](/Users/ys.choi/dev-private/brightdesk/src/routes/api/public/cron/hourly-rebalance.ts)
- 서버 함수 레이어(백엔드 도메인 로직):
  - 수집/정제: [`src/lib/collectors.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/collectors.server.ts)
  - 가격/지표: [`src/lib/prices.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/prices.server.ts), [`src/lib/indicators.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/indicators.ts)
  - 시그널/백테스트/포트폴리오/리스크: [`src/lib/signals.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/signals.server.ts), [`src/lib/scenarios.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/scenarios.server.ts), [`src/lib/portfolio.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/portfolio.server.ts), [`src/lib/risk.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/risk.server.ts)
  - 성과 추적: [`src/lib/outcomes.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/outcomes.server.ts)
  - KB fact 조회/운영: [`src/lib/kb.functions.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/kb.functions.ts), 타입/클라이언트 래퍼 [`src/lib/kb-client.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/kb-client.server.ts)
  - 대시보드/액션/추천/파이프라인 API wrapper: [`src/lib/dashboard.functions.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/dashboard.functions.ts), [`src/lib/actions.functions.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/actions.functions.ts), [`src/lib/recommendations.functions.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/recommendations.functions.ts), [`src/lib/pipeline.functions.ts`](/Users/ys.choi/dev-private/brightdesk/src/lib/pipeline.functions.ts)
- DB/인프라:
  - Supabase 통합: [`src/integrations/supabase/client.server.ts`](/Users/ys.choi/dev-private/brightdesk/src/integrations/supabase/client.server.ts)
  - 앱 auth context 미들웨어 연결: [`src/integrations/supabase/auth-attacher.ts`](/Users/ys.choi/dev-private/brightdesk/src/integrations/supabase/auth-attacher.ts), start entry: [`src/start.ts`](/Users/ys.choi/dev-private/brightdesk/src/start.ts), 서버 엔트리: [`src/server.ts`](/Users/ys.choi/dev-private/brightdesk/src/server.ts)
  - 스키마: `supabase/migrations/*`

## 3) 현재 백엔드 완성도 평가 (요약)
현재 백엔드는 MVP 운영 수준으로 확장 가능한 구조가 준비되어 있습니다.
- 장점
  - Supabase 테이블/권한/기본 CRUD는 구성되어 있고, Route→ServerFn→DB 흐름은 일관됩니다.
  - 데이터 파이프라인이 엔드투엔드로 연결되어 있습니다(수집→정제→시그널→실행→스냅샷).
  - 크론 API 인증/멱등성/재시도/알림이 붙어 있으며 `/pipeline`에서 운영 상태를 모니터링할 수 있습니다.
- 리스크/개선 필요 지점
  - 일부 모듈은 정교한 규칙 대신 기본값 기반 동작이 남아 있습니다(`regime.server.ts`, `risk.server.ts` 등).
  - 사용자 권한 범위는 핵심 경로는 반영되어 있으나, 일부 분석 보조 경로의 운영 정책 정합성은 추가 확인 필요.
  - 장기 데이터 신뢰도(중복·스키마 제약·결측·이상치)와 운영 감사 항목은 계속 강화 필요.
  - 크론 토큰 로테이션, 호출 rate-limit, 알림 채널 장애 대응은 운영 SOP로 보완해야 합니다.

## 3-1) MVP 출시 전 검수 체크리스트

- [x] 핵심 cron 경로 인증/멱등성 적용
- [x] 수집/정제/시그널 파이프라인 수동/자동 실행 흐름 동작 확인
- [x] `/pipeline` 운영 지표 및 에스컬레이션 알림 표시
- [x] 알림 webhook 채널(warning/critical) 분리 및 임계치 처리
- [ ] 비상 대응 런북(큐 폭주, 연속 실패, 지연) 운영자 공유/실행 확인
- [ ] 사용자 입력 경로(포트폴리오/권고) 권한 경계 최종 점검
- [ ] 배포용 시크릿(Supabase/Cron/Slack/Discord/Notifier) 운영 반영
- [ ] 실데이터 품질 샘플 24h 감사(중복/파싱 실패/미정제 건 20건 이상)

### MVP 완료 판정 문구(로컬 체험 전 조건)
- 운영 체크리스트 3개 미완료 항목이 모두 완료되어야 최종 배포 판단.
- 로컬 체험 전 증빙:
  - `/pipeline` 정상 렌더 + 큐/성공률/알림 배너 조회
  - `cron.collect`, `cron.hourly-rebalance` 수동 호출 후 응답/로그 확인
  - 알림 미리보기 최소 1회(Warning 또는 Critical 임계치 시나리오)

### 로컬 사용 전 검증 가이드
- 실행: `bun install && bun run dev`
- 접속: `http://localhost:5173`
- 우선 실행:
  - `/pipeline` 페이지에서 수동 수집/정제 버튼 실행
  - `/api/public/cron/collect` 1회 수동 호출
  - `/api/public/cron/hourly-rebalance` 1회 수동 호출
- 확인:
  - 실패가 나면 `cron_runs`, `raw_documents`, `kb_facts`에서 최근 24h 20건 샘플 조회

## 4) 백엔드 작업 리스트 (실행 우선순위)

### P0: 운영 안정성/보안(최우선)
1. `/api/public/cron/*` 보호
   - 완료 상태: `BRIGHTDESK_CRON_TOKEN` 기반 토큰 인증 + 멱등성 레이어 적용.
   - 작업: 토큰 로테이션 및 헤더 회수 정책을 운영 SOP에 반영해야 함.
   - 산출: 외부 악용 방지, cron 무단 실행 차단 및 재실행 충돌 완화.

2. 마이그레이션/스키마 보강
   - `signal_outcomes`, `raw_documents`, `kb_facts`, `transactions` 등의 제약 및 인덱스 상태 점검.
   - 금전 계산 컬럼 타입 정합성(정밀도), 중복 방지 제약 추가, 상태값 enum 통합, 트리거/함수 점검.
   - 산출: 데이터 일관성/쿼리 성능 향상.

3. Idempotency + 트랜잭션 안전성
   - 크론과 수동 실행 시 `daily` 중복/중복거래 방지.
   - 거래 실행, snapshot, signal insert에서 재시도-safe 처리.
   - 산출: 멱등 실행 가능.

### P1: 실데이터 파이프라인 구축
4. 수집기(real collector) 교체
   - `collectors.server.ts`의 Mock collectors를 실제 크롤링/공식 API/PDF 소스 연동으로 교체.
   - 소스별 parser, rate-limit, robots/법적 규약 준수, 실패 재시도 정책 구현.

5. LLM 정제 품질 강화
   - `LOVABLE_API_KEY` 호출 구조 안정화, schema 엄격 검증, fallback parser 및 휴리스틱 유효성 검증 추가.
   - 정제 실패 케이스 추적 및 수동 큐 대시보드 보강.

### P1: 트레이딩/의사결정 로직 정밀화
6. 시그널 로직 고도화
   - 현재 RSI/MACD/MA + 재무/KB 조합 가중치 고정값(`DEFAULT_WEIGHTS`) 기반.
   - 작업: 가중치 튜닝용 설정 테이블, 규칙 버전 관리, A/B 실험 수집.

7. 리스크 엔진 강화
   - stop-loss/take-profit/trailing은 샘플형 구현.
   - 작업: 레버리지/종목별 제약, 거래 일수 제한, 슬리피지, 급락 회피 규칙 추가.

8. 실행/결과 회고 정확도 개선
   - `outcomes.server.ts`는 단순 진입 후 수익률 기반 hit 판정.
   - 작업: 체결가 모델 개선(당일가/호가 간격/수수료-세금 현실 반영), 보수성 높은 성능 지표(회귀/샤프/드로우다운 per-ticker).

### P2: 사용자 데이터/권한
9. 사용자 계정 스코프 도입
   - 현재 여러 테이블이 공개형 읽기+서비스역할 위주.
   - 작업: `requireSupabaseAuth` 미들웨어를 실제 라우트/행위에 적용(특히 사용자 입력/권장 기록 관리).

10. 사용 기록 및 분석 로그
   - 추천 생성/클릭/수락/거부 로그, 추천-실행 간 연동 로그 추가.
   - 산출: 운영 분석 + 모델 개선 피드백 루프 확보.

### P2: 운영/배포
11. 배치 모니터링
   - pipeline 실패율, cron 실행 지표, API 지연, error rate, queue depth 대시보드화.
12. 배포 자동화
   - Supabase DB migration + 앱 배포 파이프라인 정리.
13. 백테스트/시나리오 분리 실행
   - 현재 로컬 즉시 실행 방식(`runScenarios`)을 워커/배치 큐로 분리하여 병렬/비동기 처리.

## 5) 백엔드 기술 스택 권장안
### 권장: **현재 흐름 유지 + Supabase + TypeScript/NODE(기존)로 확정**
근거:
- 이미 프레임워크가 TanStack Start 기반 서버 함수로 설계됨 (`createServerFn`, 라우팅, SSR 연동).
- DB/인증/실시간 조회/행 단위 권한 관리가 Supabase에서 이미 기본으로 사용되고 있음.
- 현재 코드의 핵심 호출 모두 TS 모듈 하나로 구성되어 있어, 파이프라인 전체를 Python으로 재작성 시 추상화 비용이 큼.

### Python 도입은 보조 스택으로 고려
- Python은 수집/파싱/감성분석/머신러닝 배치에 강점이 있으므로,
  1차로는 **Node/TS 메인 API + Python(별도 워커) 하이브리드**가 효율적.
- 다만 “전체 백엔드 교체”보다는, 현재 아키텍처를 유지하면서 필요 시 Python worker(예: ETL/ML microservice)로 확장하는 것이 위험도가 낮습니다.

## 6) 다음 단계 제안(요청 시 바로 실행 가능)
1) P0 작업 1~3부터 1~2주로 범위 고정해서 처리
2) P1 파이프라인 실데이터 연동 동시 진행
3) P1 후반부에 사용자 인증/권한을 정식 라우팅에 반영
