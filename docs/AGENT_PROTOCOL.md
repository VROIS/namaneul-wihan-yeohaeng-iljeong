# 🔗 에이전트 통신 규약 (Agent Protocol v1.0)

> **작성일: 2026-02-08** | **버전: 1.0**
> 
> 모든 에이전트(AG1~AG5)가 반드시 준수해야 하는 데이터 통신 표준

---

## 🎯 핵심 원칙

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. googlePlaceId (gid) = 에이전트 간 공통 식별자           │
│     → 전 세계 유일, 불변, 모든 장소의 바코드               │
│                                                             │
│  2. 원소스 멀티유즈 (One Source Multi-Use)                   │
│     → AG3가 만든 "확정 데이터 패킷"을 AG4, AG5가 공유       │
│     → 같은 데이터로 일정표 + 예산 + 영상 생성               │
│                                                             │
│  3. AG3 = 번역기                                            │
│     → 인간 언어(장소명) → 기계 언어(gid)로 변환             │
│     → AG3 이후 모든 통신은 gid 기반                         │
│                                                             │
│  4. 슬롯 = 장소 = 씬 (1:1:1)                               │
│     → AG1 슬롯 1개 = AG3 장소 1개 = AG5 영상 클립 1개      │
│                                                             │
│  5. 자동 학습                                               │
│     → 매칭 성공 시 aliases에 새 별칭 자동 추가              │
│     → 쓸수록 매칭률 상승                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 도시 식별 규약

### cities 테이블 구조

| 필드 | 타입 | 용도 | 예시 |
|------|------|------|------|
| id | serial | DB 내부 PK | 1 |
| name | text | 한국어 표시명 | "파리" |
| **nameEn** | text | 영어 공식명 (매칭 키) | "Paris" |
| **nameLocal** | text | 현지 공식명 | "Paris" |
| **aliases** | jsonb | 별칭 배열 | ["巴黎", "パリ"] |
| countryCode | text | ISO 국가코드 | "FR" |

### 통합 도시 검색 규칙

```
입력: "Paris" 또는 "파리" 또는 "巴黎"
  ↓
1. nameEn 정확 매칭 (대소문자 무시)
2. name 정확 매칭 (한국어)
3. nameLocal 매칭
4. aliases 배열 포함 검색
5. 좌표 기반 최근접 매칭 (fallback)
  ↓
출력: cityId = 1 (확정)
```

---

## 📋 장소 식별 규약

### places 테이블 핵심 필드

| 필드 | 타입 | 용도 | 예시 |
|------|------|------|------|
| id | serial | DB 내부 PK | 42 |
| **googlePlaceId** | text | 글로벌 유일 키 (바코드) | "ChIJLU7jZClu5kcR..." |
| name | text | Google 공식명 | "Tour Eiffel" |
| **displayNameKo** | text | 한국어 표시명 | "에펠탑" |
| **aliases** | jsonb | 별칭 배열 | ["에펠탑", "Eiffel Tower"] |
| cityId | integer | 소속 도시 FK | 1 |

### 장소 매칭 우선순위

```
AG2가 "에펠탑" 추천
  ↓
① googlePlaceId 매칭 (100% 확실)
② name 정확 매칭 (대소문자 무시)
③ aliases 배열 검색 ("에펠탑" in aliases → 매칭!)
④ 부분 매칭 (포함 관계)
⑤ Fuzzy 매칭 (50%+ 단어 일치)
⑥ Google Places Text Search → gid 획득 → 역매칭
  ↓
매칭 성공 시: "에펠탑"을 aliases에 자동 추가 (자동 학습)
```

---

## 🔄 에이전트 간 데이터 흐름

### AG1 → AG2: 빈 시간표 (슬롯 구조)

```typescript
interface AG1Output {
  formData: TripFormData;        // 사용자 입력 9개 원본
  dayCount: number;              // 여행 일수
  daySlotsConfig: DaySlotConfig[]; // 일별 슬롯 구조
  totalRequiredPlaces: number;   // 총 필요 장소 수
  requiredPlaceCount: number;    // 여유분 포함
  travelPace: TravelPace;       // Packed|Normal|Relaxed
  companionCount: number;       // 인원수
  vibeWeights: VibeWeight[];    // 바이브 가중치
  koreanSentiment?: KoreanSentimentData; // 한국 감성 보너스
}

// 슬롯 구조: 각 슬롯은 타입(activity/lunch/dinner)을 포함
interface DaySlotConfig {
  day: number;
  startTime: string;  // "09:00"
  endTime: string;    // "21:00"
  slots: number;      // 6 (= 4 activity + 1 lunch + 1 dinner)
}
```

### AG2 → AG3: 후보 장소명 (자연어, 영어)

```typescript
interface AG2Candidate {
  name: string;           // "Eiffel Tower" (영어 공식명 강제)
  reason: string;         // 추천 이유
  city: string;           // "Paris"
  time: string;           // "morning"|"lunch"|"afternoon"|"evening"
  isFood: boolean;        // 식당/카페 여부
  googleReviewCount?: number; // Gemini가 아는 리뷰 수
}
```

**⚠️ 규칙**: AG2(Gemini)에게 반드시 "구글맵에서 검색 가능한 영어 공식 명칭"으로 답하도록 강제  
**⚠️ 반경 제한**: 1차 일정 요청 프롬프트에 **사용자 입력 도시의 반경 100km 내외**를 반드시 포함. (Place Seed·AG3 매칭 범위와 동일)

### AG3 출력: 확정 데이터 패킷 (기계어, gid 기반)

```typescript
interface ConfirmedPlace {
  // ===== 식별 (기계어) =====
  gid: string;              // googlePlaceId (바코드)
  dbPlaceId: number;         // DB places.id
  
  // ===== 표시 (인간어) =====
  name: string;              // Google 공식명 "Tour Eiffel"
  displayNameKo: string;     // 한국어 "에펠탑"
  description: string;       // 요약 설명
  
  // ===== 위치 =====
  lat: number;
  lng: number;
  city: string;
  
  // ===== 시간 =====
  day: number;
  slotId: string;            // "d1-s1"
  startTime: string;         // "09:00"
  endTime: string;           // "11:00"
  duration: number;          // 120 (분)
  
  // ===== 분류 =====
  type: 'activity' | 'lunch' | 'dinner' | 'cafe';
  isMealSlot: boolean;
  mealType?: 'lunch' | 'dinner';
  
  // ===== 데이터 =====
  image: string;             // DB photo_urls[0]
  rating: number;            // Google 평점
  reviewCount: number;       // Google 리뷰 수
  koreanPopScore: number;    // 한국인 선호도 (0-100)
  finalScore: number;        // 최종 점수
  
  // ===== 비용 =====
  entranceFee?: number;      // 입장료 (EUR)
  mealPrice?: number;        // 식사비 (EUR, 인당)
  
  // ===== 출처 =====
  source: 'db' | 'google_api' | 'gemini_only';
  confidenceLevel: 'high' | 'medium' | 'low';
  selectionReasons: string[];
}
```

### AG4 출력: 최종 일정표 (프론트엔드 전달용)

AG3의 확정 데이터 패킷 + 실시간 정보(날씨, 환율, 위기경보, 이동 정보)

### 최종 일정 검증 (Verification) — AG4 이후, 프론트 전송 전

- **담당**: 메인 에이전트(파이프라인)가 호출. AG4가 검증하는 것이 아님.
- **입력**: 2차 가공된 최종 일정표(AG4 또는 V3 출력).
- **역할**: AI 기본 지식으로 비용·동선·실제 정보를 냉정·객관적으로 검증. **90% 이상만 통과** → 통과한 일정만 사용자 노출.
- **실패 시**: 프론트엔드에는 노출 없이 "일정 생성 실패" 등으로 처리. 백그라운드 전용.

### AG5 입력: AG3 확정 패킷 + 사용자 입력 9개

AG5는 확정 패킷에서 다음을 꺼내 씀:
- `gid` → DB에서 photo_urls 조회 (배경 사진)
- `displayNameKo` → 대사에 사용
- `type` → 씬 연출 방식 결정
- `lat/lng` → 이동 장면 거리 계산
- `startTime` → 조명/시간대 결정

---

## 🏷️ 도시명 매핑 테이블 (EUROPE_30_CITIES)

| name (한국어) | nameEn (영어) | nameLocal (현지) | countryCode |
|---------------|---------------|------------------|-------------|
| 파리 | Paris | Paris | FR |
| 니스 | Nice | Nice | FR |
| 마르세유 | Marseille | Marseille | FR |
| 리옹 | Lyon | Lyon | FR |
| 스트라스부르 | Strasbourg | Strasbourg | FR |
| 로마 | Rome | Roma | IT |
| 피렌체 | Florence | Firenze | IT |
| 베니스 | Venice | Venezia | IT |
| 밀라노 | Milan | Milano | IT |
| 아말피 | Amalfi | Amalfi | IT |
| 바르셀로나 | Barcelona | Barcelona | ES |
| 마드리드 | Madrid | Madrid | ES |
| 세비야 | Seville | Sevilla | ES |
| 그라나다 | Granada | Granada | ES |
| 런던 | London | London | GB |
| 에딘버러 | Edinburgh | Edinburgh | GB |
| 뮌헨 | Munich | München | DE |
| 베를린 | Berlin | Berlin | DE |
| 프랑크푸르트 | Frankfurt | Frankfurt | DE |
| 취리히 | Zurich | Zürich | CH |
| 인터라켄 | Interlaken | Interlaken | CH |
| 비엔나 | Vienna | Wien | AT |
| 잘츠부르크 | Salzburg | Salzburg | AT |
| 암스테르담 | Amsterdam | Amsterdam | NL |
| 브뤼셀 | Brussels | Bruxelles | BE |
| 프라하 | Prague | Praha | CZ |
| 부다페스트 | Budapest | Budapest | HU |
| 리스본 | Lisbon | Lisboa | PT |
| 아테네 | Athens | Αθήνα | GR |
| 두브로브니크 | Dubrovnik | Dubrovnik | HR |

---

## 🔗 관련 문서

- [TASK.md](./TASK.md) - 전체 프로젝트 과업
- [PHASE_E_VIDEO_MAPPING.md](./PHASE_E_VIDEO_MAPPING.md) - AG5 영상 프롬프트 매핑
- [PHASE_E_ARCHITECTURE.md](./PHASE_E_ARCHITECTURE.md) - 영상 아키텍처
