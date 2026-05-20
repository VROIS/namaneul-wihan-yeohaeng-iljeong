# 01-discover-6cats — 교훈

## 2026-05-17/18 Paris 검증에서 발견

### L1. 응답 8192 토큰 한계 (= 잘림 위험)
- 120 곳 × 평균 70 토큰 = 약 8400 토큰 → **MAX_TOKENS finishReason 빈발**
- 시정 = 잘림 복구 함수 (= `_call-config.md` parse) 필수 / 또는 = 카테고리별 호출 분할 검토
- 대안 = 카테고리 2 분할 (= 60 곳/호출 = 안전 한계 30-40 곳/호출 보다 다소 큼)

### L2. shopping 카테고리 = price_eur 강제 NULL
- Gemini 가 shopping 에 1인당 가격 추정 (= €30 등) 응답 가능 → **무의미 + 환각**
- 시정 = post-process.ts 에서 = `if (cat === 'shopping') priceEur = null` 강제 가드
- 헌법 §14 + §15 부합 (= 사용자 SSOT)

### L3. day_zone 기준 = 도심 10km (= 사용자 SSOT)
- 옛 = 100km 단일 (= 모두 도심으로 처리)
- 새 = **core ≤10km / outskirt 10-100km** (= 사용자 명시 "도심 좌표 + 우편번호 75xxx 기준")
- 효과 = AG4 동선 계산 시 = outskirt 행 = day 2+ day-trip slot 으로 분리

### L4. seed_category enum = 8 종 (= bts_venue 포함, restaurant 별도)
- 본 prompt = 6 카테고리만 발굴 (= restaurant 제외)
- restaurant = `04-outskirt-restaurant` + `03-downtown-restaurant` 별도 prompt
- bts_venue = `BTS_VENUES_*` 마이그 별도 (= 영구 컴포넌트 외)

### L5. 한국 여행자 popularity 우선 (= Western ranking 아님)
- 사용자 SSOT 명시 = "한국 인스타/블로그/유튜브 트렌드 기준"
- Gemini 응답 시 = 한국어 키워드 (= 인스타 성지, vlog 빈도) 매번 강조
- 검증 = 응답 selection_reason_ko 안에 = 한국 컨텍스트 (= 인스타/블로그/유튜브) 단어 = 90% 이상 포함

### L6. 1 도시 1 호출 = 토큰 절약
- 옛 일부 AI = 카테고리별 6 호출 = $0.012 (= 6 × $0.002)
- 새 = 1 호출 통합 = $0.002 (= 6 배 절약 / 단 = 8192 위험)
- 결정 = **1 호출 우선** + 잘림 시 카테고리 분할 fallback

### L7. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- 모든 호출 = `docs/raw/{city_id}/01-discover-6cats.json` 저장
- 이력 = 재호출 (= 새 Gemini 모델 변경 시) = diff 비교 가능
- 보관 X 시 = 산출물 추적 불가 = AI 환각 검증 불가

## 미해결 = 다음 도시 적용 시 주의

- [ ] **잘림 빈도 측정** = 신규 도시별 = MAX_TOKENS 빈도 = 만약 50% 이상 = 카테고리 분할 fallback 영구화
- [ ] **address 정확도** = Gemini 가 종종 = 우편번호 누락 / 가짜 번지 = TS 검증 단계 (= Step 2 enrich) 에서 비교
- [ ] **rank 1-20 신뢰도** = Gemini 가 한국 popularity 기준 모름 = 본 모델 약점 = WK 트래픽 / 네이버 블로그 빈도 등 보조 데이터 검증 가능