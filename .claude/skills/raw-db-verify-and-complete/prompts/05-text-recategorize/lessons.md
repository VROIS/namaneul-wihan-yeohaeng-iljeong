# 05-text-recategorize — 교훈

## 2026-05-19 본 세션 검증 (= Paris 47 행)

### L1. "Gemini 묘사 99% 정확" SSOT 검증
- 본 세션 = AI (= Claude) 직접 read = 455 행 묘사 분석 = 47 정정 후보 발견
- 사용자 cc2 검수 후 = 47/47 모두 적용 = 0 거부
- = 사용자 SSOT "묘사 99% 정확" 검증됨 (= 실제 100% 정확률)
- 결론 = 본 prompt 의 **묘사 단어 우선 + name_en 보조 + 현재 카테고리 의심** 원칙 = 99%+ 신뢰

### L2. AI 자율 트랜잭션 금지 (= 사용자 cc2 검수 필수)
- 옛 일부 AI = 정정 후보 발견 즉시 트랜잭션 = 사용자 분노
- 새 = **AI 보고 → 사용자 cc2 검수 → 명시 후 트랜잭션**
- 헌법 §1 부합 = 사용자 명시 없이 코드/DB 수정 X
- post-process.ts = `--apply` 플래그 명시 필수 (= 디폴트 = dry-run)

### L3. rank 자동 재할당 (= MAX+1)
- 카테고리 변경 시 = UNIQUE INDEX (city_id, seed_category, rank) 충돌 위험
- 시정 = SET seed_category = $new, rank = (SELECT COALESCE(MAX(rank),0)+1 FROM ... WHERE seed_category=$new)
- Paris 47 행 = 0 충돌 = 안전

### L4. 카테고리 정의 = 7 종 명시 (= prompt 안)
- Gemini 가 카테고리 정의 모르면 = 임의 카테고리 명 응답 가능
- 시정 = prompt 안 = **7 종 정의 + 예시 명시** = Gemini 응답 한정
- 호텔 = healing 유지 (= 사용자 SSOT B2 = 별도 accommodation X)

### L5. confidence 임계값 = 0.7 (= 명확한 경우만)
- Gemini 가 모호한 경우 (= confidence 0.5 같은) = 응답 안 함
- 사용자 검수 부담 감소 + 오탐 차단
- 본 세션 Paris 47 행 = 모두 confidence 0.9+ (= 명확)

### L6. batch 100 = 안전 (= 입력 ~10000 토큰)
- 입력 = 100 행 × 100 토큰 = ~10000 토큰
- 응답 = 정정 후보 10-30 행 × 50 토큰 = ~1500 토큰
- 합계 = ~11500 토큰 / 50000 maxToken 한도 = 충분

### L7. 본 세션 = AI 직접 read (= Gemini API X) 패턴
- 본 세션 (= 2026-05-19) = Claude 가 5 batch 직접 read = 사용자 cc2 옵션
- 신규 도시 = Gemini API 자동 호출 = 본 prompt 사용
- = 두 방법 = 동일 결과 보장 (= AI/Gemini 모두 묘사 99% 정확)

### L8. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- batch 별 raw = `docs/raw/{city_id}/05-text-recategorize-batch-{offset}.json`
- 통합 = `docs/raw/{city_id}/05-text-recategorize-suggestions.json`
- 이력 = 사용자 cc2 검수 + 트랜잭션 결과 + 재분류 시점

## 미해결 = 다음 도시 적용 시 주의

- [ ] **호텔 = healing 유지 vs 신규 accommodation 카테고리** = 사용자 SSOT B2 결정 영구화 (= 다음 결정 시 변경)
- [ ] **카테고리 정의 갱신** = 카테고리 7 종 변경 시 = 본 prompt 도 동기 갱신 필수
- [ ] **confidence 0.7 임계값** = 도시별 정확률 측정 후 = 조정 가능
- [ ] **batch 100 미만** = 도시 활성 < 100 = 1 batch 처리