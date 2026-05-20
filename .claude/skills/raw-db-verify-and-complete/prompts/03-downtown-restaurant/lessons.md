# 03-downtown-restaurant — 교훈

## 2026-05-20 신규 작성 (= 04-outskirt 패턴 + MEAL_BUDGET 4 tier 대응)

### L1. MEAL_BUDGET 매트릭스 직접 연동
- 사용자 SSOT 2026-05-19 = MEAL_BUDGET 4:6 split (= Economic/Reasonable/Premium/Luxury)
- 본 prompt = **4 tier 분할 호출** = MEAL_BUDGET min/max 범위와 정확히 일치
- 효과 = AG2-DB SELECT 시 = budget WHERE 필터 = 발굴 시점부터 격리 보장
- Paris 검증 (= 2026-05-19) = 식당 풀 = Economic 59 / Reasonable 118 / Premium 20 / Luxury 8 = 깔끔 격리

### L2. 4 호출 분할 = 토큰 안전
- 1 호출 120 곳 = 19000 토큰 = MAX_TOKENS 빈발 위험
- 4 호출 30 곳씩 = 각 ~5500 토큰 = 안전 (= 8192 한계 이하)
- 비용 ≈ $0.012 (= 4 × $0.003) = 토큰 절약 vs 6 카테고리 1 호출 = 비슷

### L3. EXCLUDE_LIST 누적 (= 호출 N = 호출 1 ~ N-1 합)
- 04-outskirt 와 다른 점 = 04 = 2 호출 (= LOW + MID) / 03 = 4 호출 (= MEAL_BUDGET 4 tier)
- 호출 4 (= LUXURY) = EXCLUDE_LIST = 호출 1+2+3 응답 = 90 곳 list
- 토큰 영향 = 90 × 80 자 = 7200 자 추가 = 호출 4 prompt 입력 토큰 ~10000 = 약간 부담
- 시정 = name_en + 우편번호 만 명시 (= address 풀이 X) = EXCLUDE_LIST 압축

### L4. day_zone "core" 강제 (= 04 outskirt 와 반대)
- 04 = day_zone "outskirt" / 03 = day_zone "core"
- 효과 = AG4 동선 계산 시 = day 1 walkable / day 2+ day-trip 자동 분리

### L5. Premium/Luxury 응답 다양성 보장
- Premium €61-180 = 미슐랭 빕구르망 + 한국 vlog 인기 다이닝
- Luxury €181+ = 미슐랭 1+ 스타 = 도시별 약 20-50 개 = 30 곳 응답 시 보조 카테고리 필요
- 시정 = LUXURY 응답 미달 시 (= 20 곳 이하) = 사용자 검수 후 = LUXURY 응답 부족 = OK
- Paris Luxury = 8 곳 = 자연스러운 분포 (= 미슐랭 1+ 스타 = 도시별 한정)

### L6. 호출 1 = 첫 batch 검수 (= 02-enrich-place 와 동일)
- 호출 1 = ECONOMIC = 30 베이커리/크레페리/패스트
- 의심 행 = 한국 분식 (= 김밥/떡볶이 = 진짜 존재하는 한국 식당) vs 가짜 한국명 = 사용자 검수 가능

### L7. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- 4 호출 = 각 tier 별 raw JSON = `docs/raw/{city_id}/03-downtown-restaurant-{tier}.json`
- 이력 = AG2 budget 풀 재검증 / Gemini 모델 변경 시 diff 비교

## 미해결 = 다음 도시 적용 시 주의

- [ ] **국가별 가격 기준 보정** = Tokyo Economic = ¥3000 / Madrid Economic = €15 등 = 도시별 tier 범위 조정 필요할 수 있음
- [ ] **MEAL_BUDGET 매트릭스 갱신 시** = 본 prompt 의 TIER_SPEC 도 동기 갱신 필수 (= 단일 SSOT 보호)
- [ ] **호출 4 LUXURY 응답 부족** = 도시별 미슐랭 1+ 스타 < 30 = 응답 미달 = OK 처리
- [ ] **EXCLUDE_LIST 압축** = 90 곳 list = 토큰 영향 측정 필요