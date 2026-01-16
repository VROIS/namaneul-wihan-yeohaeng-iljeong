# 📘 NUBI 핵심 개발 백서 (Core Development White Paper)
**: 35년 가이드의 경험을 알고리즘으로 구현한 '인간 중심' AI 여행 큐레이터**

---

## 1. 프로젝트 정체성 (Identity)

NUBI는 단순한 장소 나열(Listing) 앱이 아닙니다. **"누구와 함께 가는가?"**를 최우선으로 고려하여, 35년 경력 베테랑 가이드의 노하우를 AI 로직으로 전환한 **초개인화 여행 큐레이션 서비스**입니다.

---

## 2. 핵심 알고리즘: '대상 중심' 스코어링 엔진 (The Brain)

기존 여행 앱의 단순 필터링 한계를 극복하기 위해, **'누구(Target)'**를 1순위 가중치로 두는 독자적인 추천 수식을 적용했습니다.

### 2.1. 3단계 가중치 계층 구조 (Layered Logic)

1. **🥇 1순위: 대상(Curation Focus) - "누구를 위한 여행인가?"**
   - 단순한 취향 반영 이전에 물리적/환경적 제약 조건을 먼저 필터링합니다.
   - *예: '부모님' 선택 시 → 계단이 많은 곳, 대기가 긴 핫플레이스는 점수 대폭 감점 (Penalty).*
   - *예: '아이' 선택 시 → 유모차 접근성, 키즈존 유무가 최우선 가산점 (Bonus).*

2. **🥈 2순위: 분위기(Vibe) - "어떤 느낌을 원하는가?"**
   - 사용자가 선택한 태그의 **순서**에 따라 가중치를 차등 배분합니다.
   - *로직:* 첫 번째 선택(50%) > 두 번째 선택(30%) > 세 번째 선택(20%).
   - *UI:* "힐링(최우선), 미식(우선), 쇼핑(반영)"과 같이 직관적인 텍스트로 표현.

3. **🥉 3순위: 스타일 & 예산 (Style & Budget)**
   - 여행 밀도(여유롭게/빡빡하게)와 비용 수준을 마지막으로 조정합니다.

### 2.2. 최종 스코어링 공식

```
Final Score = (Base Score × Target_Weight × Vibe_Weight) + Style_Adj - Reality_Penalty
```

### 2.3. 세부 스코어링 수식 (코드 기반)

#### Base Score 계산
```
Base Score = (Vibe + Buzz + Taste) / 3  →  0~10점
```

#### Vibe 가중치 (baseWeight 기준)
| Vibe | 한글 | baseWeight | 선택시 가중치 계산 |
|------|------|-----------|------------------|
| Healing | 힐링 | 35 | weight / Σ(선택 weights) |
| Foodie | 미식 | 25 | 예: Foodie+Culture 선택 → 25/(25+10)=0.71 |
| Hotspot | 핫스팟 | 15 | |
| Adventure | 모험 | 10 | |
| Culture | 문화/예술 | 10 | |
| Romantic | 로맨틱 | 5 | |

#### 대상(Protagonist) 조정값
| CurationFocus | 조정값 |
|---------------|--------|
| Kids | Adventure +10, Healing -5, Culture -5 |
| Parents | Culture +10, Healing +5, Adventure -10 |
| Everyone | 조정 없음 |
| Self | 조정 없음 |

#### 동반자 보너스 (Companion Bonus)
| companionType | 인원 | 매칭 조건 | 보너스 |
|---------------|------|----------|--------|
| Single | 1명 | 혼밥OK, 1인석, 바(bar) | +1.5 |
| Couple | 2명 | 로맨틱, 야경, 분위기 | +2.0 |
| Family | 3-7명 | goodForChildren, 넓은공간 | +1.5 |
| Group | 7명+ | 단체석, 예약가능, 프라이빗룸 | +1.0 |

#### Reality Penalty
| 요소 | 패널티 | 조건 |
|------|--------|------|
| 날씨 | 0~2점 | 비/눈/폭염 |
| 혼잡도 | 0~1.5점 | 피크타임, 주말 |
| 운영상태 | 0~1.5점 | 휴무, 파업, 공사 |

---

## 3. 정밀 예산 & 수익화 시스템 (The Wallet)

단순히 "비쌈/저렴함"으로 나누지 않고, **'믹스 앤 매치(Mix & Match)'** 소비 패턴을 반영한 현실적인 예산 산출 엔진을 탑재했습니다.

### 3.1. travelStyle 시나리오 (호텔 제외)

| travelStyle | priceLevel | 교통 | 식사 | 가이드 | 하루 장소 |
|-------------|-----------|------|------|--------|----------|
| **Luxury** | 4 | VIP 전용차량 | 미슐랭급 | 전담 가이드 동행 | 2곳 (예약/웨이팅최소) |
| **Premium** | 3 | 고급 세단 | 트렌디 레스토랑 | 세단 가이드 | 3곳 |
| **Reasonable** | 2 | 우버+대중교통 | 현지인 맛집 | 워킹 가이드 | 4곳 |
| **Economic** | 1 | 대중교통 | 스트리트푸드 | 없음 (자유) | 5-6곳 |

### 3.2. 항목별 분리 계산 (Component-Based Calculation)

사용자는 교통, 식사, 가이드 옵션을 각각 독립적으로 선택할 수 있습니다.
- **식사:** 4단계 정찰제 적용 (€100 미슐랭 / €50 트렌디 / €30 현지맛집 / €10 간편식).
- **교통:** Google Maps 데이터 기반 대중교통 vs 우버/택시 비용.
- **가이드:** 워킹(€420) / 세단(€600) / VIP(€880~) 등 실제 가이드 비용 데이터베이스 연동.

### 3.3. 예산 산출 공식

```
1인당 일일 비용 = (교통비 ÷ n) + 식사비 + 입장료 + (가이드비 ÷ n)
```

### 3.4. 비용 계산 코드 (getPriceEstimate)

```typescript
const multipliers: Record<TravelStyle, number> = {
  Luxury: 3,
  Premium: 2,
  Reasonable: 1,
  Economic: 0.7,
};
const priceLabels = ['무료', '저렴함', '보통', '비쌈', '매우 비쌈'];
```

### 3.5. 비즈니스 모델 (BM)

- **Freemium:** 기본 일정 생성은 무료.
- **Paid Content:** '나만의 여행 스토리보드(영상)' 및 '상세 예산표' 다운로드 시 과금.
- **CTA (Call To Action):** 산출된 예산을 바탕으로 **"35년 경력 가이드 예약하기"** 버튼을 통해 실제 매출 전환 유도.

---

## 4. 데이터 파이프라인: 다중 소스 교차 검증 (The Eyes)

단일 소스(Google Maps)에 의존하지 않고, 감성(Vibe)과 현실(Reality)을 모두 잡기 위해 다양한 데이터를 수집·분석합니다.

| 소스 (Source) | 역할 (Role) | 핵심 가치 |
|:---|:---|:---|
| **Google Places** | 뼈대 데이터 | 영업시간, 기본 평점, 위치 좌표 (Reality) |
| **YouTube** | 감성 검증 | 영상 자막/타임스탬프 분석을 통해 '실제 분위기' 추출 (Vibe) |
| **Blog/Review** | 트렌드 파악 | Gemini Web Search로 최신 후기 및 로컬 트렌드 분석 (Buzz) |
| **Weather/News** | 리스크 관리 | 파업, 시위, 날씨 정보를 실시간 반영하여 페널티 부과 (Penalty) |
| **Internal DB** | 가격 표준 | 가이드 인건비, 식사 등급별 표준 가격 관리 |

---

## 5. 전문가 검증 시스템 (The Trust)

AI의 환각(Hallucination)을 방지하고 신뢰도를 높이기 위한 **'Human-in-the-loop'** 시스템입니다.

- **사용자:** 일정 결과 화면에서 "현지 전문가 검증" 버튼 클릭 (모달 폼).
- **관리자 (Admin):** 대시보드에서 요청 목록 확인 → 일정 검토 → 코멘트 작성 및 상태 변경(대기/완료).
- **피드백:** 검증이 완료되면 사용자에게 알림을 보내고, 마이페이지 보관함에 **'인증 마크'**가 표시된 일정으로 저장.

---

## 6. 시간대별 바이브 친화도 (Time Slot Affinity)

```typescript
const TIME_SLOTS = [
  { slot: 'morning', startTime: '09:00', endTime: '12:00', vibeAffinity: ['Healing', 'Culture', 'Adventure'] },
  { slot: 'lunch', startTime: '12:00', endTime: '14:00', vibeAffinity: ['Foodie'] },
  { slot: 'afternoon', startTime: '14:00', endTime: '18:00', vibeAffinity: ['Hotspot', 'Culture', 'Adventure', 'Healing'] },
  { slot: 'evening', startTime: '18:00', endTime: '21:00', vibeAffinity: ['Foodie', 'Romantic'] },
];
```

---

## 7. 경로 최적화 (Route Optimization)

### Haversine 거리 계산
```typescript
function calculateDistance(lat1, lng1, lat2, lng2): number {
  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)² + Math.cos(lat1 * π/180) * Math.cos(lat2 * π/180) * Math.sin(dLng/2)²;
  return R * 2 * atan2(√a, √(1-a));
}
```

### 도시 순서 최적화 (TSP-like)
- 시작 도시부터 가장 가까운 도시 순으로 방문
- 같은 도시 내 장소는 연속 배치

---

## 8. 현재 상태 및 향후 로드맵 (Roadmap)

### 개발 단계
| Phase | 이름 | 설명 | 상태 |
|-------|------|------|------|
| A | 자산 안정화 | 로우데이터 수집 (YouTube, Naver Blog) | ✅ 완료 |
| B | 스코어링 엔진 | 점수 로직 + 예산 계산 + 로딩 UX | ✅ 완료 |
| C | 관제 현황판 | 관리자 대시보드, 품질 알림 | ✅ 완료 |
| D | 일정표 UI | 일별 동선 + 썸네일 + 비용 표시 | 🔄 진행중 |
| E | 감동 영상 | 8초×N = 1분 하이라이트 AI 영상 | ⬜ 예정 |

### 현재 상태
- **백엔드:** 완료 (데이터 파이프라인, API 엔드포인트, 일정 생성)
- **프론트엔드:** 기본 UI 완료 (4탭 네비게이션, 일정 생성 폼)
- **일정 생성:** ✅ 완료 (다국가/장기 여행 지원, 도시별 그룹핑)
- **관리자 대시보드:** ✅ 완료 (API 모니터링, 데이터 품질 관리)

### 향후 작업 (Next Steps)
1. **마이페이지 고도화:** 검증된 일정을 보관함에서 시각적으로 구별하여 표시.
2. **파이프라인 시각화:** 일정 생성 중 계산 과정(Vibe→Buzz→Taste)을 사용자에게 프로그레스 바 형태로 시각화.
3. **영상 자동화:** 수집된 로우 데이터(Raw Data)를 활용해 개인화된 여행 스토리보드 영상 생성.

---

## 9. 핵심 파일 위치

| 파일 | 역할 |
|------|------|
| `server/services/itinerary-generator.ts` | 스코어링 엔진, 가중치, 비용 계산 |
| `client/utils/vibeCalculator.ts` | 클라이언트 Vibe 가중치 계산 |
| `shared/schema.ts` | DB 스키마 정의 |
| `server/admin-routes.ts` | 관리자 대시보드 API |
| `server/templates/admin-dashboard.html` | 관리자 대시보드 UI |

---

*이 백서는 NUBI 프로젝트의 Replit 개발 기록을 바탕으로 2026년 1월 13일 기준으로 작성되었습니다.*
*검증에 투자한 비용: €500 이상*
