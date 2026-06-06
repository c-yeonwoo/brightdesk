# BrightDesk Design Docs (Notion 반입용 정리본)

작성일: 2026-06-05 (현재 브랜치 기준)
대상: BrightDesk (Lovable scaffold 기반)
작성자: Codex

## 1) 프로젝트 의도 / 범위

- 투자 의사결정 보조 플랫폼 MVP를 목표로 한 웹 앱
- 핵심 기능
  - 실시간 시장 모니터링/시그널 생성
  - 뉴스/컨텐츠 KB fact 정제 반영
  - 포트폴리오 기반 시뮬레이션/권고 및 정기 리밸런싱
- 현재 아키텍처 목표: Supabase + TypeScript(Node/TanStack Start) 중심으로 운영형 파이프라인 구성

## 2) 스택 확정 결론

- 1차 운영 스택: **Supabase + TypeScript/TanStack Start + PostgreSQL + Vite**
- 보조 제안: Python은 ETL/ML 고성능 처리 필요 시 별도 워커로 확장
- 이유
  - 프론트/백엔드 통합 난이도 낮음
  - Supabase auth/RLS/cron 연동 경로가 현재 코드와 직접 정합
  - 기존 코드가 `createServerFn`/라우팅/DB 호출 패턴으로 이미 일관성 있게 구성

## 3) 현재 구조 핵심 맵

- 라우트: `src/routes/*`
  - 핵심 페이지: `index.tsx`, `portfolio.tsx`, `my-portfolio.tsx`, `signals.tsx`, `facts.tsx`, `pipeline.tsx`
  - 크론 API: `src/routes/api/public/cron/collect.ts`, `src/routes/api/public/cron/hourly-rebalance.ts`
- 서버 함수/도메인 로직: `src/lib/*`
  - 수집/정제: `collectors.server.ts`
  - 파이프라인 API: `pipeline.functions.ts`
  - cron 보안/기록/알림: `cron.server.ts`, `cron-alert.server.ts`
  - 신호/리스크/포트폴리오/성과: `signals.server.ts`, `risk.server.ts`, `portfolio.server.ts`, `outcomes.server.ts`
- 인프라/연동: `src/integrations/supabase/*`
  - 서버 권한용: `client.server.ts`
  - 브라우저용: `client.ts`
- 마이그레이션: `supabase/migrations/*`

## 4) 핵심 파이프라인 개요

### 4.1 수집/정제(Collect → Refine)

- 수집 실행:
  - Cron 및 수동 실행에서 `runCollection()` 호출
  - 각 소스별로 `fetchFeedText`로 RSS/Atom XML 파싱
  - 중복방지: `content_hash` 기반 dedupe
  - 신규/스킵 카운트 저장
- 정제 실행:
  - 미처리 `raw_documents`를 순차 정제
  - LLM(Gemini 게이트웨이)로 fact 추출 후 `kb_facts` upsert

### 4.2 운영 크론

- `cron.collect`
  - 수집 + 정제 단일 사이클
  - 재시도 정책 적용(`BRIGHTDESK_CRON_RETRY_ATTEMPTS`, `BRIGHTDESK_CRON_RETRY_DELAY_MS`)
  - 실행 레코드: `cron_runs` 테이블에 running→success/failed 기록
- `cron.hourly-rebalance`
  - 수집/정제 + FX 갱신 + 신호 생성 + 레짐 평가 + 실행/스냅샷 + 성과 산정
  - Preflight 단계별 재시도(`BRIGHTDESK_HOURLY_REBALANCE_*`)

### 4.3 모니터링/알림

- `/pipeline` 화면에서:
  - 큐 길이, 24h 성공률, 최근 실패, 네임스페이스 상태 표시
  - running/경고/에러 배너 표시
  - SLO: 성공률/큐 길이/연속 실패/지연(p95) 확인
- 알림(웹훅)
  - warning/critical 분기 채널 지원
  - cooldown 및 연속 실패 임계치 기반 escalate

## 5) 현재 크롤링 소스(확정)

현재 크롤러는 RSS/Atom 기반이며, 소스 URL은 하드코딩되지 않고 env로 주입됩니다.

- `BRIGHTDESK_BROKER_PDF_RSS_URL` (source: `broker_pdf`)
- `BRIGHTDESK_MIJUEUN_YT_RSS_URL` (source: `mijueun_youtube`)
- `BRIGHTDESK_SNOOMI_RSS_URL` (source: `snoomi_kakao`)
- `BRIGHTDESK_NEWS_RSS_URL` (source: `news`)

수집 개수 제어:
- `BRIGHTDESK_BROKER_PDF_RSS_URL_LIMIT`
- `BRIGHTDESK_MIJUEUN_YT_RSS_URL_LIMIT`
- `BRIGHTDESK_SNOOMI_RSS_URL_LIMIT`
- `BRIGHTDESK_NEWS_RSS_URL_LIMIT`

값이 없는 소스는 자동 스킵 처리.

## 6) 전략 패턴 및 확장성

- 핵심 인터페이스
  - `CollectorStrategy` (`source`, `isEnabled`, `fetch`)
  - `CollectorConfig` + `CollectorFactory` 기반 등록
- 기본값은 RSS 전략(`rssCollectorFactory`)으로 구성
- 신규 소스 추가 시 `buildCollectors([...])`에 설정 추가하거나 별도 전략 구현체 등록

## 7) MVP 완료 상태 (현재)

### 완료 항목
- cron 인증 강화 (`X-BRIGHTDESK-CRON-TOKEN`/Bearer)
- 중복 실행 차단(버킷/런 키)
- 수집 파이프라인 실데이터 연동 + 전략 패턴 정리
- 파이프라인 운영 지표(성공률, 큐 길이, 지연, 에스컬레이션)
- webhook 경고 분기(warning/critical)
- 실패 분류 및 사유 텍스트 수집

### 미완료 항목(출시 직전)
- 운영 론북 공유/운영자 훈련
- 비밀키 운영 SOP(교체·회수·권한)
- 실데이터 품질 샘플 점검(최근 24h raw_documents/kb_facts/cron_runs)
- 사용자 권한 경계 최종 확정

## 8) 운영 SLO(현재 반영)

- 24h 크론 성공률
  - 98% 이상: 정상 / 95~98 경고 / 95 미만 위험
- 큐 길이
  - 150 미만 정상 / 150~299 경고 / 300 이상 위험
- 연속 실패
  - `BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES` 기준
- 실행 지연
  - `cron_runs.finished_at - started_at` 기준 p95
  - 120~240초 경고 / 240초 초과 위험

## 9) 환경변수 정리 (요약)

- 실행/인증
  - `BRIGHTDESK_CRON_TOKEN`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- 수집
  - 위 4개 RSS URL + LIMIT
- 재시도
  - `BRIGHTDESK_CRON_RETRY_ATTEMPTS`, `BRIGHTDESK_CRON_RETRY_DELAY_MS`
  - `BRIGHTDESK_HOURLY_REBALANCE_RETRY_ATTEMPTS`, `BRIGHTDESK_HOURLY_REBALANCE_RETRY_DELAY_MS`
- 신호 가중치/알림
  - `BRIGHTDESK_SIGNAL_WEIGHTS_JSON` 또는 `BRIGHTDESK_WEIGHT_*`
  - `BRIGHTDESK_CRON_WEBHOOK_URL(S)`, warning/critical webhook env 일체
  - `BRIGHTDESK_CRON_ALERT_COOLDOWN_MINUTES`, `BRIGHTDESK_CRON_ALERT_ALLOW_IN_DEV`
- AI
  - `LOVABLE_API_KEY`

## 10) 로컬 실행 체크(체험 전)

1. `bun install`
2. `bun run dev`
3. `http://localhost:5173` 접속
4. `/pipeline`에서 상태 확인
5. 수동 수집/정제 1회
6. curl로 cron 호출 1회씩
   - `curl -X POST "$APP_URL/api/public/cron/collect" -H "x-brightdesk-cron-token:$BRIGHTDESK_CRON_TOKEN"`
   - `curl -X POST "$APP_URL/api/public/cron/hourly-rebalance" -H "x-brightdesk-cron-token:$BRIGHTDESK_CRON_TOKEN"`

## 11) 권장 Notion 페이지 구조(복붙용)

- Overview
- Architecture
- Data pipeline
- Cron & Operations
- API & Webhooks
- Data model & migrations
- Launch checklist
- Risks / TODO
- Runbook

