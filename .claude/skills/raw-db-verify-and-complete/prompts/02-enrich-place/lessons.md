# 02-enrich-place — 교훈

## 2026-05-17/18 Paris 검증에서 발견

### L1. 의심 행 = 첫 batch 0 에서 사용자 검수 필수
- batch 0 = 40 행 = 첫 응답 = 사용자 검수 = 가짜 행 (= 도시 외 / 이름 잘못) 발견
- 본 세션 = Paris 0 batch 검수 후 = 4 행 DELETE (= Palermo Buenos Aires, Michigan Avenue, Hollywood Blvd, Brest) + 2 행 gemini-fix (= St. Roch → Église Saint-Roch / Cascade Seattle → La Cascade Bois de Boulogne)
- 시정 = batch 0 = 응답 우선 사용자 검수 = 의심 행 처리 후 = 다음 batch 진행

### L2. id ASC = 카테고리 무관 (= 사용자 SSOT)
- 옛 = 카테고리별 batch 분리 (= 비효율)
- 새 = **id ASC** = 카테고리 무관 = 한 번에 모든 카테고리 보강
- 사용자 SSOT = "우리 카테고리는 의미 없음" (= 메모리 [[feedback_single_db_no_app_specific_columns]])

### L3. shopping = price_eur null 강제
- Gemini 가 shopping 행에 €30 같은 가짜 가격 응답 가능
- 시정 = post-process 에서 = `seedCategory='shopping'` 일 때 = priceEur 강제 null
- Paris 본 세션 = shopping 36 행 = price_eur NULL 강제 적용

### L4. COALESCE 옛 우선 vs 새 우선 (= 컬럼별 다름)
- 식별 데이터 (= name_en/주소/좌표/PID/이미지/리뷰수) = **COALESCE 옛 우선** (= 신뢰 보호)
- 가격 (price_eur) = **COALESCE 새 우선** (= 최신최우선 §14, 옛 GREATEST 폐기 2026-06-10)
- 카피 (summary_ko/editorial_summary) = **새 우선** (= Gemini 큐레이션 갱신)
- 태그 = **UNION** (= 누적)

### L5. Adaptive fallback = 40 → 30 → 20 → 10
- 본 세션 Paris = 12 batch 중 = 11 batch 40 성공 + 1 fallback (= batch 1 offset 80 = 30 으로 / batch 2 offset 110 = 10 으로 = 사실상 80 = 40 + 30 + 10 = 80)
- 응답 한계 8192 = 큰 batch 시 도시 컨텍스트 (= "한국 vlog 빈도" 등) 길이 따라 잘림 가능

### L6. name_en = 입력 그대로 (= 매칭 키)
- name_en 변경 시 = 다음 호출 = 매칭 깨짐 = 중복 발생
- 시정 = prompt 안 "변경 절대 X" 강조 + post-process 에서 = 응답 name_en != 입력 name_en 시 = 경고

### L7. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- 모든 batch raw JSON = `docs/raw/{city_id}/02-enrich-batch-{offset}.json` 저장
- 이력 = 사용자 검수 / 재호출 / diff 검증 가능

## 미해결 = 다음 도시 적용 시 주의

- [ ] **외곽 도시명 다른 행** (= Brest 같이 도시 외) = 응답 시 도시명 mismatch 검출 자동화
- [ ] **batch 0 의심 행** = 자동 검출 (= name_en 동음이의어 + 다른 도시 가능성) = AI 보조 가능
- [ ] **첫 batch 사이즈 동적 결정** = 도시 행 수 < 50 = batch 사이즈 = 전체 행 / 1 호출 가능