# BrightDesk Backend 운영 태스크 (Notion용)

- 문서 생성일: 2026-06-05
- 범위: 독립 웹앱 기준 BrightDesk 프로젝트의 백엔드 안정화
- 전제: Supabase + TanStack Start + TypeScript 기반 구조 유지(현재 스택)

## 1) 프로젝트 의도 한 줄

autonomous 투자 의사결정 보조 플랫폼(Track A: 자동 신호/리밸런싱, Track B: 사용자 포트폴리오 기반 권고)을 위한 데이터 수집·분석·시그널·포트폴리오 실행 파이프라인.

## 2) 현재 상태 요약

- 프론트엔드: 페이지는 정상 동작 흐름 완성 (`/`, `/portfolio`, `/my-portfolio`, `/signals`, `/facts`, `/pipeline`, `/insights` 등)
- 백엔드 로직: TanStack `createServerFn`으로 도메인 함수 묶음 구현
- 스토리지/DB: Supabase 테이블/스키마 마이그레이션이 존재, 일부 핵심 테이블은 공개 읽기 정책
- 남은 과제: 운영 품질/보안/실데이터 파이프라인 보강 필요

## 3) 우선순위(우선 구현 순서)

### P0 (운영 먼저)
1. [x] `cron` 엔드포인트 인증 강화
   - 대상: `/api/public/cron/collect`, `/api/public/cron/hourly-rebalance`
   - 요청 헤더 기반 비밀키 또는 서명 검증 추가
   - GET/POST 호출 모두 인증 요구(health 전용 필요 시 예외 분리)

2. [x] 멱등성/중복실행 방지
   - 수집·리밸런싱 크론 재실행 시 중복 반영/중복 체결 방지
   - 실행 로그/락 또는 실행 키 저장

3. [x] DB 스키마 정합성 점검
   - 핵심 테이블(`raw_documents`, `signals`, `transactions`, `positions`, `portfolio_snapshots`) 인덱스/제약 강화
   - 필수 유니크·체크 제약 점검

### P1 (핵심 기능 보강)
4. [x] 수집기 `mock` 제거 및 실소스 연동
   - `collectors.server.ts`의 broker_pdf/mijueun/snoomi/news 실제 수집 경로로 전환
   - 실소스 연동 방식: RSS/Atom 피드 기반(환경변수 설정 시 수집)
     - BRIGHTDESK_BROKER_PDF_RSS_URL
     - BRIGHTDESK_MIJUEUN_YT_RSS_URL
     - BRIGHTDESK_SNOOMI_RSS_URL
     - BRIGHTDESK_NEWS_RSS_URL
     - 각 항목별 LIMIT: `{ENV}_LIMIT` (ex: BRIGHTDESK_NEWS_RSS_URL_LIMIT)

5. [x] 정제 단계 품질 강화
   - KB fact 추출 스키마 유효성 검사 고도화
   - 실패 케이스 재시도 + 에러 로깅 개선

6. [x] 권고/시그널 계산 파라미터 설정화
   - 가중치 고정값에서 설정값/실험관리로 변경
   - 반영 env 키: `BRIGHTDESK_SIGNAL_WEIGHTS_JSON` 또는
     `BRIGHTDESK_WEIGHT_TECHNICAL`, `BRIGHTDESK_WEIGHT_FUNDAMENTAL`, `BRIGHTDESK_WEIGHT_KB`

7. [x] 수집 소스 확장성 강화
   - 수집기 전략 인터페이스(`CollectorStrategy`) 분리 및 소스 설정 기반 등록 구조 적용
   - `CollectorConfig` + `CollectorFactory`로 RSS 외 커스텀 전략 추가 경로 확보
   - 기본 수집기 등록은 `DEFAULT_COLLECTOR_CONFIGS`로 관리, `buildCollectors(...)`로 확장

### P2 (지속 운영)
8. [x] 사용자별 권한 분리(인증 상태 반영)  
   - `requireAuthenticatedUser` 기반 사용자 인증 유틸 도입
   - 사용자 포트폴리오 및 보유종목/추천 데이터 경로에 owner 기반 조회 적용
   - `/portfolio`, `/my-portfolio` 연동 함수에 사용자 스코프 강제
9. [x] 백테스트/시나리오 배치 비동기화 및 모니터링
   - 구현: `runScenarios`를 실행 트리거로 변경하고, `scenario_runs` 상태 테이블/조회 API 추가.
   - 구현 파일: `src/lib/scenarios.server.ts`, `src/lib/scenarios.functions.ts`, `src/routes/scenarios.tsx`, `supabase/migrations/20260605153000_brightdesk_scenario_runs.sql`
   - 사용자 체감: 실행 버튼 즉시 응답 + `/scenarios`에서 진행률/상태/오류 메시지 노출.
10. [x] 알림/대시보드 운영지표(크론 성공률, 누적 실패, 큐 길이)
   - 구현: `/pipeline` 상태 API에 24시간 크론 성공률, 누적 실패, 큐 길이를 추가하여 노출.
   - 구현 파일: `src/lib/pipeline.functions.ts`, `src/routes/pipeline.tsx`
11. [x] 네임스페이스별 크론 성능 분해 + 임계치 운영 알림
   - 구현: `/pipeline`에 `cron.collect`, `cron.hourly-rebalance`별 총/성공/실패/실행/성공률 카드, 그리고 실시간 경보 배너(실행 중/큐 과부하/저성공률/누적 실패)를 추가.
   - 구현 파일: `src/lib/pipeline.functions.ts`, `src/routes/pipeline.tsx`
12. [x] 경보 자동 발송 채널(Webhook) 연동
   - 구현 대상: 크론 종료 시 실패/임계치 경보를 webhook으로 전파.
   - 구현 파일: `src/lib/cron.server.ts`, `src/lib/cron-alert.server.ts`, `src/routes/api/public/cron/collect.ts`, `src/routes/api/public/cron/hourly-rebalance.ts`
13. [x] 소스 레지스트리/정제 메타 확장(확장성 강화)
   - `source_registry` 마이그레이션 추가로 소스 목록·출력 버전·신뢰도 정책을 운영 데이터로 관리.
   - `raw_documents`에 `source_profile_key`, `pipeline_version` 추가, `kb_facts`에 `pipeline_version` 추가로 소스별 원본→정제 추적 강화.
   - 정제는 `kb-facts-v1` 고정 응답 스키마로 일원화.

## 4) 1차 실행 중인 작업(현재 시작)

- [x] Notion용 작업 문서 생성
- [x] P0-1 `cron` API 보안 적용
- [x] P0-2 멱등성 처리(크론 실행 추적) 완료
- [x] P0-3 핵심 테이블 정합성 강화 완료
- [x] P2-1 사용자별 권한 분리(인증 상태 반영) 완료
- [x] P2-9 백테스트/시나리오 배치 비동기화 + 모니터링 시작/완료
- [x] P2-10 운영지표 대시보드(성공률/실패/큐 길이) 반영
- [x] P2-11 네임스페이스별 크론 분해 + 운영 알림 배너 반영
- [x] 시그널 피드백 오프라인 큐 저장 + 자동/수동 재동기화 반영

### 운영 진행 체크 (Todo 상태)
- [x] 백엔드 구조 파악/요약 문서 작성 완료
- [x] Supabase + TS 중심 스택 적합성 검토 완료 (기본 스택 확정)
- [x] 수집 크롤러 전략 인터페이스/팩토리 패턴 정합성 확인
- [x] 크론 운영지표(실시간/24h) API 확장 및 UI 노출 완료
- [x] 경보 임계치 기반 자동 액션(알림 채널 연동) 설계
- [x] 실패 크론 자동 재시도(단계별 정책) 도입: `cron.collect`, `cron.hourly-rebalance` preflight 단계
- [x] 실패 원인 분류(네트워크/파싱/LLM/DB/검증/로직) 및 알림 템플릿 반영
- [x] 연속 실패 에스컬레이션 규칙(임계치 기반 크리티컬 전환) 도입
- [x] 에스컬레이션 상태를 `/pipeline`에서 namespace 단위로 노출
- [x] 알림 채널 분기(critical/warning) 다중 webhook 설정 반영
- [x] 운영 지표 기반 SLO(성공률/지연시간) 임계치 문서화 및 런북 작성

### UX 안정성 보강(PO 관점)
- [x] 신호 페이지 사용자 언어 안내 배너(지연/재동기화)
- [x] 시그널 카드 내 근거/재생성/근거 상세 동선 정렬
- [x] 피드백 오프라인 큐 보존 및 재동기화 메시지 노출

### MVP 출시 전 마지막 점검 항목
- [x] `/pipeline` 네임스페이스별 24h p95/평균 실행시간 노출
- [x] p95 지연 경보(권고/크리티컬) 정책 반영
- [x] cron 보안 주석 및 문서 설명 최신화(인증 적용 내용 반영)
- [ ] `P0` 수동 실행 대응: `/pipeline` 수동 실행 결과를 운영 채널로 공유할 수 있게 문서화
- [ ] `P1` 운영 SOP: 프로덕션 비밀키(SUPABASE/SERVICE_ROLE/JWT/CRON/HOOK) 반영 체크리스트 배포
- [ ] `P1` 데이터 검수: 최근 24시간 `raw_documents`, `kb_facts`, `cron_runs` 샘플 20건 추출 후 품질 판정 완료

### MVP 완료 판정 기준(문서 최종 승인)
- [ ] 위 체크리스트 3개 모두 완료
- [ ] 로컬 실행 점검(1회) 완료 후 결과 스크린샷(또는 로그 캡처) 저장
- [ ] 운영 알림 채널 최소 1회 성공 전송 확인
- [ ] 수동 실행 2경로(`cron.collect`, `cron.hourly-rebalance`) 각각 1회 호출 성공

### MVP 출시 전 즉시 실행 체크리스트 (오늘 기준)
 - [ ] cron 토큰, webhook, Supabase 키, LLM 키 선행 검증
  - 실행 스니펫:
  - `CRON_SECRET`(또는 `BRIGHTDESK_CRON_TOKEN`) / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET`
  - `BRIGHTDESK_CRON_WEBHOOK_URL(S)` / `BRIGHTDESK_SLACK_WEBHOOK_URL` / `BRIGHTDESK_DISCORD_WEBHOOK_URL`
  - `AI_API_KEY`, `AI_MODEL`, `AI_GATEWAY_URL`
- [ ] 운영 전 수동 시나리오 1회 실행 및 로그 확인
  - `curl -X POST "$APP_URL/api/public/cron/collect" -H "x-cron-secret:$CRON_SECRET"`
  - `curl -X POST "$APP_URL/api/public/cron/hourly-rebalance" -H "x-cron-secret:$CRON_SECRET"`
- [ ] `/pipeline` 5분 오토리로드 확인(큐 길이/성공률/임계치 배너 정상 변화)
- [ ] 출시 전 샘플 감사 SQL 3종 실행 및 저장
  - `raw_documents` 수집/처리 상태 샘플 조회
  - `cron_runs` 실패 원인 TopN 조회
  - `kb_facts` 최신 fact 품질 수동 검토(중복/빈 요약/도메인 분포)

### 운영 SOP에 바로 붙일 체크 포인트
- 알림 수신 시 대응 시간 기준(15분 내): webhook 채널 확인 → `/pipeline` 최신 실패 상태 재현 → 소스 제외/재실행 판단.
- 비정상 알림 누적 시 조치 순서: `collect` → `hourly-rebalance` 순으로 1회씩 즉시 수동 재실행.
- 실패가 연속 3회 이상이면 배포 담당자에게 escalation(critical 템플릿) 발송 및 로그 샘플 5건 첨부.
- 신규 소스 추가 시 `SourceType` 확장 없이 동작하기 위해 `CollectorConfig` 등록만으로 추가 가능함을 운영팀 문서에 반영.

### 런칭 직전 운영 문서 보완 항목
- `CRON_SECRET`, `BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES`, `BRIGHTDESK_CRON_ALERT_COOLDOWN_MINUTES` 기본값 및 예외 기준 확정
- `CRON 실행 실패` 알림 메시지 3종 템플릿(Warning/Critical/복구) 준비
- `데이터 품질 실패` 정의(중복/빈본문/파싱오류/요약 누락)와 보수 정책 공유

### 환경변수(운영 알림)
- `CRON_SECRET`: `/api/public/cron/*` 호출 시 사용(권장). 인증 헤더: `X-CRON-SECRET` 또는 `X-BRIGHTDESK-CRON-TOKEN`, `Authorization: Bearer`
- `BRIGHTDESK_CRON_TOKEN`: 과거 호환 키 (`CRON_SECRET` 미설정 시 대체)
- `BRIGHTDESK_CRON_WEBHOOK_URL`: 알림 전송 webhook URL (설정 시에만 알림 전송)
- `BRIGHTDESK_CRON_WEBHOOK_URLS`: `,`로 구분한 다중 webhook URL 목록(동일 포맷 사용)
- `BRIGHTDESK_CRON_WARNING_WEBHOOK_URLS`: Warning 용 공통 webhook 목록
- `BRIGHTDESK_CRON_WARNING_SLACK_WEBHOOK_URL`: Warning 용 Slack webhook URL
- `BRIGHTDESK_CRON_WARNING_DISCORD_WEBHOOK_URL`: Warning 용 Discord webhook URL
- `BRIGHTDESK_CRON_CRITICAL_WEBHOOK_URLS`: Critical 용 공통 webhook 목록
- `BRIGHTDESK_CRON_CRITICAL_SLACK_WEBHOOK_URL`: Critical 용 Slack webhook URL
- `BRIGHTDESK_CRON_CRITICAL_DISCORD_WEBHOOK_URL`: Critical 용 Discord webhook URL
- `BRIGHTDESK_CRON_ALERT_COOLDOWN_MINUTES`: 알림 재발송 억제 시간(분), 기본 60
- `BRIGHTDESK_CRON_ALERT_ALLOW_IN_DEV`: `development`에서도 알림 강제 전송 시 `1`로 설정
- `BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES`: 경보 임계치 상승(크리티컬) 기준 연속 실패 횟수, 기본 3
- `BRIGHTDESK_CRON_RETRY_ATTEMPTS`: `cron.collect`/`cron.hourly-rebalance` 기본 재시도 횟수(기본 1회)
- `BRIGHTDESK_CRON_RETRY_DELAY_MS`: 재시도 간 기본 대기 시간(ms), 기본 10000
- `BRIGHTDESK_HOURLY_REBALANCE_RETRY_ATTEMPTS`: `cron.hourly-rebalance` preflight 단계 재시도 횟수(미설정 시 기본 값 상속)
- `BRIGHTDESK_HOURLY_REBALANCE_RETRY_DELAY_MS`: preflight 대기 시간(ms, 미설정 시 기본값 상속)
- `BRIGHTDESK_SLACK_WEBHOOK_URL`: Slack webhook URL(선택)
- `BRIGHTDESK_DISCORD_WEBHOOK_URL`: Discord webhook URL(선택)

### 로컬 미리보기 실행 체크(완료 후 사용자 우선 체험 전)
- 사전:
  - `APP_URL` (예: `http://localhost:5173`)
- 다음만 우선: `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`(혹은 `VITE_SUPABASE_PUBLISHABLE_KEY`), `AI_API_KEY`(요약 단계 검증시)
- 실행 순서:
  - `bun install`(또는 기존 패키지 매니저 기준 동일)
  - `bun run dev`
  - 앱 접속: `APP_URL`
- 파이프라인 sanity:
  - `/pipeline` 페이지 오픈 (성공률/큐/운영 배너 조회)
  - `collect` 수동 실행 버튼 1회
  - `refine` 수동 실행 버튼 1회
- cron sanity(서버 직접 호출):
- `curl -X POST "$APP_URL/api/public/cron/collect" -H "x-cron-secret:$CRON_SECRET"`
- `curl -X POST "$APP_URL/api/public/cron/hourly-rebalance" -H "x-cron-secret:$CRON_SECRET"`
- 이상징후 시 체크:
  - `pipeline`에서 연속 실패/오래 걸린 네임스페이스 노출 유무 확인
  - `cron_runs`, `raw_documents`, `kb_facts` 쿼리샘플로 원인 재현

## 2-1) 지금 실제 크롤링 대상(현재 코드 기준)
- 현재 수집은 RSS/Atom 피드 기반으로 동작합니다. 소스 URL은 코드에 하드코딩되지 않고 환경변수로만 주입됩니다.
- 동작 소스(CollectorConfig):
  - `BRIGHTDESK_BROKER_PDF_RSS_URL` (`broker_pdf`, source=broadcast-pdf)
  - `BRIGHTDESK_MIJUEUN_YT_RSS_URL` (`mijueun_youtube`, source=mijueun-youtube)
  - `BRIGHTDESK_SNOOMI_RSS_URL` (`snoomi_kakao`, source=snoomi-kakao)
  - `BRIGHTDESK_NEWS_RSS_URL` (`news`, source=external-news)
- 소스별 수집 개수 제한:
  - `BRIGHTDESK_BROKER_PDF_RSS_URL_LIMIT`
  - `BRIGHTDESK_MIJUEUN_YT_RSS_URL_LIMIT`
  - `BRIGHTDESK_SNOOMI_RSS_URL_LIMIT`
  - `BRIGHTDESK_NEWS_RSS_URL_LIMIT`
- env에 값이 없으면 해당 소스는 비활성(스킵)됩니다.

### 샘플 설정 형식
```bash
BRIGHTDESK_BROKER_PDF_RSS_URL=https://예시/finance/broker-pdf.xml
BRIGHTDESK_MIJUEUN_YT_RSS_URL=https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID
BRIGHTDESK_SNOOMI_RSS_URL=https://예시/social/snoomi.xml
BRIGHTDESK_NEWS_RSS_URL=https://예시/news/rss
```

## 7) 운영 SLO & 런북

### 7.1 SLO 정의(목표 기준)
- 크론 24시간 성공률
  - `>= 98%` → 정상
  - `95% ~ 98%` → 경고
  - `< 95%` → 크리티컬 후보(알림 강등/확대)
- 큐 길이
  - `< 150` → 정상
  - `150 ~ 299` → 경고
  - `>= 300` → 크리티컬
- 연속 실패 횟수(`BRIGHTDESK_CRON_ESCALATION_CONSECUTIVE_FAILURES`)
  - 기본값: `3`
  - 임계치 도달 시 알림 severity가 warning → critical로 업그레이드
- 크론 실행 지연(권장 도입, 1차 수동 확인)
  - `cron_runs.finished_at - started_at` 기준 p95 기준
  - 수집/정제 파이프라인은 `120초` 미만 목표
  - 초과 120~240초 경고, 240초 초과 크리티컬 조치 필요

### 7.2 런북(이상 징후 대응)

- 증상: 24시간 성공률 경고/크리티컬
  - 확인:
    - `/pipeline` 카드: 전체 24h 성공률, 네임스페이스 성공률 확인
    - `cron_runs` 최신 에러 메시지 확인
  - 1차 조치:
    - 해당 네임스페이스 재수동 실행 (`/pipeline` 수동 트리거)
    - 최근 3개 실패 원인(reason) 우선 점검

- 증상: 연속 실패 에스컬레이션
  - 확인:
    - `/pipeline`의 Escalation 배너(연속 실패 count/threshold)
    - 네임스페이스별 최근 `run_key`와 오류 로그 확인
  - 1차 조치:
    - 알림 채널 critical 로그 공유
    - 해당 네임스페이스 수동 중지/재시작 대상인지 운영 정책 검토
    - 데이터 소스(RSS/외부 API 키/요청량) 상태 검증

- 증상: 큐 길이 경고/크리티컬
  - 확인:
    - `raw_documents` 미처리 count 증가 추이
    - `runCollection` 단계에서 insert 누락/파싱 실패율 점검
  - 1차 조치:
    - `collect`/`refine` cron 수동 반복 실행 1~2회
    - 장애가 반복되면 실패 레코드의 `reason` 패턴으로 일시적 소스 제외

- 증상: 지연 시간 악화
  - 확인:
    - 최근 실행 duration 로그(수동 집계)
    - 외부 API 호출 지연 / DB 락 / 네트워크 지연 동시 존재 여부
  - 1차 조치:
    - 재시도 횟수/딜레이 일시 완화
    - 수집량 하향(필요시 소스 limit 조정)
    - 부하 높은 단계(Refiner/FX/시그널 생성) 분리 재실행 고려

### 7.3 운영 쿼리 샘플
```sql
-- 네임스페이스별 최근 24h 성공률
SELECT namespace,
       COUNT(*) FILTER (WHERE status='success')::float / NULLIF(COUNT(*),0) * 100 AS success_rate_24h,
       COUNT(*) FILTER (WHERE status='failed') AS failed_count,
       COUNT(*) AS total_count
FROM cron_runs
WHERE started_at >= NOW() - INTERVAL '24 hours'
GROUP BY namespace
ORDER BY namespace;

-- 네임스페이스별 연속 실패
WITH ranked AS (
  SELECT namespace, status, started_at,
         ROW_NUMBER() OVER (PARTITION BY namespace ORDER BY started_at DESC) AS rn
  FROM cron_runs
)
SELECT namespace,
       COALESCE(
         SUM(CASE WHEN status='failed' AND rn <= 10 THEN 1 ELSE 0 END) FILTER (WHERE rn <= 10),
         0
       ) AS recent_failures
FROM ranked
WHERE rn <= 10
GROUP BY namespace;

-- 최근 실행 지연(p95) 참고(수동 집계)
SELECT namespace,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (EXTRACT(EPOCH FROM (finished_at - started_at))::int)) AS p95_duration_sec,
       AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) AS avg_duration_sec
FROM cron_runs
WHERE started_at >= NOW() - INTERVAL '24 hours'
  AND finished_at IS NOT NULL
GROUP BY namespace;
```

### 적용 코드(우선 순위 작업)
- `cron` 경보/알림: `src/lib/cron.server.ts`, `src/lib/cron-alert.server.ts`, `src/routes/api/public/cron/collect.ts`, `src/routes/api/public/cron/hourly-rebalance.ts`

## 6) 백엔드 스택 검증(현재 코드 기준)

- 현재 운영 구조: TanStack Start(React Router + 서버 라우트), TypeScript, Supabase Client/DB, PostgreSQL, pg_cron 연동
- Python 고려 시 장점: 분석/ML 파이프라인, 벡터 분석, FastAPI 계열 배치 처리 생태계
- 현재 프로젝트 적합도:
  - 유지보수성: 동일 언어(TypeScript) + 같은 런타임으로 FE/BE 경량 통합이 유리
  - 운영성: Supabase RLS, auth, storage, schedule(job) 연동성이 높음
  - 구현 속도: 기존 코드 리스크를 낮춰 빠른 반영 가능
- 결론:
  - 1차는 `Supabase + TypeScript` 방식으로 고정이 합리적
  - Python은 별도 데이터 전처리/AI 모듈이 분리 필요할 때 **보조 서비스**로 검토

## 5) 참고 파일(핵심)
- 라우트: `/src/routes/api/public/cron/collect.ts`, `/src/routes/api/public/cron/hourly-rebalance.ts`
- 파이프라인: `/src/lib/collectors.server.ts`, `/src/lib/dashboard.functions.ts`
- 시그널/실행: `/src/lib/signals.server.ts`, `/src/lib/portfolio.server.ts`, `/src/lib/risk.server.ts`
- 스키마: `supabase/migrations/*`
