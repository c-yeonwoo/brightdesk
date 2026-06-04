## 전체 구조 (7단계 순차 진행)

KB(지식베이스)는 이미 1차 완성 — 이제 그 위에 가격 데이터·시그널·시뮬레이션·최적화·포트폴리오 대시보드를 쌓습니다.

---

### Phase 1. 데이터 수집 파이프라인 (스켈레톤)
- 4개 소스 어댑터 인터페이스(`Collector`) 정의 — broker_pdf / mijueun_youtube / snoomi_kakao / news
- 각 어댑터는 mock fetcher로 시작 → `raw_documents` insert
- `/api/public/cron/collect` 엔드포인트 (서명 검증) — pg_cron이 시간당 호출
- 어드민 UI에 "Run collector now" 버튼

### Phase 2. KB 정제 (LLM 추출)
- `raw_documents.processed_at IS NULL` 큐를 Lovable AI Gateway(google/gemini-2.5-flash)로 처리
- 출력 스키마: `{domain, fact_key, title, summary, related_tickers, sentiment, reliability}`
- `kb_facts` upsert(`fact_key` unique), `source_doc_ids` 누적
- 처리 결과 Facts 페이지에 실시간 반영

### Phase 3. 가격 데이터 & 기술 지표
- `prices` 테이블 (ticker, date, ohlcv) + `indicators` 테이블 (rsi14, macd, ma20/60/120)
- 무료 소스(Yahoo/Naver) 어댑터 — 일봉 우선
- 지표 계산은 순수 TS로 (`src/lib/indicators.ts`)
- Tickers 페이지에 차트 + 지표 표시

### Phase 4. 시그널 엔진 (룰 기반)
- `signals` 테이블 (ticker, ts, kind: BUY/SELL/HOLD, score, reasons[])
- 룰 예: RSI<30 + KB sentiment>0.5 + 관련 fact 3건 이상 → BUY score
- 결정론적·재현 가능 (백테스트용)
- Signals 페이지 신설

### Phase 5. 1000만원 모의 포트폴리오
- `portfolios / positions / transactions` 테이블
- 체결가(다음날 시가) + 수수료 0.015% + 거래세 0.18% 모델
- 시그널 → 가상 매매 자동 적용
- Portfolio 페이지: 보유, 손익, 거래내역

### Phase 6. 시나리오 백테스트 & 최적화
- `scenarios` 테이블 (params jsonb: 배분%, 손절·익절, 소스가중치)
- 10개 시나리오 grid 생성 → 과거 6개월 백테스트
- 스코어: Sharpe / 누적수익 / MDD
- Scenarios 페이지: 비교 테이블 + 최적 선택

### Phase 7. 최종 포트폴리오 배치 & 가이드 + 서비스 정비 ✅
- 최적 시나리오 → 실제 배분안 생성 (`/actions`)
- Dashboard에 "오늘의 액션" 진입 버튼
- **서비스 네이밍 변경**: KB Monitor → **Sentinel** (Signal · Portfolio · Knowledge)
- **네비게이션 재구성**: 분석(대시보드/액션/시그널/포트폴리오/시나리오/종목) · 지식베이스(Facts/원본) · 운영(파이프라인) 3그룹

---

## 기술 결정

- **오케스트레이션**: Supabase pg_cron + `/api/public/cron/*` 엔드포인트 (호스팅 비용 0, Prefect는 외부 인프라 필요해서 보류)
- **LLM**: Lovable AI Gateway (`google/gemini-2.5-flash` 기본, 정제는 `gemini-2.5-pro`)
- **크롤러**: 1차는 mock + RSS/정적 HTML만. Playwright(카카오), PDF 파싱은 외부 워커가 필요해서 별도 단계
- **DB**: 전부 Lovable Cloud (이미 구성됨)

## 진행 방식

각 Phase 끝나면 동작 확인 후 다음으로. 한 메시지에 Phase 1+2 정도씩 묶어서 진행하고, Phase 3부터는 단계별로.

승인하시면 **Phase 1 (수집 파이프라인 스켈레톤 + cron 엔드포인트)** 부터 시작합니다.
