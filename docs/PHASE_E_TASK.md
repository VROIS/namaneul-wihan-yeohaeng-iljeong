# 📋 Phase E - 감동 영상 기능 개발 태스크

> **최종 업데이트: 2026-01-26 (일) 10:15**

---

# 📅 2026-01-26 (일) 작업 기록

## ✅ 완료된 작업

| # | 작업 | 상태 | 파일 | 비고 |
|---|------|------|------|------|
| 1 | **일정 저장 버튼 UI 구현** | ✅ | `client/screens/TripPlannerScreen.tsx` | 오른쪽 상단 헤더에 저장 아이콘 추가 |
| 2 | **프로필 화면 - 나의 여정 섹션** | ✅ | `client/screens/ProfileScreen.tsx` | 저장된 일정 목록 표시 |
| 3 | **프로필 화면 - 나의 영상 섹션** | ✅ | `client/screens/ProfileScreen.tsx` | 완료된 영상 목록 표시 |
| 4 | **일정 상세 화면 구현** | ✅ | `client/screens/SavedTripDetailScreen.tsx` | 영상 생성/재생/저장 기능 포함 |
| 5 | **영상 60초 강제 설정** | ✅ | `server/routes.ts` | Seedance duration=60 |
| 6 | **로그인 우회 (admin 사용자)** | ✅ | `server/routes.ts`, `TripPlannerScreen.tsx` | 테스트용 admin 계정 자동 생성 |
| 7 | **travelStyle enum 오류 수정** | ✅ | `TripPlannerScreen.tsx` | "Reasonable" → "comfort" (소문자) |
| 8 | **Expo 패키지 설치** | ✅ | `package.json` | expo-av, expo-file-system, expo-media-library, expo-sharing |
| 9 | **Expo 웹 빌드** | ✅ | `dist/` | npx expo export --platform web |
| 10 | **서버 재시작 및 배포** | ✅ | `http://localhost:8082` | 정적 파일 서빙 확인 |

---

# 📅 2026-01-25 (토) 작업 기록

## ✅ 완료된 작업

| # | 작업 | 상태 | 파일 |
|---|------|------|------|
| 1 | Remotion Skills 설치 | ✅ | `.agent/skills/` |
| 2 | Remotion 패키지 설치 | ✅ | `package.json` |
| 3 | 캐릭터 10명 이미지 생성 (지블리 스타일) | ✅ | `public/characters/` |
| 4 | TravelScene.tsx 컴포넌트 생성 | ✅ | `src/remotion/TravelScene.tsx` |
| 5 | Root.tsx 컴포지션 설정 | ✅ | `src/remotion/Root.tsx` |
| 6 | Ken Burns 효과 구현 | ✅ | `TravelScene.tsx` |
| 7 | 캐릭터 호흡 애니메이션 | ✅ | `TravelScene.tsx` |
| 8 | 대사 표시 기능 (2초 후 페이드인) | ✅ | `TravelScene.tsx` |
| 9 | 화면 비율 9:16 (모바일) 변경 | ✅ | `Root.tsx` |
| 10 | Remotion Studio 실행 테스트 | ✅ | `http://localhost:3001` |
| 11 | **Seedance API 연동 및 테스트** | ✅ | `server/services/seedance-video-generator.ts` |
| 12 | **API 엔드포인트 구현** | ✅ | `server/routes.ts` (`/api/itineraries/:id/video/*`) |

---

## 📌 다음 단계 (우선순위)

### Phase 1: UX 테스트 및 검증 (현재)
- [x] 일정 저장 기능 프론트엔드 연동
- [x] 영상 생성 UI 구현
- [x] 영상 재생 및 다운로드 기능
- [ ] **실제 사용자 테스트 (60초 영상 생성)**
- [ ] Seedance 모델 활성화 대기 (ModelNotOpen 상태)

### Phase 2: 다중 씬 합성 (Remotion)
- [ ] Seedance 개별 클립 (8개 x 8초) 생성
- [ ] Remotion으로 60초 단일 영상 합성
- [ ] 자막 및 트랜지션 효과

### Phase 3: 프로덕션 배포
- [ ] 환경 변수 분리 (개발/운영)
- [ ] 에러 핸들링 강화
- [ ] 로깅 시스템 구축

---

## 🎯 핵심 원칙

> **일정표(itinerary) = 영상의 뼈대**

| travelPace | 하루 장소 수 | 클립 수 | 클립당 시간 | 영상 길이 |
|------------|-------------|--------|------------|----------|
| Packed | 8곳 | 8 | ~7.5초 | 1분 |
| Normal | 6곳 | 6 | ~10초 | 1분 |
| Relaxed | 4곳 | 4 | ~15초 | 1분 |

---

## 🗂️ 주요 변경 파일

### Frontend (React Native)
```
client/
├── screens/
│   ├── TripPlannerScreen.tsx      # 저장 버튼 추가 (헤더 우측)
│   ├── ProfileScreen.tsx          # 나의 여정 + 나의 영상 섹션
│   └── SavedTripDetailScreen.tsx  # 영상 생성/재생/저장 화면 (신규)
├── navigation/
│   └── RootStackNavigator.tsx     # SavedTripDetail 라우트 추가
└── types/
    └── trip.ts                    # VideoStatus 타입 추가
```

### Backend (Express + TypeScript)
```
server/
├── routes.ts                      # 일정 저장/영상 생성 API
├── services/
│   ├── seedance-video-generator.ts  # Seedance API 래퍼
│   ├── scene-prompt-generator.ts    # Gemini 프롬프트 생성
│   └── video-pipeline.ts            # 영상 생성 파이프라인
└── storage.ts                     # 일정 저장/조회 로직
```

### Database Schema
```sql
-- itineraries 테이블 추가 컬럼
ALTER TABLE itineraries ADD COLUMN video_status TEXT;
ALTER TABLE itineraries ADD COLUMN video_url TEXT;
ALTER TABLE itineraries ADD COLUMN video_task_id TEXT;
ALTER TABLE itineraries ADD COLUMN user_birth_date TEXT;
ALTER TABLE itineraries ADD COLUMN user_gender TEXT;

-- users 테이블 추가 컬럼
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN preferred_vibes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN marketing_consent BOOLEAN DEFAULT false;
```

---

## 🚀 실행 방법

### 1. 서버 시작
```bash
npm run server:dev
```

### 2. Expo 웹 빌드 (코드 변경 시)
```bash
npx expo export --platform web
npm run server:dev  # 재시작
```

### 3. 브라우저 테스트
```
http://localhost:8082
```

---

## 📊 캐릭터 시스템 현황

| ID | 연령대 | 성별 | 상태 | 파일명 |
|----|--------|------|------|--------|
| M1 | 5-9세 | 남 | ✅ | `char_m1_boy_child_*.png` |
| F1 | 5-9세 | 여 | ✅ | `char_f1_girl_child_*.png` |
| M2 | 13-17세 | 남 | ✅ | `char_m2_teen_boy_*.png` |
| F2 | 13-17세 | 여 | ✅ | `char_f2_teen_girl_*.png` |
| M3 | 20대 | 남 | ✅ | `char_m3_20s_male_*.png` |
| F3 | 20대 | 여 | ✅ | `char_f3_20s_female_*.png` |
| M4 | 30대 | 남 | ✅ | `char_m4_stylish_30s_*.png` |
| F4 | 40대 | 여 | ⬜ | 미생성 |
| M5 | 40대 | 남 | ⬜ | 미생성 |
| F5 | 50대 | 여 | ✅ | `char_f5_elegant_40s_*.png` |
| M6 | 50대 | 남 | ⬜ | 미생성 |
| F6 | 50대 | 여 | ⬜ | 미생성 |
| M7 | 60대+ | 남 | ✅ | `char_m7_distinguished_60s_*.png` |
| F7 | 60대+ | 여 | ✅ | `char_f7_graceful_60s_*.png` |

**총 생성: 10/14명 (71%)**
