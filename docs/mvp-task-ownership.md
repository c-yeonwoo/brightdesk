# BrightDesk MVP Task Ownership

## 내가 할 작업

- [x] 자체 로그인 후 `user_profiles` 서버 동기화
- [x] 관심종목 `user_watchlist` 추가
- [x] 관심종목 기반 ticker research collector 추가
- [x] ticker research cron 단계 연결
- [x] FRED 공식 거시지표 API collector 추가
- [x] source registry migration 추가
- [x] 환경변수 예시 업데이트
- [x] DART 공시 API connector 추가
- [ ] KRX/한국 시장 데이터 connector 추가: 공식/안정 API 또는 배치 파일 경로 확정 후 진행
- [x] 관심종목별 KB/인사이트 화면 강화
- [ ] admin source 설정 화면 추가
- [ ] Notion 통합 문서 최신화

## 사용자가 할 작업

- [ ] Vercel 환경변수 설정
- [ ] Supabase SQL Editor에서 새 migration 적용
- [ ] FRED API key 발급 및 `FRED_API_KEY` 등록
- [ ] DART API key 발급 여부 결정
- [ ] 운영 cron scheduler 선택 및 secret header 설정
- [ ] 첫 테스트용 관심종목/포트폴리오 입력
- [ ] 추천 결과가 실제 의사결정 UX에 충분한지 제품 관점 피드백

## 우선순위

1. Vercel env와 Supabase migration을 맞춘다.
2. `/my-portfolio`에서 관심종목을 추가한다.
3. `/api/public/cron/collect`를 수동 실행한다.
4. `ticker_research`와 `fred_api` 문서가 KB로 정제되는지 확인한다.
5. DART/KRX를 추가해 한국 주식 커버리지를 넓힌다.
