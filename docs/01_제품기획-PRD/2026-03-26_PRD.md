# 📄 제품 요구 사항 정의서 (PRD: Product Requirements Document)

## 1. 프로젝트 개요 (Project Overview)

- **제품명:** VibeTrip (The Handheld AI Guide)
- **비전:** "이질적인 데이터(감성 Vibe + 실시간 현실 Reality)를 통합하여, 탐색부터 예약까지 원스톱으로 해결하는 초개인화 여행 에이전트"
- **핵심 가치:** 사용자의 막연한 감성(Vibe)을 논리적인 동선(Reality)으로 변환하고, 예약/결제 자동화로 실행(Action)까지 책임짐

---

## 2. 타겟 사용자 및 페르소나 (Target Audience)

### 페르소나 1: 경험 사치 추구형 (MZ세대/VIP)
- **슬로건:** "돈으로 시간을 산다"
- **특성:** 최단 이동(택시), 포토제닉한 힙플레이스, 럭셔리 경험 중시
- **UI 악센트:** Gold

### 페르소나 2: 합리적 안정 추구형 (50대/가족)
- **슬로건:** "실패 없는 편안함"
- **특성:** 철저한 동선 계획, 안전(치안/파업), 검증된 미식, 체력 안배 중시
- **UI 악센트:** Blue

---

## 3. 핵심 기능 명세 (Core Features)

### A. 초개인화 여정 생성 (Hyper-Personalized Itinerary)

| 기능 | 설명 |
|------|------|
| **Vibe Scoring** | 이미지와 리뷰를 분석하여 장소의 '감성 점수' 산출 (예: 몽환적인, 힙한, 클래식한) |
| **Real-time Reality Check** | 날씨, 파업, 시위 정보를 실시간 반영하여 접근 불가능한 장소 자동 제외 및 페널티 부여 |
| **Trend Matching** | 사용자 국적/연령대에 따라 가중치 자동 조절 (예: 한국인 50대 → 안전/미식 가중치↑) |

### B. 동선 최적화 및 시각화 (Route Optimization)

| 기능 | 설명 |
|------|------|
| **Time vs. Money 로직** | '합리적 여행(대중교통)'과 '편한 여행(우버/택시)' 옵션에 따른 경로 및 비용 산출 |
| **Dynamic Mapping** | Google Maps 위에 Vibe 마커와 최적 경로 오버레이 |

### C. 리얼 숏폼 미리보기 (Real-Vibe Preview)

- **기능:** 생성된 일정의 주요 장소를 실제 공개된 고품질 영상/사진으로 조합하여 15~30초 숏폼으로 자동 재생
- **목적:** 인위적인 AI 생성 이미지가 아닌, 실제 현장감을 제공하여 사용자 신뢰도 및 구매 욕구 증대

### D. 예약 및 결제 자동화 (End-to-End Automation)

- **Agent Action:** 최적화된 항공/숙소/투어 상품을 AI가 선정하고, 앱 이탈 없이 결제까지 완료

---

## 4. 핵심 알고리즘 (Core Algorithm)

### Final Score 공식
```
Final Score = (Vibe + Buzz + Taste) - Reality Penalty
```

### 점수 구성 요소

| 점수 | 범위 | 설명 |
|------|------|------|
| **Vibe Score** | 0-10 | Gemini Vision 분석 (사진 구도, 색감, 조명, 감성) |
| **Buzz Score** | 0-10 | 다중 소스 인기도 (Google, TripAdvisor, 리뷰 수) |
| **Taste Score** | 0-10 | 오리지널 맛 검증 (본고장 언어 리뷰 기반) |
| **Reality Penalty** | 0-5 | 날씨, 안전, 혼잡도 패널티 |

---

## 5. Taste Verification 알고리즘 (오리지널 맛 검증)

### 핵심 가설
> "해당 음식의 '본고장 사람들(Originators)'이 인정한 맛이 진짜 맛집이다"

### 가중치 공식
```
Taste_Score = (W1 × Originator_Review) + (W2 × Expert_Bonus) + (W3 × Global_Rating)
```

| 가중치 | 비율 | 설명 |
|--------|------|------|
| **W1** | 50% | 식당 국적 언어 리뷰 평점 × 리뷰 수 로그값 |
| **W2** | 30% | 미슐랭/전문 사이트 등재 여부 및 등급 |
| **W3** | 20% | 구글/트립어드바이저 전체 평점 × 최신성 가중치 |

### 4단계 필터링

1. **통계적 유의성** - 리뷰 50개 미만: 페널티 / 1000개 이상: 만점
2. **오리지널 언어 매칭** - 음식 국적과 리뷰 언어 일치 시 가중치 2배
3. **전체 평점** - 최근 6개월 리뷰에 높은 가중치 (Decay Factor)
4. **5대 권위 소스 교차 검증** - Google, TripAdvisor, Michelin, La Liste, Eater

---

## 6. 개발 로드맵 (Development Roadmap)

### Phase 1: MVP (핵심 로직 검증)
- 타겟: 파리, 도쿄 등 Tier 1 도시
- 기능: Vibe 점수 산출, 기본 동선 최적화, Google Maps 연동

### Phase 2: 미디어 & 자동화
- 기능: 실제 영상 기반 숏폼 자동 생성, 실시간 Reality Check(파업/날씨) 연동

### Phase 3: 수익화 & 확장
- 기능: 예약/결제 자동화 모듈 탑재, Tier 2/3 지역 AI 추론 로직 적용
