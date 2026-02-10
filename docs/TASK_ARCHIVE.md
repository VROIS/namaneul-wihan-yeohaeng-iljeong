# NUBI 완료 작업 아카이브

> **이 파일은 완료된 작업 이력 보관용입니다. 일상 작업 시 읽을 필요 없음.**
> **현재 작업 현황은 `docs/TASK.md` 참조**
> **AI 규칙은 `.cursor/rules/*.mdc` 참조**

---

## 완료된 핵심 구현 요약

### 아키텍처
- Pipeline V3 (2단계 병렬) 구현 — 4-Agent 순차에서 전환 (2026-02-09)
- Gemini 프롬프트 9개 입력 자연어 상세화
- itinerary-generator → Pipeline V3 위임 구조

### 교통비 시스템
- transport-pricing-service 전면 리팩토링 (OTA 방식 1인/일)
- 카테고리 A/B 분기 (가이드 vs 대중교통)
- 우버블랙 시간제 비교 (calculateUberBlackHourly)
- 가용시간 자동 계산, 지방이동 50% 할증

### 데이터 파이프라인
- place-seeder: Google Places 시딩 + 10개 크롤러 연쇄
- place-linker: placeName → placeId 퍼지 매칭
- score-aggregator: buzzScore/finalScore 집계
- nubiReason 생성 (generateNubiReason)

### 크롤러 시스템 (16개 스케줄 등록)
- YouTube, Instagram, Naver Blog, Tistory, TripAdvisor, Michelin
- Price, Korean Platform, Package Tour, Photospot, Weather, Crisis Alert
- Place Seed, Place Link, Score Aggregation, Exchange Rate

### 비용 보호
- Google Places API: 일 500건 (apiCallTracker)
- Google Routes API: 일 1,000건 (routeCallTracker)
- Gemini Google Search: 일 160건 (gemini-search-limiter)
- ag3-data-matcher 직접 호출 취약점 수정 (2026-02-10)

### 인프라
- Koyeb Docker 배포, Supabase PostgreSQL
- esbuild CJS 빌드, cursor-dev 브랜치
- 71개 도시, 1,669개 장소 DB 등록
- 관리자 대시보드 (50+ 버튼, 60+ API)

### 프론트엔드
- TripPlannerScreen (입력폼 + 결과 + 로딩)
- PlaceAutocomplete (Google Places 서버 프록시)
- 숙소 입력/변경 + Day별 재최적화
- AdminScreen (대시보드 iframe + 비밀번호)

---

## 일일 작업 기록

### 2026-02-10 (월)
| # | 작업 | 상태 |
|---|------|------|
| 1 | API 비용 보호 적용 (ag3 Places + route-optimizer Routes) | 완료 |
| 2 | .cursor/rules/ 문서 체계화 (9개 .mdc 파일) | 완료 |
| 3 | TASK.md 슬림화 + TASK_ARCHIVE.md 분리 | 완료 |

### 2026-02-09 (일)
| # | 작업 | 상태 |
|---|------|------|
| 1 | Pipeline V3 (2단계) 신규 구현 | 완료 |
| 2 | transport-pricing-service 전면 리팩토링 (OTA) | 완료 |
| 3 | 교통비 카테고리 A/B 분기 | 완료 |
| 4 | nubiReason 차별화 선정이유 구현 | 완료 |
| 5 | 우버블랙 시간제 비교 정밀화 | 완료 |
| 6 | place-linker + 10개 크롤러 연쇄 파이프라인 | 완료 |
| 7 | 파리 크롤링 실행 | 완료 |

### 2026-02-08 (토)
| # | 작업 | 상태 |
|---|------|------|
| 1 | 4+1 에이전트 파이프라인 (AG1~AG4) 구현 | 완료 |
| 2 | 에이전트 통신 규약 (AGENT_PROTOCOL.md) | 완료 |
| 3 | DB 스키마 확장 (nameEn/nameLocal/aliases) | 완료 |
| 4 | 71개 도시 등록 (프랑스28+유럽4 추가) | 완료 |
| 5 | place-seeder 최적화 (87% 비용 절감) | 완료 |
| 6 | 숙소 입력 UI + 동선 최적화 | 완료 |
| 7 | 성능 테스트: 40초→18초 (55% 단축) | 완료 |

### 2026-02-07 (금)
| # | 작업 | 상태 |
|---|------|------|
| 1 | 장소 시딩 시스템 (place-seeder) 신규 | 완료 |
| 2 | 프랑스 26개 관광도시 추가 | 완료 |
| 3 | 한국 플랫폼/패키지투어/포토스팟 크롤러 신규 | 완료 |
| 4 | 식당 선정 + 최종 정렬 + 바이브 가중치 매트릭스 | 완료 |

### 2026-02-06 (목)
| # | 작업 | 상태 |
|---|------|------|
| 1 | 관리자 대시보드 구축 (비밀번호, 모달, 버튼-API 연결) | 완료 |
| 2 | Gemini 3.0 모델 전체 통일 | 완료 |
| 3 | Replit/Neon 완전 제거 | 완료 |
| 4 | Instagram/YouTube 크롤러 근본 수정 | 완료 |
| 5 | TripAdvisor + 가격 일정표 통합 | 완료 |

### 2026-02-02 (일)
- Koyeb 배포 환경 구성, esbuild CJS 전환

### 2026-01-25~27 (Phase E 영상)
- Remotion + Seedance 영상 파이프라인, 캐릭터 10/14명 생성

### 2026-01-16
- 최초 하단 탭 구성, cursor-dev 브랜치 생성

---

## 참조 정보 (변경 불필요)

### 인원수 기준
| companionType | 인원수 | 차량 |
|---------------|--------|------|
| Single | 1명 | - |
| Couple | 2명 | - |
| Family | 4명 | 승용차 |
| ExtendedFamily | 8명 | 밴 |
| Group | 10명 | 미니버스 |

### 캐릭터 시스템
- 완료: M1,F1,M2,F2,M3,F3,M4,F5,M7,F7 (10/14명)
- 미생성: F4,M5,M6,F6

### 테스트 결과 (2026-02-09)
| 테스트 | 입력 | 결과 | 소요시간 |
|--------|------|------|----------|
| A (가이드) | 4인가족/Luxury/파리5일 | 30곳, €135/인/일 | 34초 |
| B (대중교통) | 2인커플/Reasonable/파리3일 | 16곳, €23/인/일 | 20초 |
