# BrightDesk Design Docs (통합본)

## Overview

- 프로젝트명: BrightDesk
- 목표: 시장 흐름을 읽고 섹터/종목/ETF 후보와 포트폴리오 반영 방향을 제안하는 투자 의사결정 보조(MVP) 플랫폼
- 운영 범위: 수집 파이프라인, 신호 생성, 포트폴리오 실행(권고), 결과 추적, 파이프라인 모니터링
- 핵심 동작 흐름
  1) 외부 소스 RSS/Atom 수집
  2) 문서 정규화/중복 제거
  3) AI 정제 → `kb_facts` 생성/업데이트
  4) 가격/지표 계산 + 신호 생성
  5) 리스크/레짐 반영 + 자동 리밸런싱(시스템)
  6) 성과/알림 모니터링
- 현재 스택 확정: **Supabase + TanStack Start(TypeScript) + PostgreSQL + 크론 기반 자동화**
  - Python은 보조 워커 확장 후보로만 유지
  - `source_registry`/`pipeline_version` 기반으로 수집소스·정제 버전 추적 확장성 확보
  - 배포 기준: Vercel + Supabase 웹앱
  - ADR: `docs/adr/0001-mvp-webapp-architecture.md`

## PO 정리 (문제점·개선·우선순위)

- 핵심 사용성 병목
  - 신호 카드가 기능적으로는 풍부하지만 결정 포인트가 여러 번 클릭으로 분산
  - 시스템 상태 메시지가 사용자 기준 언어로 번역되지 않으면 판단이 지연됨
  - 피드백(승인/반려) 입력이 실패했을 때 보전 동선 부재
  - 파이프라인 화면과 사용자 화면 간 역할 경계가 섞여 있음

- 우선순위 (현재 기준)
  - P0: 실패 상태 번역 + 안내, 피드백 동기화 보장(오프라인 큐), 수동 실행 경로 가시화
  - P1: 추천 근거 drill-down, 모바일 핵심 액션 정렬, 운영/사용자 모드 분리
  - P2: 지표 튜닝 워크숍(성과/신뢰도 기반), 알림 템플릿 고도화

- MVP에서 완료한 작업
  - [x] Signal Card 액션 인라인화 및 근거 모달 연결
  - [x] 피드백 수집(오프라인 큐 포함)
  - [x] 크론 인증/멱등성/재시도/알림 흐름 적용
  - [x] 수집 소스 전략 인터페이스화(RSS 전략 기반 확장 설계)

---

## Architecture

- 런타임/프레임워크
  - Frontend + Server: TanStack Start (`src/routes/*`, `src/lib/*`)
  - Auth/요청 미들웨어: `src/integrations/supabase/auth-attacher.ts`, `src/start.ts`
- 저장소/영속성: Supabase Postgres
- 데이터 액세스 계층
  - 브라우저: `src/integrations/supabase/client.ts`
  - 서버: `src/integrations/supabase/client.server.ts`
- 핵심 모듈
  - 수집/정제: `src/lib/collectors.server.ts`
  - 파이프라인 API: `src/lib/pipeline.functions.ts`
  - 크론 보안/기록/알림: `src/lib/cron.server.ts`, `src/lib/cron-alert.server.ts`
  - 시그널/가격/리스크/포트폴리오: `signals.server.ts`, `prices.server.ts`, `indicators.ts`, `risk.server.ts`, `portfolio.server.ts`
  - 성과: `outcomes.server.ts`
  - 소스 운영: `source_registry`, `getCollectorProfiles`(collectors)로 소스 프로필 확장
- 주요 라우트
  - 운영 UI: `src/routes/pipeline.tsx`
  - 수동 실행 API: `/api/public/cron/collect`, `/api/public/cron/hourly-rebalance`
- API 패턴
  - 모든 서버 호출은 `createServerFn`/route 서버핸들러를 통해 중앙 도메인 함수를 호출
  - 파이프라인 상태는 `getPipelineStatus`에서 집계 후 UI로 노출

---

## Data pipeline

### 1) 수집(Collector)
- 구현 파일: `src/lib/collectors.server.ts`
- 대상 소스: RSS/Atom
- 전략/확장
  - `CollectorStrategy` (`isEnabled`, `fetch`)
  - `CollectorConfig` + `CollectorFactory` + `buildCollectors`
  - 기본 전략: RSS 전략
  - 장점: 소스 추가/수정 시 설정 확장 중심으로 처리 가능
- 핵심 특징
  - fetch 실패/파싱 실패에 대한 개별 소스 격리 처리
  - `content_hash` 기반 중복 방지
  - 처리결과는 `collected/inserted/skipped`로 집계

### 2) 정제(Refine)
- 구현: `runRefiner`, `refineOne`
- `AI_API_KEY` / `OPENAI_API_KEY` 기반 OpenAI-compatible LLM 호출 + JSON schema 검증
- 결과 upsert 대상: `kb_facts`
- 실패 시 해당 문서별 에러 문자열 처리(운영 로그용)
- 정제 출력은 `kb-facts-v1` 공통 스키마를 강제
- raw_documents와 kb_facts에 `pipeline_version`, `source_profile_key`를 함께 저장해 소스·프롬프트 변화 추적

### 3) 지표/신호
- 가격/지표 계산: `prices.server.ts`, `indicators.ts`
- 신호 생성: `signals.server.ts`
- 구성 가능: 가중치/파라미터 환경변수 기반(고정값/확장 가능)

### 4) 트레이드/리스크/성과
- 실행/스냅샷: `portfolio.server.ts`, `fx.server.ts`, `risk.server.ts`
- 성과 집계: `outcomes.server.ts`
- 시나리오 비동기 실행: `scenarios.server.ts`, `scenario_runs`

### 수집 대상(현재 확정)
- RSS 소스(환경변수로 주입)
  - `BRIGHTDESK_BROKER_PDF_RSS_URL` (`broker_pdf`)
  - `BRIGHTDESK_MIJUEUN_YT_RSS_URL` (`mijueun_youtube`)
  - `BRIGHTDESK_SNOOMI_RSS_URL` (`snoomi_kakao`)
  - `BRIGHTDESK_NEWS_RSS_URL` (`news`)
- 소스별 개수 제한
  - `BRIGHTDESK_BROKER_PDF_RSS_URL_LIMIT`
  - `BRIGHTDESK_MIJUEUN_YT_RSS_URL_LIMIT`
  - `BRIGHTDESK_SNOOMI_RSS_URL_LIMIT`
  - `BRIGHTDESK_NEWS_RSS_URL_LIMIT`
- 값이 없으면 해당 소스는 자동 비활성
- 신규 소스 추가(채널/도메인):
  - `source_registry`에 소스 키/표시명/파싱 버전 등록
  - CollectorConfig에 환경변수/파서/신뢰도 정책 추가
  - `registerCollector` 또는 `buildCollectors` 확장

### 수동 문서 입력
- 지원 입력: text, `.txt`, `.md`, PDF, image(`png`, `jpg`, `webp`)
- 저장 위치: `raw_documents` (`source = manual_upload`)
- PDF: 서버에서 텍스트 추출 후 KB 정제
- Image: AI vision 기반 OCR/요약 후 KB 정제
- 문서 상세: 원문, 처리 상태, 생성된 KB facts, 정제 재실행 버튼 제공
- MVP 제한: 파일 8MB 이하

---

## Cron & Operations

### Cron 동작
- `cron.collect`
  - 수집 + 정제
  - 호출: `/api/public/cron/collect`
  - 보호: `CRON_SECRET`(우선) 또는 `BRIGHTDESK_CRON_TOKEN` 헤더/토큰 검증
  - 멱등성: `registerCronRun`(namespace + run key)
  - 실패 시 재시도 가능 (`BRIGHTDESK_CRON_RETRY_*`)

### 크롤링 소스 운영 포인트
- 값이 없는 소스는 자동 비활성.
- 운영자가 새 소스 추가 시 `CollectorConfig` + `CollectorStrategy`만 확장하면 되며, 우선은 RSS/Atom 등록 기반.
- 현재 기본 대상: 브로커 PDF RSS, 미주의 유튜브 RSS, 스누미 카카오 RSS, 외부 뉴스 RSS
- `cron.hourly-rebalance`
  - 수집, 정제, FX, 신호, 레짐, 거래 적용, 스냅샷, 성과 산정(전 단계 preflight 기반)
  - 호출: `/api/public/cron/hourly-rebalance`
  - 멱등성 + preflight 재시도

### 운영 지표
- `/pipeline` 모니터링 항목
  - `pending`(미처리 raw_documents)
  - 네임스페이스별 24h 성공률/실패/실행/총건수
  - 최근 큐/성공률/누적 실패 수
  - `p95DurationMs`, `avgDurationMs` (24h)
  - 연속 실패 기반 에스컬레이션

### SLO(현재 기준)
- 24h 성공률: 98% 정상 / 95~98 경고 / <95 위험
- 큐: <150 정상 / 150~299 경고 / >=300 위험
- 연속 실패: `BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES`(기본 3)
- 실행 지연: p95 120~240 경고 / 240초 초과 위험

### 런북(요약)
- 경보 발생 시: `/pipeline` 즉시 확인 → 최근 실패 run_key/이유 추적 → 소스/토큰/네트워크 상태 점검 → 필요 시 수동 재실행
- 누적 이상 반복: escalation 카운트 확인 후 운영 채널 알림 강화(critical)

---

## API & Webhooks

### 공개/API 경계
- cron API
  - `POST /api/public/cron/collect`
  - `POST /api/public/cron/hourly-rebalance`
  - 보호: `X-BRIGHTDESK-CRON-TOKEN` / `X-CRON-SECRET` / `Authorization: Bearer <token>`
- UI 수동 트리거
  - `/pipeline`의 Collect/Refine 버튼

### 알림 채널
- 알림 텍스트 + webhook 전송
- 채널 구분
  - 공용: `BRIGHTDESK_CRON_WEBHOOK_URL`, `BRIGHTDESK_CRON_WEBHOOK_URLS`
  - warning: `BRIGHTDESK_CRON_WARNING_*`
  - critical: `BRIGHTDESK_CRON_CRITICAL_*`
  - 보조: `BRIGHTDESK_SLACK_WEBHOOK_URL`, `BRIGHTDESK_DISCORD_WEBHOOK_URL`
- 제한: 재전송 억제 `BRIGHTDESK_CRON_ALERT_COOLDOWN_MINUTES`

### 주요 환경변수
- 실행: `CRON_SECRET` 또는 `BRIGHTDESK_CRON_TOKEN`, `BRIGHTDESK_CRON_RETRY_ATTEMPTS`, `BRIGHTDESK_CRON_RETRY_DELAY_MS`
- 트레이딩 cron 재시도: `BRIGHTDESK_HOURLY_REBALANCE_RETRY_ATTEMPTS`, `BRIGHTDESK_HOURLY_REBALANCE_RETRY_DELAY_MS`
- 임계치: `BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES`
- 수집: `BRIGHTDESK_*_RSS_URL`, `BRIGHTDESK_*_RSS_URL_LIMIT`
- AI/신호: `AI_API_KEY`, `AI_MODEL`, `AI_GATEWAY_URL`, `BRIGHTDESK_SIGNAL_WEIGHTS_JSON` 혹은 `BRIGHTDESK_WEIGHT_*`

#### 환경변수 체크리스트(로컬/MVP)
- 필수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`(또는 위 1개로 단일 사용), `CRON_SECRET` 또는 `BRIGHTDESK_CRON_TOKEN`
- 권장: `AI_API_KEY`, `AI_MODEL`, `AI_GATEWAY_URL`, `BRIGHTDESK_CRON_ALERT_COOLDOWN_MINUTES`, `BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES`, `BRIGHTDESK_CRON_WEBHOOK_URL`, `BRIGHTDESK_CRON_WEBHOOK_URLS`
- 수집 튜닝: `BRIGHTDESK_BROKER_PDF_RSS_URL`, `BRIGHTDESK_MIJUEUN_YT_RSS_URL`, `BRIGHTDESK_SNOOMI_RSS_URL`, `BRIGHTDESK_NEWS_RSS_URL` 및 각 `_LIMIT`

---

## Data model & migrations

### 주요 테이블
- `raw_documents`
- `kb_facts`
- `signals`
- `prices`
- `indicators`
- `fundamentals`
- `signal_outcomes`
- `portfolios`
- `positions`
- `transactions`
- `portfolio_snapshots`
- `scenarios`
- `scenario_runs`
- `user_portfolio_inputs`
- `rebalance_recommendations`
- `cron_runs`
- `source_registry`

### 핵심 마이그레이션 파일
- `20260604032458_416f0bed...`: Source/Domain 타입, `raw_documents`, `kb_facts`
- `20260604034058_c64f8c...`: `prices`, `indicators`
- `20260604041421_3ec8fe...`: `signals`
- `20260604042834_b59818...`: 포트폴리오/거래/스냅샷/시나리오, 시드
- `20260604161014_6efda7...`: integrity 강화(트랙/컬럼/제약)
- `20260605084500_brightdesk_cron_runs.sql`: cron 실행 이력 및 정책
- `20260605141120_brightdesk_db_integrity_constraints.sql`: 중복/범위 제약 강화
- `20260605153000_brightdesk_scenario_runs.sql`: 비동기 시나리오 실행 상태
- `20260606170000_brightdesk_source_registry.sql`: 소스 레지스트리 및 파이프라인 메타 확장

### 데이터 정합성 포인트(적용 내역)
- `raw_documents`: content_hash + source/external_id 중복 제약
- `kb_facts`: `fact_key` unique + 점수/신뢰도 범위 제약
- `raw_documents`: `source_profile_key`, `pipeline_version` 컬럼 추가
- `kb_facts`: `pipeline_version` 컬럼 추가
- `signals`: score/confidence 범위 제약, ticker/종류/시간 복합 인덱스
- `portfolios/positions/transactions/portfolio_snapshots`: 값 범위 제약
- 서비스-롤 역할 기반 쓰기 제어 + anon/auth는 주로 read 권한

---

## Launch checklist

### P0 (출시 전 필수)
- [x] cron 인증 헤더/비밀키 설정(서버 차단) — 코드 적용 완료
  - `BRIGHTDESK_CRON_TOKEN`, 회전/폐기 규칙 포함
- [x] Lovable 의존성 제거 및 독립 Vercel/Supabase 웹앱 전환
- [x] text/PDF/image 문서 입력 → raw_documents → KB facts 정제 흐름
- [x] 문서별 생성 fact 확인 및 KB 정제 재실행 UX
- [ ] `/pipeline` 수동 수집/정제 경로 1회 이상 실행 및 알림 확인(사용자 로컬 체크 필요)
- [ ] `cron.collect`, `cron.hourly-rebalance` 수동 POST smoke test 통과(권고)
- [ ] 알림 채널(W/C) 1회 이상 수신 성공(권고)
- [ ] 24h 데이터 샘플 감사(raw_documents/kb_facts/cron_runs 20건) 및 이상치 조치

### P1 (출시 직전 안정성)
- [ ] 큐/실패/지연 경고 임계치 기반 대응 절차 훈련
- [ ] 사용자 입력 경로 권한(포트폴리오/권고) 최종 점검
- [ ] 초기 운영 SOP 배포(책임자/에스컬레이션)

### 로컬 체험 조건(사용자 확인 전)
- `bun install` 후 `bun run dev`
- `/pipeline` 페이지 로딩 성공
- 수집/정제 수동 버튼 실행 후 큐 감소 또는 신규 레코드 반영 확인
- 2개 cron 수동 호출 응답 200 또는 실패 원인 명시 확인

---

## Risks / TODO

### 주요 리스크
- 일부 규칙/리스크 엔진은 MVP 단계에서 단순 규칙 기반으로 동작(과도한 자동화에 대한 품질 리스크)
- LLM 정제 품질은 소스 특성에 따라 편차 가능
- 뉴스 소스가 바뀌면 XML 스키마 편차로 파싱 이슈 발생 가능
- 알림 채널 장애 시 운영 감시 공백

### TODO
- 수집 소스별 파서 실패율/응답시간 히스토리 테이블 고도화
- LLM 응답 스키마 거부/재시도 fallback 강화
- 운영자 권한 분리와 사용자별 데이터 경계 강화
- 백테스트/시나리오 워커화(동시성/장기 실행 대응)

---

## Runbook

### 1분기 대응
- 경보 접수(화면): `/pipeline`에서 경보배너/네임스페이스 상태 확인
- 경보 문맥: 최근 10개 실패 원인 추적 + 연속 실패 카운트 확인

### 큐 폭주 대응
1) `raw_documents` pending 급증 여부 확인
2) `cron.collect` 즉시 수동 실행 1회
3) 실패 반복 시 소스별 `enabled` 상태/limit 완화 검토

### 연속 실패 대응
1) 실패 네임스페이스 확인(`cron.collect`/`hourly-rebalance`)
2) 마지막 3~5회 `error_message` 확인
3) `cron` 토큰/웹훅 정상성 확인
4) 필요 시 소스/단계별 격리 후 재실행

### 지연 증가 대응
1) 네임스페이스별 p95Duration 증가 확인
2) 외부 API 응답 지연 + DB 처리량 동시 점검
3) 수집 limit 하향 + retry 정책 조정 검토

### 긴급 알림 규칙(요약)
- 경보 심각도: warning/critical 분리
- critical시: 운영 담당자 즉시 알림 + 실패 로그(최근 5개) 공유 + 재수동 실행 기록

## Notion 반입용 붙여넣기 블록

```markdown
## Overview
- 목적: 투자 의사결정 보조 플랫폼
- 사용자: 트레이딩 의사결정/포트폴리오 권고/파이프라인 모니터링
- 1차 스택: Supabase + TypeScript(TanStack Start) + PostgreSQL

## Architecture
- Frontend/Server: TanStack Start
- DB: Supabase Postgres
- 통합 수집/정제/신호/리밸런싱 파이프라인
- 핵심 DB: raw_documents, kb_facts, signals, cron_runs, source_registry

## Data pipeline
1) 수집: RSS/Atom 피드 fetch + 중복 제거  
2) 정제: LLM 스키마 변환(kb-facts-v1) + upsert  
3) 신호: 지표/리스크 반영 액션 산출  
4) 실행: 시나리오/포트폴리오/성과 기록

## Cron & Operations
- 수동/자동 크론: /api/public/cron/collect, /api/public/cron/hourly-rebalance
- 상태: /pipeline 운영 카드 + 큐/성공률/p95
- 실패 시 재시도, 알림, 에스컬레이션 적용

## API & Webhooks
- 인증: CRON_SECRET(권장) 또는 BRIGHTDESK_CRON_TOKEN
- 알림: BRIGHTDESK_CRON_WEBHOOK_URL(S), warning/critical 분기 웹훅

## Data model & migrations
- 마이그레이션: cron_runs, scenario_runs, source_registry, signal/성과 정합성 제약

## Launch checklist
- [ ] cron token/webhook/supabase key/llm key 선검증
- [ ] collect + hourly-rebalance 수동 1회 이상 실행
- [ ] 운영 알림 1회 수신 확인
- [ ] 24h 샘플 품질 감사(raw_documents, kb_facts, cron_runs)

## Risks / TODO
- 규칙기반 신호 품질 편차
- 소스/LLM 파서 오류 시 품질 경보
- 수집 소스 확대 시 parser_profile 운영 정책 정합성

## Runbook
- 경보: /pipeline 확인 → 최근 실패 추적 → 수동 재실행 판단
- 큐 폭주/연속 실패/지연에 대한 단계적 대응 절차
```
