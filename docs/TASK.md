# 📋 개발 태스크 (TASK.md)

## 현재 상태

- **백엔드:** 완료 (데이터 파이프라인, API 엔드포인트, 일정 생성)
- **프론트엔드:** 기본 UI 완료 (4탭 네비게이션, 일정 생성 폼)
- **일정 생성:** ✅ 완료 (다국가/장기 여행 지원, 도시별 그룹핑)

---

## 📅 완료 작업 로그

### 2026-01-06 (월) 02:30 KST

#### ✅ 완료된 작업
| 작업 | 상태 | 설명 |
|------|------|------|
| 경로 최적화 알고리즘 | ✅ | 지리적 그룹핑 + Nearest-neighbor로 도시별 연속 일정 배치 |
| 장기 여행 일정 생성 | ✅ | 10일, 11일, 30일 등 장기 여행 완전 지원 |
| 장소 부족 문제 해결 | ✅ | Gemini 장소 생성 재시도 메커니즘 추가 |
| 날짜 계산 버그 수정 | ✅ | calculateDayCount 함수 디버깅 로그 추가 |
| Day 탭 UI 개선 | ✅ | 각 일차에 도시명 표시 (Day 1 파리) |
| Place/DayPlan 타입 확장 | ✅ | city, region 필드 추가 |

#### 🔍 디버깅 로그 추가
- `[Itinerary] Date inputs` - 받은 날짜 확인
- `[Itinerary] Required places` - 필요 장소 수
- `[Itinerary] Total places` - 생성된 총 장소 수
- `[Itinerary] Schedule entries` - 스케줄 엔트리 수
- `[TripPlanner] API response days count` - 프론트 응답 확인

---

### 🎯 다음 작업 (2026-01-07 예정)

| 우선순위 | 태스크 | 예상 시간 | 설명 |
|----------|--------|----------|------|
| 1 | VibeBadge 컴포넌트 구현 | 30분 | 8+: 보라, 5-7: 주황, <5: 회색 점수 배지 |
| 2 | 장소 카드에 Vibe Score 표시 | 1시간 | 결과 화면 장소별 점수 표시 |
| 3 | 점수 상세 뷰 구현 | 1시간 | Vibe/Buzz/Taste 개별 점수 팝업 |
| 4 | 홈 화면 Vibe 입력 | 2시간 | 사용자 분위기 입력 받기 |

**목표:** 1.2 Vibe Score 표시 완료 (Phase 1 MVP)

---

## Phase 1: MVP 핵심 기능 (현재)

### 1.1 사용자 입력 시스템 ⬜ 미완료

| 태스크 | 상태 | 설명 |
|--------|------|------|
| 온보딩 플로우 설계 | ⬜ | 프로필 → 그룹 → 취향 → 일정 |
| 프로필 입력 화면 | ⬜ | 나이대, 성별, 여행스타일 |
| 그룹 선택 화면 | ⬜ | 혼자/커플/가족/단체 |
| 취향 선택 화면 | ⬜ | 음식/액티비티/분위기/페이스 |
| 일정 입력 화면 | ⬜ | 목적지, 날짜, 예산 |

---

## 📍 1.1.1 목적지 입력 시스템 상세 계획

### 🎯 목표
사용자가 **다양한 방식**으로 여행 목적지를 입력할 수 있어야 함.
- 도시명을 아는 경우: 직접 입력
- 도시명을 모르는 경우: 지도에서 선택
- 국가 일주 / 다국가 투어: AI가 최적 경로 제안

---

### 📋 목적지 유형

| 유형 | 예시 | 처리 방식 |
|------|------|----------|
| **단일 도시** | 파리 5일 | 기존 방식 (해당 도시 내 장소 추천) |
| **국가 일주** | 이탈리아 일주 7일 | AI가 최적 도시 선정 (로마→피렌체→베니스) |
| **다국가 투어** | 이탈리아, 스위스, 프랑스 10일 | AI가 국가별 핵심 도시 + 이동 경로 최적화 |
| **지역 투어** | 남프랑스 5일 | AI가 지역 내 핵심 도시 선정 (니스→칸→마르세유) |

---

### 🗺️ 경로 빌더 UX (Google Maps 스타일)

#### UI 레이아웃
```
┌─────────────────────────────────────────────────────┐
│  🗺️ 여행 경로 설정                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🟢 출발지: [인천공항 ▼]  (디폴트: 사용자 위치)       │
│      │                                              │
│      ├──────────────────────────────────────────    │
│      │                                              │
│  📍 경유 1: [로마, 이탈리아    ] [✕] [≡ 드래그]      │
│      │      2일 체류                                │
│      ├──────────────────────────────────────────    │
│      │                                              │
│  📍 경유 2: [피렌체, 이탈리아  ] [✕] [≡ 드래그]      │
│      │      1일 체류                                │
│      ├──────────────────────────────────────────    │
│      │                                              │
│  📍 경유 3: [베니스, 이탈리아  ] [✕] [≡ 드래그]      │
│      │      2일 체류                                │
│      ├──────────────────────────────────────────    │
│      │                                              │
│  [+ 경유지 추가]                                     │
│      │                                              │
│      ├──────────────────────────────────────────    │
│      │                                              │
│  🔴 도착지: [○ 출발지와 동일 (왕복)]                 │
│             [○ 다른 곳 (편도): _________ ]          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  입력 방식:                                          │
│  [🔤 직접 입력]  [🗺️ 지도에서 선택]  [🤖 AI 추천]    │
└─────────────────────────────────────────────────────┘
```

#### 인터랙티브 지도 선택 모드
```
┌─────────────────────────────────────────────────────┐
│  🗺️ 지도에서 경유지 선택                             │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐│
│  │                                                 ││
│  │         [인터랙티브 Google Map]                 ││
│  │                                                 ││
│  │    📍 탭하여 경유지 추가                        ││
│  │    🔢 탭한 순서대로 경로 생성                   ││
│  │    ↔️ 줌/패닝으로 원하는 지역 탐색              ││
│  │                                                 ││
│  │    [1]로마  ─── [2]피렌체 ─── [3]베니스        ││
│  │                                                 ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  선택된 경유지: [로마 ✕] [피렌체 ✕] [베니스 ✕]      │
│                                                     │
│  [경로 확정]                      [초기화]          │
└─────────────────────────────────────────────────────┘
```

#### AI 추천 모드 (처음 가는 여행지)
```
┌─────────────────────────────────────────────────────┐
│  🤖 AI에게 여행지 추천받기                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  어떤 여행을 원하세요?                               │
│  ┌─────────────────────────────────────────────────┐│
│  │ 이탈리아 미식 여행 7일                           ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  AI 추천 경로:                                       │
│  ┌─────────────────────────────────────────────────┐│
│  │ 🇮🇹 이탈리아 미식 투어 (7일)                     ││
│  │                                                 ││
│  │ Day 1-2: 로마 (카르보나라의 본고장)              ││
│  │ Day 3-4: 피렌체 (티본 스테이크)                  ││
│  │ Day 5-6: 볼로냐 (볼로네제 파스타)                ││
│  │ Day 7: 밀라노 (리조또)                           ││
│  │                                                 ││
│  │ [이 경로로 시작]  [다시 추천받기]                ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### 💱 환율 시스템

#### 요구사항
- **디폴트 통화**: 한국 원화 (KRW)
- **실시간 환율**: 모든 통화 지원 (150+ 통화)
- **사용자 설정**: 선호 통화 선택 가능
- **일별 합계**: 원화 + 선택 통화 동시 표시

#### 지원 통화 (주요)
| 코드 | 통화 | 기호 |
|------|------|------|
| KRW | 한국 원 (디폴트) | ₩ |
| USD | 미국 달러 | $ |
| EUR | 유로 | € |
| JPY | 일본 엔 | ¥ |
| GBP | 영국 파운드 | £ |
| CNY | 중국 위안 | ¥ |
| THB | 태국 바트 | ฿ |
| VND | 베트남 동 | ₫ |

#### 환율 표시 UI
```
┌────────────────────────────────────────────┐
│ 📅 Day 1 예산 합계                          │
├────────────────────────────────────────────┤
│ 🎫 콜로세움 입장료          €16.00         │
│ 🍝 점심 - 카르보나라        €15.00         │
│ 🚕 택시 이동               €12.00         │
│ 🍷 저녁 - 트라토리아        €45.00         │
├────────────────────────────────────────────┤
│ 💶 Day 1 합계: €88.00                      │
│ 💴 원화 환산: ₩128,480                     │
│ 💹 환율: 1 EUR = ₩1,460 (01/05 10:30 기준) │
│    [🔄 환율 새로고침]                       │
└────────────────────────────────────────────┘
```

#### 프로필 통화 설정
```
┌────────────────────────────────────────────┐
│ ⚙️ 통화 설정                                │
├────────────────────────────────────────────┤
│ 기본 통화: [한국 원 (KRW) ▼]                │
│ 보조 통화: [미국 달러 (USD) ▼]              │
│                                            │
│ ☑️ 현지 통화로 가격 표시                    │
│ ☑️ 원화 환산 항상 표시                      │
│ ☐ 보조 통화도 함께 표시                    │
└────────────────────────────────────────────┘
```

#### 환율 API 연동
```
[Exchange Rate API]
    │
    ├── GET /latest?base=KRW
    │   → 모든 통화 대비 원화 환율
    │
    ├── 캐싱: 1시간 (실시간 반영)
    │
    └── Fallback: 마지막 저장된 환율 사용
```

---

### 🗄️ 추가 DB 스키마

```sql
-- 사용자 통화 설정 테이블
CREATE TABLE user_currency_settings (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  primary_currency VARCHAR(10) DEFAULT 'KRW',
  secondary_currency VARCHAR(10) DEFAULT 'USD',
  show_local_currency BOOLEAN DEFAULT TRUE,
  show_primary_always BOOLEAN DEFAULT TRUE,
  show_secondary BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 환율 캐시 테이블
CREATE TABLE exchange_rates (
  id SERIAL PRIMARY KEY,
  base_currency VARCHAR(10) DEFAULT 'KRW',
  target_currency VARCHAR(10) NOT NULL,
  rate DECIMAL(15,6) NOT NULL,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- 여행 경로 테이블
CREATE TABLE trip_routes (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50),
  trip_name VARCHAR(200),
  departure_location VARCHAR(200),
  return_to_departure BOOLEAN DEFAULT TRUE,
  arrival_location VARCHAR(200),
  total_days INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 경유지 테이블
CREATE TABLE trip_waypoints (
  id SERIAL PRIMARY KEY,
  route_id INTEGER REFERENCES trip_routes(id),
  order_index INTEGER NOT NULL,
  city_name VARCHAR(200) NOT NULL,
  country_name VARCHAR(200),
  country_code VARCHAR(10),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  stay_days INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### ✅ 구현 순서 (1.1 사용자 입력 시스템)

| 단계 | 태스크 | 예상 시간 | 의존성 |
|------|--------|----------|--------|
| 1 | 경로 빌더 UI 컴포넌트 | 2시간 | 없음 |
| 2 | 인터랙티브 지도 경유지 선택 연동 | 1시간 | Step 1, 기존 InteractiveMap |
| 3 | 목적지 유형 선택 (도시/국가/다국가) | 1시간 | Step 1 |
| 4 | AI 경로 추천 서비스 | 2시간 | Gemini 연동 |
| 5 | 환율 API 연동 (Exchange Rate API) | 1시간 | API 키 |
| 6 | 통화 설정 UI (프로필) | 30분 | Step 5 |
| 7 | 일별 합계 환율 적용 | 1시간 | Step 5, 6 |
| 8 | DB 스키마 추가 (경로, 경유지, 환율) | 30분 | 없음 |

**총 예상 시간: 약 9시간**

---

### 1.2 Vibe Score 표시 ⬜ 미완료

| 태스크 | 상태 | 설명 |
|--------|------|------|
| 장소 카드에 Vibe 배지 | ⬜ | 8+: 보라, 5-7: 주황, <5: 회색 |
| 점수 상세 뷰 | ⬜ | Vibe/Buzz/Taste 개별 점수 표시 |
| 홈 화면 Vibe 입력 | ⬜ | 오늘의 기분 선택 → AI 추천 |

---

## ⭐ 1.2.1 Vibe Score 표시 상세 계획

### 🎯 목표
VibeTrip의 핵심 점수 시스템을 사용자에게 **직관적**으로 표시.
단순 숫자가 아닌, 감성적이고 시각적인 표현으로 차별화.

---

### 📊 점수 체계 정리

| 점수 유형 | 범위 | 설명 | 가중치 |
|----------|------|------|--------|
| **Vibe Score** | 0-10 | Gemini Vision 분석 (사진 분위기, 조명, 구도) | 40% |
| **Buzz Score** | 0-10 | 인기도 (Google + TripAdvisor + 블로그 언급) | 30% |
| **Taste Score** | 0-10 | 맛 검증 (원어민 리뷰 비율, 미슐랭) | 30% |
| **Reality Penalty** | 0-5 | 현실 감점 (날씨, 혼잡도, 파업) | 차감 |

**최종 점수 = (Vibe × 0.4 + Buzz × 0.3 + Taste × 0.3) - Reality Penalty**

---

### 🎨 Vibe 배지 디자인

#### 색상 레벨
| 점수 범위 | 레벨 | 색상 | 배지 |
|----------|------|------|------|
| 8.0 - 10.0 | Excellent | 보라 (#8B5CF6) | ⭐ Vibe 8.5 |
| 5.0 - 7.9 | Good | 주황 (#F97316) | ⭐ Vibe 6.2 |
| 0.0 - 4.9 | Average | 회색 (#6B7280) | ⭐ Vibe 3.8 |

#### 배지 UI 컴포넌트
```
┌─────────────────────────────────────────┐
│  Excellent (8+)                         │
│  ┌─────────────────┐                    │
│  │ ⭐ Vibe 8.5     │  ← 보라색 배경     │
│  └─────────────────┘                    │
│                                         │
│  Good (5-7.9)                           │
│  ┌─────────────────┐                    │
│  │ ⭐ Vibe 6.2     │  ← 주황색 배경     │
│  └─────────────────┘                    │
│                                         │
│  Average (<5)                           │
│  ┌─────────────────┐                    │
│  │ ⭐ Vibe 3.8     │  ← 회색 배경       │
│  └─────────────────┘                    │
└─────────────────────────────────────────┘
```

---

### 📋 점수 상세 뷰 UI

#### 장소 카드 클릭 시 상세 점수 표시
```
┌────────────────────────────────────────────────────┐
│ 🍜 광장시장 육회골목                                 │
├────────────────────────────────────────────────────┤
│                                                    │
│  📊 점수 상세                                       │
│  ┌────────────────────────────────────────────────┐│
│  │                                                ││
│  │  ⭐ 최종 Vibe Score: 8.5                       ││
│  │  ════════════════════════════════════════      ││
│  │                                                ││
│  │  🎨 Vibe (분위기)     ████████░░ 8.2           ││
│  │     → "따뜻한 조명, 활기찬 시장 분위기"          ││
│  │                                                ││
│  │  🔥 Buzz (인기도)     █████████░ 9.0           ││
│  │     → Google 4.5 / TripAdvisor 4.7 / 블로그 152 ││
│  │                                                ││
│  │  👅 Taste (맛)        ████████░░ 8.3           ││
│  │     → 한국어 리뷰 85% / 미슐랭 빕구르망          ││
│  │                                                ││
│  │  ⚠️ Reality Penalty   -0.5                     ││
│  │     → 주말 혼잡 예상                            ││
│  │                                                ││
│  └────────────────────────────────────────────────┘│
│                                                    │
│  📺 유튜버 Pick                                     │
│  ┌────────────────────────────────────────────────┐│
│  │ 성시경 - "인생 국물" (12:30)                    ││
│  │ 백종원 - "육회 맛집 인정" (8:45)                 ││
│  └────────────────────────────────────────────────┘│
│                                                    │
└────────────────────────────────────────────────────┘
```

---

### 🌈 홈 화면 Vibe 입력 (오늘의 기분)

#### UI 레이아웃
```
┌────────────────────────────────────────────────────┐
│                                                    │
│  오늘 어떤 분위기가 끌리세요?                        │
│                                                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 🌅     │ │ 🍷     │ │ 🎉     │ │ 🧘     │      │
│  │ 로맨틱 │ │ 럭셔리 │ │ 활기찬 │ │ 힐링   │      │
│  └────────┘ └────────┘ └────────┘ └────────┘      │
│                                                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 🏛️     │ │ 🍜     │ │ 📸     │ │ 🌿     │      │
│  │ 역사적 │ │ 로컬   │ │ 인스타 │ │ 자연   │      │
│  └────────┘ └────────┘ └────────┘ └────────┘      │
│                                                    │
│  선택된 Vibe: [로맨틱] [럭셔리]                     │
│                                                    │
│  [✨ AI 추천 받기]                                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

#### Vibe 카테고리 정의
| Vibe | 코드 | AI 프롬프트 키워드 |
|------|------|-------------------|
| 🌅 로맨틱 | romantic | 야경, 분위기, 커플, 조용한 |
| 🍷 럭셔리 | luxury | 미슐랭, 프리미엄, 서비스, 예약 |
| 🎉 활기찬 | lively | 시장, 술집, 클럽, 축제 |
| 🧘 힐링 | relaxing | 스파, 공원, 카페, 느긋한 |
| 🏛️ 역사적 | historic | 박물관, 유적, 건축, 문화 |
| 🍜 로컬 | local | 현지인, 숨은, 골목, 맛집 |
| 📸 인스타 | instagrammable | 포토, 뷰, 예쁜, 핫플 |
| 🌿 자연 | nature | 트레킹, 바다, 산, 공원 |

#### Vibe → 장소 추천 로직
```typescript
// server/services/vibe-recommender.ts
export async function getVibeRecommendations(
  cityId: number,
  vibes: string[], // ['romantic', 'luxury']
  persona: 'luxury' | 'comfort'
): Promise<Place[]> {
  // 1. Vibe 가중치 계산
  const vibeWeights = calculateVibeWeights(vibes);
  
  // 2. 장소별 Vibe 매칭 점수 계산
  const places = await db.query.places.findMany({
    where: eq(places.cityId, cityId)
  });
  
  // 3. AI 분석으로 장소-Vibe 매칭
  const scored = await Promise.all(
    places.map(async (place) => {
      const vibeMatch = await analyzeVibeMatch(place, vibes);
      return { place, vibeMatch };
    })
  );
  
  // 4. 상위 N개 반환
  return scored
    .sort((a, b) => b.vibeMatch - a.vibeMatch)
    .slice(0, 10)
    .map(s => s.place);
}
```

---

### ✅ 구현 순서 (1.2 Vibe Score 표시)

| 단계 | 태스크 | 예상 시간 | 의존성 |
|------|--------|----------|--------|
| 1 | VibeBadge 컴포넌트 | 30분 | 없음 |
| 2 | 장소 카드에 배지 적용 | 30분 | Step 1 |
| 3 | 점수 상세 뷰 컴포넌트 | 1시간 | Step 1 |
| 4 | 점수 상세 모달/시트 | 30분 | Step 3 |
| 5 | Vibe 선택 UI (홈 화면) | 1시간 | 없음 |
| 6 | Vibe → 추천 API 연동 | 1시간 | Step 5 |
| 7 | 프로그레스 바 애니메이션 | 30분 | Step 3 |

**총 예상 시간: 약 5시간**

---

### 1.3 성능 최적화 ⬜ 미완료

| 태스크 | 상태 | 설명 |
|--------|------|------|
| React.memo 적용 | ⬜ | 불필요한 리렌더링 방지 |
| useMemo/useCallback | ⬜ | 계산 최적화 |
| 이미지 최적화 | ⬜ | expo-image 캐싱 활용 |

---

## ⚡ 1.3.1 성능 최적화 상세 계획

### 🎯 목표
- 앱 로딩 시간 50% 단축
- 스크롤 60fps 유지
- 메모리 사용량 최소화
- 배터리 소모 감소

---

### 📊 현재 성능 이슈 분석

| 이슈 | 원인 | 영향 | 우선순위 |
|------|------|------|----------|
| 느린 초기 로딩 | 모든 데이터 한번에 fetch | UX 저하 | 🔴 높음 |
| 스크롤 버벅임 | 불필요한 리렌더링 | 60fps 미달 | 🔴 높음 |
| 이미지 지연 | 캐싱 미적용 | 시각적 지연 | 🟡 중간 |
| 메모리 누수 | 이벤트 리스너 미정리 | 앱 크래시 | 🟡 중간 |

---

### 🔧 최적화 전략

#### 1. React.memo 적용
```typescript
// 최적화 전
export function PlaceCard({ place }: Props) {
  return <View>...</View>;
}

// 최적화 후
export const PlaceCard = React.memo(function PlaceCard({ place }: Props) {
  return <View>...</View>;
}, (prevProps, nextProps) => {
  return prevProps.place.id === nextProps.place.id &&
         prevProps.place.vibeScore === nextProps.place.vibeScore;
});
```

**적용 대상 컴포넌트:**
- `PlaceCard` - 장소 카드
- `DayCard` - 일정 카드
- `VibeBadge` - 점수 배지
- `MapMarker` - 지도 마커
- `ItineraryItem` - 일정 항목

#### 2. useMemo/useCallback 최적화
```typescript
// 최적화 전
const sortedPlaces = places.sort((a, b) => b.vibeScore - a.vibeScore);

// 최적화 후
const sortedPlaces = useMemo(() => 
  places.sort((a, b) => b.vibeScore - a.vibeScore),
  [places]
);

// 콜백 최적화
const handlePlacePress = useCallback((place: Place) => {
  navigation.navigate('PlaceDetail', { placeId: place.id });
}, [navigation]);
```

**적용 대상:**
- 장소 정렬/필터링 로직
- 점수 계산 로직
- 이벤트 핸들러
- 스타일 계산

#### 3. 이미지 최적화 (expo-image)
```typescript
import { Image } from 'expo-image';

// 최적화된 이미지 컴포넌트
<Image
  source={{ uri: place.photoUrl }}
  style={styles.image}
  contentFit="cover"
  placeholder={blurhash}
  transition={200}
  cachePolicy="memory-disk"
/>
```

**expo-image 장점:**
- 자동 캐싱 (메모리 + 디스크)
- 블러해시 플레이스홀더
- 부드러운 전환 애니메이션
- WebP/AVIF 자동 최적화

#### 4. FlatList 최적화
```typescript
<FlatList
  data={places}
  renderItem={renderPlaceCard}
  keyExtractor={(item) => item.id.toString()}
  // 성능 최적화 옵션
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
  initialNumToRender={10}
  getItemLayout={(data, index) => ({
    length: CARD_HEIGHT,
    offset: CARD_HEIGHT * index,
    index,
  })}
/>
```

#### 5. 데이터 페이지네이션
```typescript
// API 페이지네이션
GET /api/places?cityId=1&page=1&limit=20

// React Query 무한 스크롤
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['places', cityId],
  queryFn: ({ pageParam = 1 }) => 
    fetchPlaces(cityId, pageParam),
  getNextPageParam: (lastPage) => lastPage.nextPage,
});
```

#### 6. 번들 사이즈 최적화
```javascript
// 동적 임포트
const MapView = React.lazy(() => import('./MapView'));

// 조건부 로딩
{showMap && (
  <Suspense fallback={<MapSkeleton />}>
    <MapView />
  </Suspense>
)}
```

---

### 📱 성능 모니터링

#### 개발 중 모니터링
```typescript
// React DevTools Profiler 사용
// 렌더링 시간, 리렌더링 원인 분석

// Flipper 연동 (네이티브 디버깅)
// 네트워크, 레이아웃, 성능 분석
```

#### 성능 목표
| 지표 | 현재 | 목표 |
|------|------|------|
| 초기 로딩 | ~3초 | <1.5초 |
| 스크롤 FPS | 45-50 | 60 |
| 메모리 사용 | ~200MB | <150MB |
| 이미지 로딩 | ~500ms | <100ms (캐시) |

---

### ✅ 구현 순서 (1.3 성능 최적화)

| 단계 | 태스크 | 예상 시간 | 의존성 |
|------|--------|----------|--------|
| 1 | 주요 컴포넌트 React.memo 적용 | 1시간 | 없음 |
| 2 | useMemo/useCallback 리팩토링 | 1시간 | 없음 |
| 3 | expo-image 마이그레이션 | 30분 | 없음 |
| 4 | FlatList 최적화 옵션 적용 | 30분 | 없음 |
| 5 | API 페이지네이션 구현 | 1시간 | 백엔드 |
| 6 | 번들 사이즈 분석 및 최적화 | 30분 | Step 1-5 |
| 7 | 성능 테스트 및 검증 | 30분 | Step 1-6 |

**총 예상 시간: 약 5시간**

---

### 1.4 데이터 연동 ⬜ 미완료

| 태스크 | 상태 | 설명 |
|--------|------|------|
| Google Maps API 키 설정 | ⬜ | 실제 장소 데이터 연동 |
| OpenWeather API 키 설정 | ⬜ | 날씨 데이터 연동 |
| 샘플 데이터 → 실제 데이터 | ⬜ | API 연동 완료 후 전환 |

---

## 🔗 1.4.0 데이터 연동 상세 계획

### 🎯 목표
모든 외부 API를 안전하게 연동하고, 샘플 데이터에서 실제 데이터로 전환.
API 키 관리, 에러 처리, 폴백 로직을 체계적으로 구현.

---

### 🔑 필요한 API 키 목록

| API | 환경변수 | 용도 | 무료 한도 | 상태 |
|-----|----------|------|----------|------|
| **Google Maps** | `GOOGLE_MAPS_API_KEY` | 장소, 사진, 경로 | $200/월 크레딧 | ⬜ 필요 |
| **OpenWeather** | `OPENWEATHER_API_KEY` | 날씨 현재/예보 | 1,000 콜/일 | ⬜ 필요 |
| **YouTube Data** | `YOUTUBE_DATA_API_KEY` | 영상, 자막 수집 | 10,000 쿼터/일 | ⬜ 필요 |
| **Exchange Rate** | `EXCHANGE_RATE_API_KEY` | 실시간 환율 | 1,500 콜/월 | ⬜ 필요 |
| **Gemini AI** | `AI_INTEGRATIONS_GEMINI_API_KEY` | AI 분석 | 연동됨 | ✅ 완료 |

---

### 🗺️ Google Maps API 연동

#### 필요한 API 서비스
| 서비스 | 용도 | 예상 호출/일 |
|--------|------|-------------|
| Places API (New) | 장소 검색, 상세정보 | ~500 |
| Places Photos | 장소 사진 | ~1,000 |
| Geocoding API | 주소 ↔ 좌표 변환 | ~100 |
| Routes API | 경로 계산, 거리/시간 | ~200 |
| Maps JavaScript API | 인터랙티브 지도 | 무제한 (클라이언트) |

#### 서버 구현 예시
```typescript
// server/services/google-places.ts
import { Client } from '@googlemaps/google-maps-services-js';

const client = new Client({});

export async function searchPlaces(query: string, location: { lat: number; lng: number }) {
  try {
    const response = await client.textSearch({
      params: {
        query,
        location,
        radius: 5000,
        key: process.env.GOOGLE_MAPS_API_KEY!,
      },
    });
    return response.data.results;
  } catch (error) {
    console.error('Google Places API error:', error);
    // Gemini 폴백
    return await searchPlacesWithGemini(query, location);
  }
}
```

#### 보안 설정 (Google Cloud Console)
1. API 키 제한 (Application restrictions)
   - HTTP referrers: `*.replit.app`, `localhost:*`
   - IP addresses: 서버 IP 화이트리스트
2. API 제한 (API restrictions)
   - Places API, Geocoding API, Routes API만 허용
3. 할당량 설정
   - 일일 한도 설정으로 과금 방지

---

### 🌤️ OpenWeather API 연동

#### 사용할 API 엔드포인트
| 엔드포인트 | 용도 | 업데이트 주기 |
|-----------|------|--------------|
| `/weather` | 현재 날씨 | 실시간 |
| `/forecast` | 5일 예보 (3시간 단위) | 3시간 |
| `/onecall` | 7일 예보 + 시간별 | 1시간 |

#### 서버 구현 예시
```typescript
// server/services/weather.ts
export async function getWeather(lat: number, lon: number) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  
  // 캐시 확인 (1시간)
  const cached = await getCachedWeather(lat, lon);
  if (cached && !isExpired(cached, 3600)) {
    return cached;
  }
  
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
    );
    const data = await response.json();
    
    // 캐시 저장
    await cacheWeather(lat, lon, data);
    
    return {
      current: {
        temp: data.current.temp,
        feelsLike: data.current.feels_like,
        description: data.current.weather[0].description,
        icon: data.current.weather[0].icon,
      },
      daily: data.daily.map(d => ({
        date: new Date(d.dt * 1000),
        tempMin: d.temp.min,
        tempMax: d.temp.max,
        description: d.weather[0].description,
        icon: d.weather[0].icon,
        pop: d.pop, // 강수 확률
      })),
      alerts: data.alerts || [],
    };
  } catch (error) {
    console.error('OpenWeather API error:', error);
    return null;
  }
}
```

#### Reality Penalty 계산
```typescript
export function calculateWeatherPenalty(weather: Weather): number {
  let penalty = 0;
  
  // 기온 페널티
  if (weather.temp < 0 || weather.temp > 35) penalty += 1.0;
  else if (weather.temp < 5 || weather.temp > 30) penalty += 0.5;
  
  // 강수 페널티
  if (weather.pop > 0.7) penalty += 1.0;  // 70% 이상
  else if (weather.pop > 0.4) penalty += 0.5;
  
  // 기상 경보 페널티
  if (weather.alerts?.length > 0) {
    const severe = weather.alerts.some(a => 
      a.event.includes('경보') || a.event.includes('warning')
    );
    penalty += severe ? 1.5 : 0.5;
  }
  
  return Math.min(penalty, 3.0); // 최대 3점 감점
}
```

---

### 📺 YouTube Data API 연동

#### 쿼터 관리 (10,000/일)
| 작업 | 쿼터 비용 | 예상 사용 |
|------|----------|----------|
| search.list | 100 | ~50회/일 |
| videos.list | 1 | ~500회/일 |
| captions.list | 50 | ~100회/일 |
| captions.download | 200 | ~20회/일 |

#### 채널별 영상 수집
```typescript
// server/services/youtube-collector.ts
export async function collectChannelVideos(channelId: string, maxResults: number = 10) {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  
  // 1. 채널의 최신 영상 검색
  const searchResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&channelId=${channelId}&order=date&maxResults=${maxResults}&type=video&key=${apiKey}`
  );
  const searchData = await searchResponse.json();
  
  // 2. 영상 상세 정보 가져오기
  const videoIds = searchData.items.map(item => item.id.videoId).join(',');
  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?` +
    `part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`
  );
  const videosData = await videosResponse.json();
  
  // 3. 자막 추출 (Gemini로 분석)
  for (const video of videosData.items) {
    const transcript = await extractTranscript(video.id);
    const places = await extractPlacesFromTranscript(transcript, video.snippet.title);
    await saveVideoPlaceMentions(video, places);
  }
  
  return videosData.items;
}
```

---

### 💱 Exchange Rate API 연동

#### 무료 API 옵션
| 서비스 | 무료 한도 | 업데이트 주기 |
|--------|----------|--------------|
| exchangerate-api.com | 1,500 콜/월 | 매일 |
| openexchangerates.org | 1,000 콜/월 | 매일 |
| fixer.io | 100 콜/월 | 매일 |

#### 서버 구현
```typescript
// server/services/exchange-rate.ts
const CACHE_DURATION = 3600 * 1000; // 1시간
let rateCache: { rates: Record<string, number>; timestamp: number } | null = null;

export async function getExchangeRates(base: string = 'KRW'): Promise<Record<string, number>> {
  // 캐시 확인
  if (rateCache && Date.now() - rateCache.timestamp < CACHE_DURATION) {
    return rateCache.rates;
  }
  
  try {
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/latest/${base}`
    );
    const data = await response.json();
    
    rateCache = {
      rates: data.conversion_rates,
      timestamp: Date.now(),
    };
    
    // DB에도 저장 (폴백용)
    await saveRatesToDB(data.conversion_rates);
    
    return data.conversion_rates;
  } catch (error) {
    console.error('Exchange Rate API error:', error);
    // DB에서 마지막 환율 가져오기
    return await getLastRatesFromDB();
  }
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) return amount;
  
  // KRW 기준이면 직접 변환
  if (fromCurrency === 'KRW') {
    return amount / rates[toCurrency];
  }
  if (toCurrency === 'KRW') {
    return amount * rates[fromCurrency];
  }
  
  // 다른 통화 간 변환 (KRW 경유)
  const krwAmount = amount * rates[fromCurrency];
  return krwAmount / rates[toCurrency];
}
```

---

### 🔄 샘플 데이터 → 실제 데이터 전환

#### 전환 체크리스트
| 화면 | 현재 | 전환 후 | 상태 |
|------|------|---------|------|
| 홈 (Discover) | 하드코딩 도시 | DB + API | ⬜ |
| 지도 (Map) | 샘플 마커 | Google Places | ⬜ |
| 일정 (Plan) | Gemini 생성 | Google + Gemini | ⬜ |
| 프로필 (Profile) | Mock 데이터 | 로컬 스토리지 | ⬜ |

#### 폴백 전략
```
[API 호출]
    │
    ├── 성공 → 데이터 반환 + 캐시 저장
    │
    └── 실패
         │
         ├── 캐시 있음 → 캐시 데이터 반환
         │
         └── 캐시 없음
              │
              ├── Gemini 폴백 가능 → Gemini로 생성
              │
              └── 최종 실패 → 에러 메시지 표시
```

---

### ✅ 구현 순서 (1.4 데이터 연동)

| 단계 | 태스크 | 예상 시간 | 의존성 |
|------|--------|----------|--------|
| 1 | API 키 환경변수 설정 | 30분 | API 키 발급 |
| 2 | Google Places 서비스 완성 | 1시간 | Step 1 |
| 3 | OpenWeather 서비스 완성 | 30분 | Step 1 |
| 4 | Exchange Rate 서비스 구현 | 30분 | Step 1 |
| 5 | 캐싱 레이어 구현 | 1시간 | Step 2-4 |
| 6 | 폴백 로직 구현 | 30분 | Step 2-5 |
| 7 | 홈 화면 실제 데이터 연동 | 1시간 | Step 2 |
| 8 | 지도 화면 실제 데이터 연동 | 1시간 | Step 2 |
| 9 | 일정 화면 실제 데이터 연동 | 30분 | Step 2 |
| 10 | 에러 처리 및 사용자 피드백 | 30분 | Step 7-9 |

**총 예상 시간: 약 7시간**

---

## 📊 1.4.1 다중 소스 데이터 수집 상세 계획

### 🎯 목표
VibeTrip의 핵심 차별화는 **다중 소스 로우 데이터 기반 신뢰도**입니다.
단순 Google Maps 래퍼가 아닌, 여러 소스를 분석하여 감성(Vibe) 기반 추천을 제공합니다.

---

### 📋 수집 데이터 소스 목록

| 순서 | 소스명 | 데이터 유형 | API/방법 | 우선순위 |
|------|--------|-------------|----------|----------|
| 1 | **Google Places** | 장소 기본정보, 평점, 리뷰, 사진 | Google Places API | 🔴 필수 |
| 2 | **YouTube 검증 채널** | 영상 자막, 타임스탬프, 리뷰 | YouTube Data API v3 | 🔴 필수 |
| 3 | **블로그/리뷰** | 네이버/티스토리/TripAdvisor 리뷰 | Gemini Web Search | 🔴 필수 |
| 4 | **미슐랭 가이드** | 별점, 추천 카테고리 | Gemini Web Search | 🟡 중요 |
| 5 | **날씨/기후** | 현재/예보, 기상 경보 | OpenWeather API | 🟡 중요 |
| 6 | **위기 정보** | 파업, 시위, 교통 장애 | GDELT/NewsAPI + Gemini | 🟡 중요 |
| 7 | **가격 정보** | 입장료, 예상 식사비, 교통비 | Google Places + Gemini | 🟡 중요 |
| 8 | **환율** | 실시간 환율 | Exchange Rate API | 🟢 향후 |
| 9 | **예약 가능성** | OpenTable, Klook 재고 | 각 API | 🟢 향후 |

---

### ⏰ 수집 스케줄

```
┌─────────────────────────────────────────────────────────────────┐
│                    자동 수집 스케줄 (KST 기준)                    │
├─────────────────────────────────────────────────────────────────┤
│  새벽 3:00  │  YouTube 채널 신규 영상 + 자막 수집                │
│  새벽 3:15  │  Gemini Web Search (블로그/미슐랭/TripAdvisor)    │
│  새벽 3:30  │  위기 정보 수집 (파업/시위/교통장애)               │
│  새벽 3:45  │  가격 정보 업데이트 (입장료/식사비)                │
│  새벽 4:00  │  환율 정보 업데이트                               │
│  새벽 4:15  │  데이터 정합성 검증 + DB 저장                      │
│  새벽 4:30  │  수집 완료 로그 기록 (타임스탬프)                  │
└─────────────────────────────────────────────────────────────────┘
```

**선택 이유:** 새벽 3시(KST)는 한국 트래픽 최저점 + API 서버 부하 최소

---

### 🔄 처리 파이프라인

#### Step 1: YouTube 검증 채널 데이터
```
[채널 화이트리스트 DB] ← 관리자 대시보드에서 관리
    │
    ├── 🍽️ 맛집 채널: 성시경, 백종원, 최자로드
    ├── 🍷 미식/와인 채널: 비밀이야, 와인 마시는 아톰
    ├── ✈️ 여행 채널: 빠니보틀, 곽튜브, 원지의하루
    ├── 🌍 현지 채널: 파리외노자, CHUNG Haemi, 마키친 등
    └── 👤 사용자 추가 채널: 프로필에서 등록
    │
    ▼
[YouTube Data API v3]
    │
    ├── GET /search (채널 ID + "맛집" OR "여행")
    ├── GET /videos (영상 상세정보)
    └── GET /captions (자막 스크립트)
    │
    ▼
[Gemini AI 분석]
    │
    ├── 자막에서 장소명 추출 (Fuzzy Matching)
    ├── 타임스탬프 매핑 ("삼부자" → 12:30~15:45)
    ├── 감성 분석 (Positive/Negative/Neutral)
    └── 3줄 요약 생성
    │
    ▼
[DB 저장]
    │
    ├── place_id: 장소 연결
    ├── video_url: youtube.com/watch?v=xyz&t=345s
    ├── timestamp_start: 345
    ├── timestamp_end: 480
    ├── sentiment: "positive"
    ├── summary: "성시경이 '인생 국물'이라 극찬"
    └── collected_at: 2026-01-05 03:15:00
```

#### Step 2: Gemini Web Search 다중 소스
```
[Gemini AI - Web Search 모드]
    │
    ├── Query 1: "{장소명} 미슐랭 가이드 평가"
    ├── Query 2: "{장소명} TripAdvisor 리뷰"
    ├── Query 3: "{장소명} 네이버 블로그 후기"
    ├── Query 4: "{장소명} 인스타그램 인기"
    └── Query 5: "{장소명} 최신 영업 상태"
    │
    ▼
[데이터 구조화]
    │
    ├── michelin_rating: "1스타" / "빕구르망" / null
    ├── tripadvisor_rating: 4.5
    ├── blog_mention_count: 152
    ├── instagram_hashtag_count: 12500
    ├── is_open: true
    └── source_urls: [...]
    │
    ▼
[Vibe Score 계산]
    │
    ├── vibe_score: Gemini Vision 분석 결과
    ├── buzz_score: (Google + TripAdvisor + 블로그) / 3
    ├── taste_score: 원어민 리뷰 비율 가중치
    └── reality_penalty: 날씨 + 혼잡도 + 파업 정보
```

#### Step 3: 위기 정보 수집
```
[GDELT/NewsAPI + Gemini]
    │
    ├── 파업 정보: "파리 지하철 파업 2026-01-10"
    ├── 시위 정보: "노란조끼 시위 샹젤리제"
    ├── 날씨 경보: "폭우 경보 01/06 14:00-18:00"
    └── 교통 장애: "에펠탑 인근 도로 통제"
    │
    ▼
[Reality Check 반영]
    │
    ├── 해당 일정에 경고 표시
    ├── 대안 이동수단 제안 (우버/택시)
    └── 일정 자동 조정 옵션 제공
```

#### Step 4: 가격 정보 수집
```
[Google Places + Gemini]
    │
    ├── 입장료: Gemini Web Search
    ├── 식사 예상비: price_level → 금액 변환
    │   ├── $ (1): ~₩15,000
    │   ├── $$ (2): ~₩30,000
    │   ├── $$$ (3): ~₩60,000
    │   └── $$$$ (4): ~₩100,000+
    ├── 교통비: Google Routes API (택시/대중교통)
    └── 환율: Exchange Rate API
    │
    ▼
[일별 합계 계산]
    │
    ├── Day 1: ₩185,000 (약 $138)
    ├── Day 2: ₩142,000 (약 $106)
    └── 총 예상: ₩327,000 (약 $244)
```

---

### 🗄️ DB 스키마 추가 (필요)

```sql
-- YouTube 검증 채널 테이블
CREATE TABLE youtube_channels (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(50) UNIQUE NOT NULL,
  channel_name VARCHAR(200) NOT NULL,
  category VARCHAR(50), -- 'mega_influencer', 'local_expert', 'user_added'
  is_active BOOLEAN DEFAULT TRUE,
  added_by VARCHAR(50), -- 'system' or user_id
  created_at TIMESTAMP DEFAULT NOW()
);

-- YouTube 영상-장소 매핑 테이블
CREATE TABLE youtube_place_mentions (
  id SERIAL PRIMARY KEY,
  place_id INTEGER REFERENCES places(id),
  channel_id VARCHAR(50),
  video_id VARCHAR(20) NOT NULL,
  video_title VARCHAR(500),
  timestamp_start INTEGER, -- 초 단위
  timestamp_end INTEGER,
  sentiment VARCHAR(20), -- 'positive', 'negative', 'neutral'
  summary TEXT,
  collected_at TIMESTAMP DEFAULT NOW()
);

-- 다중 소스 데이터 테이블
CREATE TABLE place_external_data (
  id SERIAL PRIMARY KEY,
  place_id INTEGER REFERENCES places(id),
  michelin_rating VARCHAR(20),
  tripadvisor_rating DECIMAL(2,1),
  tripadvisor_review_count INTEGER,
  blog_mention_count INTEGER,
  instagram_hashtag_count INTEGER,
  estimated_price_low INTEGER,
  estimated_price_high INTEGER,
  currency VARCHAR(10) DEFAULT 'KRW',
  source_urls JSONB,
  collected_at TIMESTAMP DEFAULT NOW()
);

-- 위기 정보 테이블
CREATE TABLE crisis_alerts (
  id SERIAL PRIMARY KEY,
  city_id INTEGER REFERENCES cities(id),
  alert_type VARCHAR(50), -- 'strike', 'protest', 'weather', 'traffic'
  title VARCHAR(500),
  description TEXT,
  affected_area VARCHAR(200),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  severity VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
  alternative_suggestion TEXT,
  collected_at TIMESTAMP DEFAULT NOW()
);

-- 수집 로그 테이블
CREATE TABLE data_collection_logs (
  id SERIAL PRIMARY KEY,
  collection_type VARCHAR(50),
  status VARCHAR(20), -- 'started', 'completed', 'failed'
  items_collected INTEGER,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

---

### 📱 UI 표시 계획

#### 장소 카드
```
┌────────────────────────────────────────────┐
│ 🍜 광장시장 육회골목                          │
│ ────────────────────────────────────────── │
│ ⭐ Vibe 8.5  │  📺 유튜버 Pick  │  🌟 빕구르망  │
│ ────────────────────────────────────────── │
│ 💰 예상: ₩15,000~25,000                     │
│ ────────────────────────────────────────── │
│ 📊 데이터 소스: Google, TripAdvisor, 블로그  │
│ 🕐 수집: 2026.01.05 03:15                   │
└────────────────────────────────────────────┘
```

#### 유튜버 Pick 상세
```
┌────────────────────────────────────────────┐
│ ▶️ [YouTube IFrame 임베드]                  │
│    (해당 시점 345초부터 자동 재생)            │
├────────────────────────────────────────────┤
│ 📺 성시경 - 먹을텐데                         │
│ "인생 국물이라고 극찬한 순간" (12:30~15:45)  │
└────────────────────────────────────────────┘
```

#### 일별 예산 합계
```
┌────────────────────────────────────────────┐
│ 📅 Day 1 예산 합계                          │
├────────────────────────────────────────────┤
│ 🎫 경복궁 입장료          ₩3,000           │
│ 🍜 점심 - 광장시장        ₩15,000          │
│ 🚕 택시 이동              ₩8,000           │
│ 🍽️ 저녁 - 명동교자        ₩12,000          │
├────────────────────────────────────────────┤
│ 💰 Day 1 합계: ₩38,000 (약 $28)           │
│ 💹 환율: 1 USD = ₩1,350 (01/05 기준)       │
└────────────────────────────────────────────┘
```

---

### 🛠️ 관리자 대시보드

#### 개요
관리자가 쉽게 데이터 소스를 **추가/수정/삭제**할 수 있는 대시보드.
코드 수정 없이 채널, 블로그, 평가 소스를 관리할 수 있어야 함.

#### 대시보드 UI 레이아웃
```
┌─────────────────────────────────────────────────────────────┐
│  🛠️ VibeTrip 관리자 대시보드                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 수집 현황                                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 마지막 수집: 2026.01.05 03:15 KST                        ││
│  │ 수집된 장소: 1,234개  │  연결된 영상: 456개               ││
│  │ 오류: 0건  │  [수동 수집 실행]                            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  📺 YouTube 채널 관리                      [+ 채널 추가]     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 카테고리  │  채널명          │  상태   │  액션           ││
│  │─────────────────────────────────────────────────────────││
│  │ 🍽️ 맛집   │  성시경           │  ✅ 활성  │  [수정][삭제]  ││
│  │ 🍽️ 맛집   │  백종원           │  ✅ 활성  │  [수정][삭제]  ││
│  │ 🍽️ 맛집   │  최자로드         │  ✅ 활성  │  [수정][삭제]  ││
│  │ 🍷 미식   │  비밀이야         │  ✅ 활성  │  [수정][삭제]  ││
│  │ 🍷 미식   │  와인 마시는 아톰  │  ✅ 활성  │  [수정][삭제]  ││
│  │ ✈️ 여행   │  빠니보틀         │  ✅ 활성  │  [수정][삭제]  ││
│  │ ✈️ 여행   │  곽튜브           │  ✅ 활성  │  [수정][삭제]  ││
│  │ 🌍 현지   │  파리외노자       │  ✅ 활성  │  [수정][삭제]  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  📝 블로그/리뷰 소스 관리                   [+ 소스 추가]    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 유형      │  이름             │  상태   │  액션           ││
│  │─────────────────────────────────────────────────────────││
│  │ 🏆 미슐랭  │  Michelin Guide   │  ✅ 활성  │  [수정][삭제]  ││
│  │ ⭐ 리뷰   │  TripAdvisor      │  ✅ 활성  │  [수정][삭제]  ││
│  │ 📰 블로그  │  네이버 블로그     │  ✅ 활성  │  [수정][삭제]  ││
│  │ 📸 SNS    │  Instagram        │  ✅ 활성  │  [수정][삭제]  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ⚙️ 수집 설정                                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 자동 수집 시간: [03:00] KST                              ││
│  │ 수집 주기: [매일 ▼]                                      ││
│  │ 데이터 보관 기간: [30일 ▼]                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 채널 추가 모달
```
┌─────────────────────────────────────────┐
│  📺 YouTube 채널 추가                    │
├─────────────────────────────────────────┤
│  채널 URL 또는 ID:                       │
│  ┌─────────────────────────────────────┐│
│  │ https://youtube.com/@secret_food    ││
│  └─────────────────────────────────────┘│
│                                         │
│  채널명: [자동 입력됨]                   │
│  카테고리: [맛집 ▼]                      │
│                                         │
│  [취소]                    [추가]       │
└─────────────────────────────────────────┘
```

#### 채널 카테고리
| 카테고리 | 코드 | 설명 |
|---------|------|------|
| 🍽️ 맛집 | `food` | 일반 맛집 리뷰 (성시경, 백종원) |
| 🍷 미식/와인 | `gourmet` | 고급 미식, 와인 페어링 (비밀이야, 와인 마시는 아톰) |
| ✈️ 여행 | `travel` | 여행 브이로그 (빠니보틀, 곽튜브) |
| 🌍 현지 | `local` | 현지 거주자/전문가 (파리외노자) |
| 👤 사용자 | `user_added` | 사용자가 직접 추가한 채널 |

#### 기본 등록 채널 목록 (시드 데이터)

| 카테고리 | 채널명 | YouTube ID | 구독자 |
|---------|--------|------------|--------|
| 🍽️ 맛집 | 성시경 (먹을텐데) | @sikifoods | 400만+ |
| 🍽️ 맛집 | 백종원 | @paboriver | 600만+ |
| 🍽️ 맛집 | 최자로드 | @choizaroad | 100만+ |
| 🍷 미식 | 비밀이야 | @secretfood | 50만+ |
| 🍷 미식 | 와인 마시는 아톰 | @wineatom | 30만+ |
| ✈️ 여행 | 빠니보틀 | @panibottle | 400만+ |
| ✈️ 여행 | 곽튜브 | @kwaktube | 300만+ |
| ✈️ 여행 | 원지의하루 | @wonjisday | 150만+ |
| 🌍 현지 | 파리외노자 | @parisonenoza | 20만+ |
| 🌍 현지 | CHUNG Haemi | @chunghaemi | 10만+ |
| 🌍 현지 | 마키친 | @makitchen | 15만+ |

#### 관리자 API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/admin/channels` | 채널 목록 조회 |
| POST | `/api/admin/channels` | 채널 추가 |
| PUT | `/api/admin/channels/:id` | 채널 수정 |
| DELETE | `/api/admin/channels/:id` | 채널 삭제 |
| GET | `/api/admin/sources` | 블로그/리뷰 소스 목록 |
| POST | `/api/admin/sources` | 소스 추가 |
| PUT | `/api/admin/sources/:id` | 소스 수정 |
| DELETE | `/api/admin/sources/:id` | 소스 삭제 |
| GET | `/api/admin/collection/status` | 수집 현황 조회 |
| POST | `/api/admin/collection/run` | 수동 수집 실행 |
| PUT | `/api/admin/collection/settings` | 수집 설정 변경 |

#### 접근 방식
- **옵션 A**: 프로필 화면 내 "관리자" 섹션 (간단)
- **옵션 B**: 별도 관리자 화면 (탭 또는 모달)
- **옵션 C**: 웹 대시보드 (Express 서버에서 제공)

**권장: 옵션 A** - 프로필 화면에 "데이터 소스 관리" 버튼 추가

---

### 🔑 필요한 API 키

| API | 환경변수명 | 무료 한도 | 비용 |
|-----|-----------|----------|------|
| Google Places | `Google_maps_api_key` | $200/월 크레딧 | 유료 |
| YouTube Data | `YOUTUBE_DATA_API_KEY` | 10,000 쿼터/일 | 무료 |
| OpenWeather | `OPENWEATHER_API_KEY` | 1,000 콜/일 | 무료 |
| Exchange Rate | `EXCHANGE_RATE_API_KEY` | 1,500 콜/월 | 무료 |

**Gemini AI**: 이미 연동됨 (`AI_INTEGRATIONS_GEMINI_API_KEY`)

---

### ✅ 구현 순서

| 단계 | 태스크 | 예상 시간 | 의존성 |
|------|--------|----------|--------|
| 1 | DB 스키마 추가 (채널, 외부데이터, 위기정보) | 30분 | 없음 |
| 2 | YouTube 채널 화이트리스트 관리 서비스 | 1시간 | Step 1 |
| 3 | 프로필 화면에 '신뢰 채널 관리' UI | 1시간 | Step 2 |
| 4 | Gemini Web Search 다중 소스 수집 서비스 | 2시간 | Step 1 |
| 5 | YouTube Data API 연동 (자막+타임스탬프) | 2시간 | YouTube API 키 |
| 6 | 가격 정보 수집 + 일별 합계 계산 | 1시간 | Step 4 |
| 7 | 위기 정보 수집 서비스 | 1시간 | Step 4 |
| 8 | 새벽 3시 Cron Job 설정 | 30분 | Step 4-7 |
| 9 | 수집 타임스탬프 UI 표시 | 30분 | Step 8 |
| 10 | [유튜버 Pick] 배지 + 임베드 플레이어 UI | 1시간 | Step 5 |
| 11 | 일별 예산 합계 UI | 30분 | Step 6 |

**총 예상 시간: 약 11시간**

---

### 🏆 경쟁사 Gap 분석 및 차별화

#### 현재 경쟁 서비스 분석

| 서비스 | 장점 | 한계점 |
|--------|------|--------|
| **Google Maps** | 방대한 데이터, 정확한 위치 | 감성 분석 없음, 일정 생성 수동 |
| **TripAdvisor** | 사용자 리뷰 풍부 | 한국어 리뷰 부족, 감성 기반 X |
| **마이리얼트립** | 한국어, 가이드 연결 | 자유여행 일정 생성 약함 |
| **네이버 블로그** | 한국어 후기 많음 | 검색 필요, 자동 분석 X |
| **여행에 미치다** | 유튜브 기반, 한국어 | 텍스트 기반, 앱 없음 |

#### VibeTrip 3대 차별화 포인트

```
┌─────────────────────────────────────────────────────────────┐
│                    🎯 VibeTrip 차별화                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1️⃣  다중 소스 데이터 융합                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  경쟁사: 단일 소스 (Google OR TripAdvisor OR 블로그)      ││
│  │  VibeTrip: 9개 소스 동시 분석 + AI 통합 점수 (Vibe Score) ││
│  │  → 유튜버 + 미슐랭 + 블로그 + 리뷰 = 신뢰도 극대화        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  2️⃣  데이터 신선도 투명성                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  경쟁사: 데이터 수집 시점 불명확                          ││
│  │  VibeTrip: "수집: 2026.01.05 03:00" 명시                 ││
│  │  → 30일 이상 경과 시 경고, 사용자가 신선도 직접 확인       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  3️⃣  신뢰 채널 화이트리스트                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  경쟁사: 불특정 리뷰 (신뢰도 불확실)                      ││
│  │  VibeTrip: 검증된 인플루언서만 (성시경, 백종원, 빠니보틀)  ││
│  │  → 사용자도 신뢰 채널 추가 가능, 개인화된 추천             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 차별화 요약 표
| 기능 | Google | TripAdvisor | 마이리얼트립 | **VibeTrip** |
|------|--------|-------------|-------------|--------------|
| 다중 소스 융합 | ❌ | ❌ | ❌ | ✅ 9개 소스 |
| 감성 기반 추천 | ❌ | ❌ | △ | ✅ Vibe Score |
| 수집 시점 표시 | ❌ | ❌ | ❌ | ✅ 실시간 |
| 유튜버 Pick | ❌ | ❌ | ❌ | ✅ 타임스탬프 연동 |
| 신선도 경고 | ❌ | ❌ | ❌ | ✅ 30일 경과 알림 |
| 한국어 우선 | ❌ | ❌ | ✅ | ✅ |
| AI 일정 생성 | △ | ❌ | △ | ✅ |

---

### 📝 블로그/리뷰 소스 관리

#### 추가 DB 스키마 (블로그 소스)

```sql
-- 블로그/리뷰 소스 화이트리스트 테이블
CREATE TABLE blog_sources (
  id SERIAL PRIMARY KEY,
  source_name VARCHAR(200) NOT NULL,
  source_type VARCHAR(50) NOT NULL, -- 'michelin', 'tripadvisor', 'blog', 'sns'
  source_url VARCHAR(500),
  region_scope VARCHAR(100), -- 'global', 'korea', 'europe', 'asia' 등
  language VARCHAR(10) DEFAULT 'ko', -- 'ko', 'en', 'ja' 등
  trust_weight DECIMAL(3,2) DEFAULT 1.0, -- 0.00 ~ 1.00 가중치
  is_active BOOLEAN DEFAULT TRUE,
  added_by VARCHAR(50) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 기본 블로그 소스 시드 데이터
INSERT INTO blog_sources (source_name, source_type, source_url, region_scope, language, trust_weight) VALUES
('Michelin Guide', 'michelin', 'https://guide.michelin.com', 'global', 'en', 1.0),
('TripAdvisor', 'tripadvisor', 'https://tripadvisor.com', 'global', 'en', 0.9),
('네이버 블로그', 'blog', 'https://blog.naver.com', 'korea', 'ko', 0.8),
('티스토리', 'blog', 'https://tistory.com', 'korea', 'ko', 0.7),
('Instagram', 'sns', 'https://instagram.com', 'global', 'en', 0.6),
('Yelp', 'review', 'https://yelp.com', 'global', 'en', 0.85),
('OpenTable', 'booking', 'https://opentable.com', 'global', 'en', 0.9),
('The Infatuation', 'review', 'https://theinfatuation.com', 'global', 'en', 0.85);
```

#### 블로그 수집 파이프라인

```
[블로그 소스 DB]
    │
    ├── 미슐랭: guide.michelin.com/ko/restaurants
    ├── TripAdvisor: tripadvisor.com/Restaurants
    ├── 네이버: blog.naver.com (검색 API)
    └── 티스토리: tistory.com (검색)
    │
    ▼
[Gemini Web Search + grounding]
    │
    ├── Query: "{장소명} {소스} 리뷰 평가"
    ├── 언어별 검색 (한국어/영어/현지어)
    └── 최신순 정렬
    │
    ▼
[데이터 추출 및 정규화]
    │
    ├── rating: 평점 추출 (5점 만점 → 10점 변환)
    ├── review_count: 리뷰 개수
    ├── sentiment: 긍정/부정/중립 분류
    ├── summary: 핵심 내용 3줄 요약
    └── source_url: 원본 링크
    │
    ▼
[DB 저장] → place_external_data
```

---

### ⚠️ 데이터 신선도 경고 시스템

#### 신선도 레벨 정의

| 경과 일수 | 레벨 | 아이콘 | 표시 |
|----------|------|--------|------|
| 0-7일 | 🟢 Fresh | ✅ | "방금 수집" |
| 8-14일 | 🟡 Recent | 🕐 | "1주 전 수집" |
| 15-30일 | 🟠 Aging | ⚠️ | "2주 전 수집" |
| 31일+ | 🔴 Stale | 🚨 | "오래된 데이터" |

#### 신선도 UI 표시

```
┌────────────────────────────────────────────────────────┐
│ 🍜 광장시장 육회골목                                     │
│ ────────────────────────────────────────────────────── │
│ ⭐ Vibe 8.5  │  📺 유튜버 Pick  │  🌟 빕구르망           │
│ ────────────────────────────────────────────────────── │
│ 💰 예상: ₩15,000~25,000                                │
│ ────────────────────────────────────────────────────── │
│ ✅ 수집: 2026.01.05 03:15 (오늘)                        │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 🍕 Pizzeria Da Michele (나폴리)                          │
│ ────────────────────────────────────────────────────── │
│ ⭐ Vibe 9.2  │  🌟 미슐랭 1스타                          │
│ ────────────────────────────────────────────────────── │
│ 💰 예상: €12~18                                         │
│ ────────────────────────────────────────────────────── │
│ ⚠️ 수집: 2025.12.10 03:15 (26일 전)                     │
│    [🔄 최신 데이터 요청]                                │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 🍣 스시 사이토 (도쿄)                                    │
│ ────────────────────────────────────────────────────── │
│ ⭐ Vibe 9.8  │  🌟 미슐랭 3스타                          │
│ ────────────────────────────────────────────────────── │
│ 💰 예상: ¥30,000~50,000                                 │
│ ────────────────────────────────────────────────────── │
│ 🚨 수집: 2025.11.15 03:15 (51일 전) - 오래된 데이터     │
│    [🔄 최신 데이터 요청]  [ℹ️ 왜 오래됐나요?]            │
└────────────────────────────────────────────────────────┘
```

#### 신선도 계산 로직

```typescript
// server/services/data-freshness.ts
export function getDataFreshness(collectedAt: Date): {
  level: 'fresh' | 'recent' | 'aging' | 'stale';
  daysAgo: number;
  displayText: string;
  icon: string;
  warningLevel: 0 | 1 | 2 | 3;
} {
  const now = new Date();
  const diffMs = now.getTime() - collectedAt.getTime();
  const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysAgo <= 7) {
    return {
      level: 'fresh',
      daysAgo,
      displayText: daysAgo === 0 ? '오늘 수집' : `${daysAgo}일 전 수집`,
      icon: '✅',
      warningLevel: 0
    };
  } else if (daysAgo <= 14) {
    return {
      level: 'recent',
      daysAgo,
      displayText: '1주 전 수집',
      icon: '🕐',
      warningLevel: 1
    };
  } else if (daysAgo <= 30) {
    return {
      level: 'aging',
      daysAgo,
      displayText: `${Math.floor(daysAgo / 7)}주 전 수집`,
      icon: '⚠️',
      warningLevel: 2
    };
  } else {
    return {
      level: 'stale',
      daysAgo,
      displayText: '오래된 데이터',
      icon: '🚨',
      warningLevel: 3
    };
  }
}
```

#### 사용자 액션

| 상태 | 사용자 옵션 |
|------|------------|
| 🟢 Fresh | 없음 (정상) |
| 🟡 Recent | "최신 데이터 요청" 버튼 (숨김) |
| 🟠 Aging | "최신 데이터 요청" 버튼 (표시) |
| 🔴 Stale | "최신 데이터 요청" + 경고 배너 |

**"최신 데이터 요청"** 클릭 시:
1. 해당 장소만 즉시 재수집 (Gemini Web Search)
2. 수집 완료 후 UI 자동 업데이트
3. 수집 로그에 "사용자 요청" 기록

---

## Phase 2: 핵심 AI 기능

### 2.1 AI 추천 엔진

| 태스크 | 상태 | 설명 |
|--------|------|------|
| Gemini Vision 연동 | ✅ | Vibe Score 분석 |
| Taste Verification | ⬜ | 언어 기반 리뷰 분석 |
| 페르소나별 가중치 | ⬜ | 럭셔리/컴포트 차별화 |

### 2.2 동선 최적화

| 태스크 | 상태 | 설명 |
|--------|------|------|
| Google Routes API | ⬜ | 실시간 이동 시간 |
| Time vs Money 옵션 | ⬜ | 대중교통/택시 비교 |
| 지도 오버레이 | ⬜ | 최적 경로 시각화 |

---

## Phase 3: 고급 기능 (향후)

### 3.1 미디어 기능

| 태스크 | 상태 | 설명 |
|--------|------|------|
| 숏폼 미리보기 | ⬜ | 일정 기반 15-30초 영상 |
| 실제 사진/영상 매핑 | ⬜ | 저작권 안전한 콘텐츠 |

### 3.2 예약 자동화

| 태스크 | 상태 | 설명 |
|--------|------|------|
| 결제 시스템 | ⬜ | Stripe 연동 |
| OTA API 연동 | ⬜ | 항공/호텔 예약 |

---

## 우선순위 (협의 필요)

### 🔴 긴급 (이번 세션)
1. 사용자 입력 시스템 설계 및 구현
2. Vibe Score UI 표시
3. 성능 최적화

### 🟡 중요 (다음 단계)
4. API 키 연동
5. Taste Verification 구현
6. 동선 최적화

### 🟢 향후
7. 숏폼 미리보기
8. 예약 자동화

---

## 현재 이슈

| 이슈 | 상태 | 해결방안 |
|------|------|----------|
| 앱 정체성 불명확 | 🔴 | Vibe 입력 + 점수 표시로 차별화 |
| 버튼 반응 느림 | 🔴 | memo, useMemo 적용 |
| API 키 미설정 | 🟡 | 사용자에게 요청 필요 |
| 샘플 데이터만 표시 | 🟡 | API 연동 후 해결 |
