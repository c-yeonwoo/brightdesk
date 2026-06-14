# BrightDesk Auto-Crawl Source Candidates

MVP 원칙: 먼저 원천성이 높고 구조가 안정적인 공식 소스를 수집하고, 해설성 뉴스는 보조 근거로만 사용한다.

## P0. MVP 필수

| 영역 | 소스 | 용도 | 권장 방식 | 신뢰도 |
| --- | --- | --- | --- | --- |
| 미국 통화정책 | Federal Reserve RSS | FOMC, 금리, 연준 발언, 정책 뉴스 | RSS | 0.9 |
| 미국 거시지표 | FRED / St. Louis Fed | 금리, CPI, 실업률, 장단기금리, 달러 유동성 | API/RSS | 0.9 |
| 미국 기업공시 | SEC RSS / EDGAR | 10-K, 10-Q, 8-K, insider, 주요 공시 | RSS/API | 0.9 |
| 에너지 | EIA RSS | 유가, 원유재고, 천연가스, 에너지 섹터 | RSS | 0.85 |
| 사용자 입력 | Web URL / PDF / Text / Image | 리포트, 블로그, 뉴스, 투자 메모 | 수동 업로드 | 사용자 설정 |

## P1. 빠르게 추가할 만한 소스

| 영역 | 소스 | 용도 | 권장 방식 | 신뢰도 |
| --- | --- | --- | --- | --- |
| 국내 통화정책 | 한국은행 | 금통위, 기준금리, 경제전망 | RSS/API/페이지 수집 | 0.9 |
| 국내 공시 | DART | 한국 기업 공시, 실적, 주요사항보고 | API | 0.9 |
| 한국 거래소 | KRX | 지수, 업종, 거래대금, 시장 통계 | API/파일 | 0.85 |
| 미국 재무부 | U.S. Treasury | 금리, 채권, 환율보고서, 제재/정책 | RSS/API | 0.85 |
| 경제 캘린더 | Nasdaq / Investing calendar | CPI, PPI, 고용, FOMC 일정 보강 | API/페이지 | 0.65 |

## P2. 보조 뉴스/해설

| 영역 | 소스 | 용도 | 권장 방식 | 신뢰도 |
| --- | --- | --- | --- | --- |
| 글로벌 뉴스 | Reuters / AP / CNBC / MarketWatch | 이벤트 탐지, 헤드라인 변화 | RSS/API | 0.6-0.75 |
| 산업 뉴스 | Semiconductor, AI, Energy 전문 매체 | 섹터 모멘텀 | RSS | 0.55-0.7 |
| 투자자 레터 | Berkshire, ARK, 주요 운용사 | 레퍼런스 포트폴리오/관점 | RSS/페이지 | 0.65-0.8 |
| 소셜/영상 | YouTube RSS, X, 블로그 | 관점 보조, 노이즈 탐지 | RSS/API | 0.35-0.6 |

## 추천 환경변수 초안

```bash
BRIGHTDESK_FED_RSS_URL=https://www.federalreserve.gov/feeds/press_all.xml
BRIGHTDESK_SEC_RSS_URL=https://www.sec.gov/news/pressreleases.rss
BRIGHTDESK_EIA_RSS_URL=https://www.eia.gov/tools/rssfeeds/
BRIGHTDESK_NEWS_RSS_URL=
BRIGHTDESK_BROKER_PDF_RSS_URL=
```

## 구현 우선순위

1. Fed RSS, SEC RSS, EIA RSS를 `CollectorConfig`로 추가한다.
2. FRED와 DART는 RSS보다 API connector로 별도 strategy를 만든다.
3. 모든 소스는 `source`, `external_id`, `source_url`, `published_at`, `reliability`를 반드시 남긴다.
4. LLM 정제 결과는 출처와 무관하게 공통 KB fact 스키마로 저장한다.
5. 뉴스/블로그/영상은 투자 판단의 단독 근거로 쓰지 않고 공식 데이터와 교차검증한다.

## 참고

- Federal Reserve RSS feeds: https://www.federalreserve.gov/feeds/
- SEC RSS feeds: https://www.sec.gov/about/rss-feeds
- SEC structured disclosure RSS: https://www.sec.gov/data-research/structured-data/structured-disclosure-rss-feeds
- EIA RSS feeds: https://www.eia.gov/tools/rssfeeds/
- EIA Weekly Petroleum Status Report: https://www.eia.gov/petroleum/supply/weekly/
- FRED: https://fred.stlouisfed.org/
