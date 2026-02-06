# NUBI 프로젝트 통합 태스크 관리

> **최종 업데이트: 2026-02-06 (목)**
> **관리 방식: 이 파일 하나로 모든 작업/계획/이력 통합 관리**
> **참조 문서: PRD.md, TRD.md, NUBI_WHITEPAPER.md (핵심 설계 - 수정 금지)**

---

## 1. 프로젝트 현황 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 프론트엔드 (React Native Expo) | 운영 중 | 웹/iOS/Android |
| 백엔드 (Express + TypeScript) | 운영 중 | Koyeb 배포 |
| 데이터베이스 (Supabase PostgreSQL) | 운영 중 | 39개 도시, 20개 장소 |
| 관리자 대시보드 | 운영 중 | 비밀번호 인증 + 모달 |
| 데이터 자동 수집 | 운영 중 | node-cron 스케줄러 |
| 배포 URL | 운영 중 | https://legal-dannye-dbstour-4e6b86d5.koyeb.app |
| GitHub | 운영 중 | cursor-dev 브랜치 |

---

## 2. 데이터 자동 수집 스케줄

| 수집 대상 | 주기 | 상태 | 비고 |
|-----------|------|------|------|
| 날씨 (OpenWeather) | 매 시간 | 자동 | 전체 도시 |
| 환율 | 하루 3번 | 자동 | KRW 기준 |
| 위기 정보 (파업/시위) | 30분마다 | 자동 | 서버 시작 1분 후 즉시 수집 |
| YouTube 채널 | 하루 2번 | 자동 | 18개 채널 |
| 네이버 블로그 | 하루 2번 | 자동 | 7개 소스 |
| 티스토리 블로그 | 하루 2번 | 자동 | |
| 인스타그램 | 하루 2번 | 자동 | 해시태그 수집 |
| 미쉐린 가이드 | 하루 1번 | 자동 | |
| TripAdvisor | 하루 1번 | 자동 | |
| 가격 정보 | 하루 2번 | 자동 | |

---

## 3. 일일 작업 기록

### 2026-02-06 (목) - 관제탑 구축 Day 2

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | Koyeb 배포 - admin 500 에러 수정 | 완료 | 배포 | `Dockerfile`, `server/admin-routes.ts` |
| 2 | esbuild 포맷 ESM→CJS 변경 (__dirname 지원) | 완료 | 빌드 | `package.json` |
| 3 | Dockerfile에 templates/data 파일 복사 추가 | 완료 | 배포 | `Dockerfile` |
| 4 | CORS에 Koyeb 도메인 + 프로덕션 허용 추가 | 완료 | 서버 | `server/index.ts` |
| 5 | 관리자 대시보드 비밀번호 인증 추가 | 완료 | 프론트 | `client/screens/AdminScreen.tsx` |
| 6 | 관리자 대시보드 X 닫기 버튼 (모달 방식) | 완료 | 프론트 | `AdminScreen.tsx`, `RootStackNavigator.tsx` |
| 7 | 설정 탭 → 모달로 전환 (tabPress 리스너) | 완료 | 네비게이션 | `MainTabNavigator.tsx` |
| 8 | 웹에서 iframe으로 대시보드 직접 표시 | 완료 | 프론트 | `AdminScreen.tsx` |
| 9 | TASK.md 통합 관리 문서로 리팩토링 | 완료 | 문서 | `docs/TASK.md` |
| 10 | 관리자 대시보드 JS 에러 수정 (event.target/null) | 완료 | 대시보드 | `admin-dashboard.html` |
| 11 | **전체 대시보드 버튼-API 연결 감사** | 완료 | 관제탑 | 50+버튼, 60+API 교차점검 |
| 12 | Instagram: topPosts → instagramPhotos 저장 로직 | 완료 | 크롤러 | `instagram-crawler.ts` |
| 13 | YouTube: API키 동적 로드 (getter) | 완료 | 크롤러 | `youtube-crawler.ts` |
| 14 | syncGooglePlaces 경로 불일치 수정 | 완료 | 대시보드 | `admin-dashboard.html` |
| 15 | Replit 의존성 제거 (4개 크롤러) | 완료 | 크롤러 | `weather/tripadvisor/price/michelin-crawler.ts` |
| 16 | Gemini AI 동적 초기화 (5개 서비스) | 완료 | 크롤러 | `youtube/vibe/taste-verifier.ts` |
| 17 | **Gemini 3.0 모델 전체 통일** | 완료 | AI | 전체 서비스 `gemini-3-flash-preview` |

### 2026-02-02 (일)

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | 로컬 서버 실행 환경 구성 | 완료 | 서버 | `.env` |
| 2 | test-video-ui.ts 한글 문법 오류 수정 | 완료 | 서버 | `server/test-video-ui.ts` |
| 3 | Expo 웹 빌드 (dist/ 생성) | 완료 | 빌드 | `dist/` |
| 4 | Koyeb 배포 (Dockerfile 작성) | 완료 | 배포 | `Dockerfile`, `.dockerignore` |
| 5 | round2 함수 export 수정 | 완료 | 서버 | `transport-pricing-service.ts` |
| 6 | package.json "type":"module" 제거 | 완료 | 빌드 | `package.json` |
| 7 | @google/generative-ai 패키지 추가 | 완료 | 의존성 | `package.json` |
| 8 | getApiUrl() 프로덕션 상대경로 수정 | 완료 | 프론트 | `client/lib/query-client.ts` |

### 2026-01-27 (월) - Phase E 영상

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | Test Video UI 버그 수정 | 완료 | 서버 | `server/test-video-ui.ts` |
| 2 | 여행 일정 rawData JSONB 파싱 로직 | 완료 | 서버 | `server/routes.ts` |
| 3 | 지브리 스타일 프롬프트 최적화 | 완료 | AI | - |
| 4 | mobilityStyle 중복 코드 수정 | 완료 | 프론트 | `TripPlannerScreen.tsx` |

### 2026-01-26 (일) - Phase E 영상

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | 일정 저장 버튼 UI | 완료 | 프론트 | `TripPlannerScreen.tsx` |
| 2 | 프로필 - 나의 여정/영상 섹션 | 완료 | 프론트 | `ProfileScreen.tsx` |
| 3 | 일정 상세 화면 (영상 생성/재생) | 완료 | 프론트 | `SavedTripDetailScreen.tsx` |
| 4 | 영상 60초 강제 설정 | 완료 | 서버 | `server/routes.ts` |
| 5 | 로그인 우회 (admin 계정) | 완료 | 서버 | `server/routes.ts` |
| 6 | Expo 패키지 설치 (expo-av 등) | 완료 | 의존성 | `package.json` |

### 2026-01-25 (토) - Phase E 영상

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | Remotion 패키지/설정 | 완료 | 환경 | `package.json`, `remotion.config.ts` |
| 2 | 캐릭터 10명 이미지 생성 (지블리) | 완료 | 에셋 | `public/characters/` |
| 3 | TravelScene.tsx (Ken Burns 효과) | 완료 | 프론트 | `src/remotion/TravelScene.tsx` |
| 4 | Seedance API 연동 | 완료 | 서버 | `seedance-video-generator.ts` |
| 5 | 영상 생성 API 엔드포인트 | 완료 | 서버 | `server/routes.ts` |

### 2026-01-16 (목)

| # | 작업 | 상태 | 카테고리 | 변경 파일 |
|---|------|------|----------|-----------|
| 1 | 하단 탭 5개 구성 | 완료 | 네비게이션 | `MainTabNavigator.tsx` |
| 2 | 지도 탭 토글 기능 | 완료 | 프론트 | `MapToggleContext.tsx` |
| 3 | 전문가 검증 CTA 하단탭 이동 | 완료 | 프론트 | `TripPlannerScreen.tsx` |
| 4 | 이동 거리/가격 백엔드 연결 | 완료 | 서버 | `itinerary-generator.ts` |
| 5 | cursor-dev 브랜치 생성 및 푸시 | 완료 | Git | - |

---

## 4. 미완료 / 진행 예정 작업

### 우선순위: 높음

| # | 작업 | 상태 | 카테고리 | 비고 |
|---|------|------|----------|------|
| 1 | 실제 사용자 테스트 (60초 영상 생성) | 대기 | 영상 | Seedance 모델 활성화 필요 |
| 2 | 여정 생성 + 예산 병렬 처리 | 미착수 | 성능 | Promise.all 적용 |
| 3 | 요약 섹션 예상 비용 표시 | 미착수 | 프론트 | "힐링과 미식 여행 · 예상 €1,250" |
| 4 | 교통비 로직 수정 (가이드 비용 비교) | 미착수 | 서버 | 마케팅 포인트 |
| 5 | 식사 슬롯 필수 포함 | 미착수 | AI | 점심/저녁 무조건 포함 |
| 6 | 위기 경보 깜박이는 경고 | 미착수 | 프론트 | 상단 경고 아이콘 |

### 우선순위: 중간

| # | 작업 | 상태 | 카테고리 | 비고 |
|---|------|------|----------|------|
| 7 | 감성 데이터 표시 (AI 추천 대체) | 미착수 | 프론트 | 백종원 언급/네이버 인기/인스타 핫플 |
| 8 | 썸네일 이미지 필수 표시 | 미착수 | 프론트 | Google Places/Instagram |
| 9 | NUBI 추천 점수 (별표+소숫점) | 미착수 | 프론트 | NUBI 4.7 스타일 |
| 10 | 날씨/위기 경보 일정표 상단 표시 | 미착수 | 프론트 | OpenWeather 연동 |
| 11 | 나머지 캐릭터 4명 생성 (M5,M6,F4,F6) | 미착수 | 에셋 | 14명 중 10명 완료 |

### 우선순위: 낮음

| # | 작업 | 상태 | 카테고리 | 비고 |
|---|------|------|----------|------|
| 12 | 전문가 검증 마크 | 미착수 | 프론트 | 인증마크 UI |
| 13 | 저장 버튼 최종 구현 | 미착수 | 프론트 | 프로필에 저장 |
| 14 | 다중 씬 합성 (Remotion) | 미착수 | 영상 | 8클립 x 8초 합성 |
| 15 | TTS 음성 연동 | 미착수 | 영상 | 캐릭터 대사 |
| 16 | React Native 영상 재생 연동 | 미착수 | 프론트 | expo-video |

---

## 5. 캐릭터 시스템 현황

| ID | 연령대 | 성별 | 상태 | 파일명 |
|----|--------|------|------|--------|
| M1 | 5-9세 | 남 | 완료 | `char_m1_boy_child_*.png` |
| F1 | 5-9세 | 여 | 완료 | `char_f1_girl_child_*.png` |
| M2 | 13-17세 | 남 | 완료 | `char_m2_teen_boy_*.png` |
| F2 | 13-17세 | 여 | 완료 | `char_f2_teen_girl_*.png` |
| M3 | 20대 | 남 | 완료 | `char_m3_20s_male_*.png` |
| F3 | 20대 | 여 | 완료 | `char_f3_20s_female_*.png` |
| M4 | 30대 | 남 | 완료 | `char_m4_stylish_30s_*.png` |
| F4 | 40대 | 여 | 미생성 | - |
| M5 | 40대 | 남 | 미생성 | - |
| F5 | 50대 | 여 | 완료 | `char_f5_elegant_40s_*.png` |
| M6 | 50대 | 남 | 미생성 | - |
| F6 | 50대 | 여 | 미생성 | - |
| M7 | 60대+ | 남 | 완료 | `char_m7_distinguished_60s_*.png` |
| F7 | 60대+ | 여 | 완료 | `char_f7_graceful_60s_*.png` |

> 총 생성: 10/14명 (71%)

---

## 6. 인원수 기준 확정

| companionType | 인원수 | 차량 |
|---------------|--------|------|
| Single | 1명 | - |
| Couple | 2명 | - |
| Family | 4명 | 승용차 |
| ExtendedFamily | 8명 | 밴 |
| Group | 10명 | 미니버스 |

---

## 7. API 키 관리 현황

| API 키 | 저장 위치 | 상태 |
|--------|-----------|------|
| GEMINI_API_KEY | Supabase DB (api_keys 테이블) | 활성 |
| GOOGLE_MAPS_API_KEY | Supabase DB | 활성 |
| OPENWEATHER_API_KEY | Supabase DB | 활성 |
| SEEDANCE_API_KEY | Supabase DB | 등록됨 |
| DATABASE_URL | Koyeb 환경변수 | 활성 |

> API 키는 관리자 대시보드에서 추가/수정/테스트 가능

---

## 8. 기술 스택 요약

| 구분 | 기술 | 용도 |
|------|------|------|
| 프론트엔드 | React Native (Expo) | 모바일/웹 앱 |
| 백엔드 | Express + TypeScript | API 서버 |
| 데이터베이스 | PostgreSQL (Supabase) | 데이터 저장 |
| ORM | Drizzle ORM | DB 쿼리 |
| AI | Gemini 3.0 Flash (gemini-3-flash-preview) | 일정 생성/분석 |
| 영상 | Seedance 1.5 Pro + Remotion | 감동 영상 |
| 빌드 | esbuild (CJS) | 서버 번들링 |
| 배포 | Koyeb (Docker) | 무료 호스팅 |
| 버전관리 | GitHub | cursor-dev 브랜치 |

---

## 9. 핵심 알고리즘 (참조용 - 상세는 NUBI_WHITEPAPER.md)

```
Final Score = (Vibe + Buzz + Taste) - Reality Penalty

Vibe Score (0-10)  : Gemini Vision 분석 (사진 구도, 색감, 감성)
Buzz Score (0-10)  : 다중 소스 인기도 (Google, TripAdvisor, 리뷰 수)
Taste Score (0-10) : 오리지널 맛 검증 (본고장 언어 리뷰 기반)
Reality Penalty (0-5) : 날씨, 안전, 혼잡도 패널티
```

---

## 10. 참조 문서 안내

| 문서 | 내용 | 수정 가능 |
|------|------|-----------|
| `docs/PRD.md` | 제품 요구사항 정의서 | 아니오 (고정) |
| `docs/TRD.md` | 기술 요구사항 정의서 | 아니오 (고정) |
| `docs/NUBI_WHITEPAPER.md` | 핵심 알고리즘 백서 | 아니오 (고정) |
| `docs/PHASE_E_ARCHITECTURE.md` | 영상 아키텍처 설계 | 아니오 (참조) |
| `docs/PHASE_E_VIDEO_MAPPING.md` | 영상 프롬프트 매핑 | 아니오 (참조) |
| `docs/PHASE_E_TASK.md` | Phase E 작업 기록 | 아니오 (이관 완료) |
| `docs/PHASE_E_WORKLOG.md` | Phase E 구현 기록 | 아니오 (이관 완료) |

---

## 변경 이력

| 날짜 | 변경 내용 | 작업자 |
|------|-----------|--------|
| 2026-02-06 | TASK.md 통합 관리 문서로 리팩토링 | Cursor AI |
| 2026-01-27 | Phase E 영상 디버깅 기록 | Cursor AI |
| 2026-01-26 | Phase E 일정 저장/영상 생성 | Cursor AI |
| 2026-01-25 | Phase E 캐릭터/Remotion 생성 | Cursor AI |
| 2026-01-16 | 최초 작성 (탭 구성/지도 토글) | Cursor AI |
