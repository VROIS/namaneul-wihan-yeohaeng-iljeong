# 08-wk-image-fill — 교훈

## 2026-05-19 Paris 검증 (= 84 dry-run → 28 UPDATE)

### L1. 좌표 10m = 사용자 SSOT (= 100m 100 번 거부)
- 옛 일부 AI = 100m radius 사용 = 도심 지역 (= Paris 75001 등) = 오매칭 多 (= 같은 광장 안에 다른 명소 = 다른 행)
- 새 = **10m 강제** (= 사용자 명시 100 번 = "10미터 내외라고 100 번 쯤 알려줌")
- SPARQL = `wikibase:radius "0.01"` (= km 단위 = 10m)
- 효과 = Paris 84 행 = 도심 명소 = 정확 매칭

### L2. 식당/어드벤처 = WK 오매칭 多 = 제외 (= 사용자 SSOT)
- Wikidata = 식당 한정 정보 부족 + 어드벤처 (= 영화관/액티비티) = 좌표는 있지만 이미지 X
- adventure WK 검증 = 1/5 정확 = 20% = 너무 낮음
- 새 = `seed_category NOT IN ('restaurant', 'adventure')` 강제
- 식당 이미지 = TS Enterprise PhotoMedia 만 (= 사용자 SSOT [[feedback_wikidata_first_not_google]])

### L3. TOP 20 제외 = 이미 발굴 (= rank 21+ / NULL 만)
- rank 1-20 = `01-discover-6cats` 응답 = 이미 처리됨 (= 또는 TS 이미 호출됨)
- rank 21+/NULL = 후속 발굴 = WK 보강 대상
- 효과 = 중복 API 호출 방지 + 비용 0 (= WK 무료)

### L4. score 임계 ≥5 = TRUST (= 사용자 SSOT 2026-05-19)
- score 5 = 좌표 10m (+3) + 이름 부분 일치 (+2) = 5
- score 7 = 좌표 10m (+3) + 이름 완전 일치 (+4) + 이미지 (+1) - 카테고리 (+1) = 9
- TRUST 비율 = Paris 30/84 = 35% (= 사용자 기대)

### L5. VERIFY = 2 차 검증 (= AI 또는 Gemini 호출 가능)
- score 3-4 = 모호 = 자동 적용 X
- 처리 = (1) 사용자 cc2 검수 / (2) Gemini 추가 prompt (= "이 행과 이 Wikidata 후보 = 같은 장소인가?")
- Paris 12 VERIFY = 사용자 검수 시 = 일부만 UPDATE (= AI 오패칭 위험)

### L6. Wikimedia UA 필수 (= AOS Glide 차단 우회)
- UA = `TRIPIS/1.0 (contact@vibetrip.app) Expo/54`
- 메인앱 BTS 1주일 검증 (= `client/lib/wikimedia-image.ts`) = 필수
- UA 없으면 = SPARQL OK 지만 = Wikimedia 이미지 fetch 시 403

### L7. image_url 기존 NULL 만 UPDATE (= 덮어쓰기 금지)
- 옛 upsertPlace 정책 = COALESCE 옛 우선 (= image 보존)
- 본 prompt = 직접 UPDATE = WHERE image_url IS NULL (= 옛 이미지 덮어쓰기 X)
- 효과 = TS 이미지 (= 더 신뢰) 보존 + WK = 빈 행만 채움

### L8. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- 산출물 = `docs/raw/{city_id}/08-wk-image-fill-candidates-{YYYY-MM-DD}.json`
- 이력 = 같은 도시 = 재호출 시 = 옛 NULL 채워진 후 = 새 NULL 행만 추가 처리
- AI 검증 시 = QID 추적 = 같은 이미지 후보 = 옛 분석 비교 가능

## 미해결 = 다음 도시 적용 시 주의

- [ ] **VERIFY 행 = Gemini 자동 검증 prompt** = 별도 prompt 추가 가능 (= 본 폴더 안 옵션)
- [ ] **score 임계** = 도시별 = TRUST 비율 측정 후 조정 (= Paris 35% = 적정)
- [ ] **Wikimedia 이미지 URL = bucket 정규화** = 메인앱 `wikimedia-image.ts` 의 `WIKIMEDIA_BUCKETS` 와 일치 (= `[20,40,60,120,250,330,500,960,1280,1920,3840]`)
- [ ] **rate limit** = Wikidata SPARQL = 동시 호출 제한 = run.ts 안 await 직렬 처리 (= 안전)