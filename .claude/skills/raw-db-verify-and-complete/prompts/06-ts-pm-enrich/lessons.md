# 06-ts-pm-enrich — 교훈

## 2026-05-20 신규 작성 (= 사용자 SSOT [[feedback_place_api_verified_pattern]] + [[reference_google_places_2026]])

### L1. Enterprise SKU only (= 헌법 §15 = Atmosphere 33 필드 금지)
- Atmosphere = $40/1K (= Enterprise $35/1K 대비 14% 추가)
- 33 필드 = editorialSummary / reviews / generativeSummary / dineIn / takeout / delivery 등
- 시정 = `validateFieldMask()` 단일 진입점 강제 = 우회 절대 X
- 위반 시 = $4 폭탄 (= Paris 200 행 × $0.005 추가)

### L2. languageCode='ko' 필수
- 옛 = languageCode 없음 = displayName.text = 영어 또는 현지어
- 새 = `languageCode: 'ko'` = displayName.text = 한국어 ("에펠탑")
- 효과 = name_ko 자동 채움 + Gemini 호출 재검증([[reference_user_ssot_algorithm]])

### L3. textQuery 안 좌표 명시 X (= locationBias null)
- 옛 일부 AI = `locationBias = circle around (lat,lng)` = LLM 노이즈 = 매칭 실패
- 새 = **locationBias 안 줌** + textQuery = "${name_en} ${address}" 만
- 사용자 SSOT [[feedback_place_api_verified_pattern]] = 8/8 100% 검증 패턴

### L4. WK 우선 + TS 보조 (= 6 카테고리 vs 식당/어드벤처)
- heritage / hotspot / healing / attraction / shopping = **WK 우선** (= 08-wk-image-fill 무료)
- restaurant / adventure = **TS 우선** (= WK 오매칭 多)
- 본 06 = TS 만 = 식당/어드벤처 + 6 카테고리 TOP 20 (= 검증된 명소)

### L5. PhotoMedia = binary 다운 + Supabase Storage 업로드
- 옛 = Google 직접 URL = `https://maps.googleapis.com/.../photo?...` = 차단 빈발
- 새 = Google PhotoMedia (= $7/1K) → binary 다운 → **Supabase Storage 자체 호스팅**
- 효과 = AOS Glide / iOS 모두 CORS / UA 차단 없음
- bucket = `place-photos/` (= 사용자 SSOT [[reference_db_image_assets]])

### L6. priceRange.endPrice = COALESCE 새우선 (= 헌법 §14, 옛 GREATEST 폐기 2026-06-10)
- 옛 = priceLevel 1-4 = 사용자 SSOT §14 폐기 (= 너무 모호)
- 새 = `priceRange.endPrice.units` = €X 정확값 = COALESCE 새 우선(최신최우선)
- 예 = TS 응답 €50(최신) / DB 옛 €30 → COALESCE 새우선 = €50 적용(최신 TS 신뢰)

### L7. 무료 1K/월 한도 활용
- TS Enterprise = 무료 1K/월
- PhotoMedia = 무료 1K/월
- 신규 도시 = 1000 행 이하 = **$0**
- Paris 본 세션 추정 = 200 행 = 무료 한도 내

### L8. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- 산출물 = `docs/raw/{city_id}/06-ts-pm-enrich-candidates-{YYYY-MM-DD}.json`
- 이력 = 같은 도시 재호출 시 = 옛 ok 행 = SKIP 가능 (= 비용 절감)
- 옛 raw = `_old/` 이동 권장

## 미해결 = 다음 도시 적용 시 주의

- [ ] **textQuery name 정정 필요** (= no_match 행) = 사용자 cc2 검수 후 재호출
- [ ] **photo 다운 옵션** (= --photo) = $0.007/행 추가 = 사용자 명시 (= 디폴트 X)
- [ ] **응답 1 등 = 우리 행과 같은 장소 검증** = 거리 50m 이내 OR 이름 LOWER 일치 자동 가드 추가 검토
- [ ] **GOOGLE_PLACES_API_KEY** = api_keys DB 등록 필수
- [ ] **SUPABASE_SERVICE_ROLE_KEY** = .env 등록 필수 (= Storage 업로드용)