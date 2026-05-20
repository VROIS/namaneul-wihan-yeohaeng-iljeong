# 04-outskirt-restaurant — 교훈

## 2026-05-18 Paris 검증에서 발견

### L1. 8192 토큰 한계 = 50 곳 위험 = 2 호출 분할 필수
- 옛 = 1 호출 50 곳 시도 = 10528 토큰 = 잘림 = `MAX_TOKENS finishReason`
- 새 = **2 호출 30 LOW + 30 MID** = 각 ~6500 토큰 = 안전
- 시정 = `${EXCLUDE_LIST}` = 호출 2 prompt 에 호출 1 응답 list 명시 = 중복 방지

### L2. DB 트리거 v2 필수 (= 1 순위 = 주소+이름 9 조합)
- 옛 트리거 = 주소 단독 매칭 = 신규 INSERT 12 행 = "address match exists" 차단
- 시정 = `place_seed_raw_prevent_dup` 함수 = **주소 + 이름 9 조합 동시** = 정확 매칭만 차단
- Paris 본 세션 = 트리거 v2 적용 후 = 60 inserted + 48 updated = errors 0

### L3. OUTSKIRT_HINTS = 도시별 day-trip 명소 list 필수
- 옛 = HINTS 없이 호출 = 너무 외곽 (= 70-100km) 추천 빈발 = 비현실 day-trip
- 새 = HINTS 명시 (= Versailles, Disneyland 등) = 한국인 실제 day-trip 명소 우선 추천
- 도시별 HINTS 작성 책임 = 사용자 또는 검증된 명소 DB

### L4. day_zone 강제 "outskirt"
- 옛 = Gemini 가 자체 판단 = "outskirt" / "core" 혼합 응답
- 새 = prompt 안 = `day_zone: "outskirt" (= 강제)` 명시 + post-process 가드
- 효과 = AG4 동선 계산 시 = day 2+ day-trip slot 으로 자동 분리

### L5. price_eur_max = 상한가 (= GREATEST 정책 부합)
- 옛 = `estimated_price_eur` = 평균값 = GREATEST 정책과 불일치
- 새 = `price_eur_max` = 상한가 = 사용자 SSOT [[feedback_price_max_always]] 부합
- 효과 = AG2 식당 풀 선택 시 = 사용자 신뢰 보호 (= 더 비싼 쪽 = 안전)

### L6. shortform_ko = 한국 슬랭 사용 (= "프사각", "본전 뽑음")
- 옛 = 영어 + 한국어 혼용 = 어색한 카피
- 새 = **순수 한국어 슬랭 + 25 자 이내** = 인스타 후킹 효과
- 본 세션 검증 = "엘렌 라돌로주 외길 11대 → 본전 뽑는 정통 비스트로" 등

### L7. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- 호출 1 (= LOW) = `docs/raw/{city_id}/04-outskirt-restaurant-low.json`
- 호출 2 (= MID) = `docs/raw/{city_id}/04-outskirt-restaurant-mid.json`
- 이력 = 재호출 (= 가격 변동 / Gemini 모델 변경) 시 diff 비교

## 미해결 = 다음 도시 적용 시 주의

- [ ] **OUTSKIRT_HINTS 자동 생성** = AI 가 도시명만으로 day-trip 명소 list 자동 생성 (= 2 단계 호출 = 1 차 hints + 2 차 식당)
- [ ] **distance_km > 100 = 검증 필요** = Gemini 가 100km 초과 응답 시 = 자동 reject
- [ ] **EXCLUDE_LIST 길이** = 30 곳 × 80 자 = 약 2400 자 = prompt 길이 증가 = 검증 필요 (= 호출 2 토큰 영향)
- [ ] **저렴/합리적 가격 기준** = 국가별 다름 (= Paris LOW = €30 / Tokyo LOW = ¥5000 등) = 도시별 tier 가격 조정 필요