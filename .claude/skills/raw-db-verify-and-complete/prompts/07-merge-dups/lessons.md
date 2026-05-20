# 07-merge-dups — 교훈

## 2026-05-18 Paris 검증 (= 27 그룹 → 15 archive + 좌표 2 그룹 = 17 행)

### L1. 사용자 cc2 검수 = AI 자율 archive 금지 (= 헌법 §1)
- 옛 일부 AI = dry-run 즉시 archive = 사용자 분노 (= 잘못 archive 시 복원 어려움)
- 새 = **dry-run → 사용자 검수 → 명시 후 archive** (= --apply-tiers / --apply-groups)
- 디폴트 = dry-run only

### L2. keep 우선순위 = PID > 상세 이름 > 풍부도 > rank (= 사용자 SSOT [[feedback_dedup_keep_priority]])
- 옛 = 단순 풍부도 (= image+desc 채워진 행) 만 = BAD 거꾸로 통합 위험 (= name_en="Paris" 같은 광역 행이 풍부 = keep 잘못 선정)
- 새 = **PID 보유 = 최우선** (= TS 검증 데이터 = 가장 신뢰)
- Paris 검증 = 15 그룹 모두 keep 정확 선정

### L3. 트리거 v2 = 1 순위 = 주소 + 이름 9 조합 동시 (= 헌법 §14 v2)
- 옛 트리거 = 주소 단독 매칭 = 광역 주소 (= Paris) 행 = 다른 행 INSERT 차단
- 새 트리거 = **주소 + 이름 9 조합 동시** = 정확 매칭만 차단
- = 04-outskirt-restaurant 60 INSERT 시 = 12 행 = 옛 트리거 차단 → 새 트리거 = 0 차단

### L4. 좌표 10m + cross-category 의심 (= 본 세션 5-18 = 2 그룹)
- 같은 좌표 + 다른 카테고리 = 의심 (= attraction 행과 hotspot 행이 같은 명소일 가능성)
- Paris 검증 = Palais Royal (= attraction id 72732 / hotspot id ?) / Concorde Retro Tour (= adventure id 62047 / heritage id ?)
- 처리 = 사용자 검수 후 = 카테고리 결정 + archive

### L5. BTS 예외 = 분리 유지
- BTS 행 = bts_venue / bts_merch_store / bts_army_zone = 정상 카테고리 (= 일반 카테고리와 분리)
- 같은 좌표일지라도 archive X (= 사용자 SSOT)
- 시정 = 매칭 시 = seed_category LIKE 'bts_%' 행은 = cross-category 매칭 제외

### L6. 그룹 score 계산 (= 옵션 = AI 자동 archive 우선순위)
- 본 prompt 는 = score X (= tier 만 사용)
- 추가 가능 = score = 매칭 단계 (= 0/1/2/3 high vs 4 low) + 풍부도 + PID 보유 = 우선순위
- Paris 검증 = tier 0/1/2/3 = 모두 자동 적용 / tier 4 = 사용자 검수 후

### L7. 옛 archive 행 = phase_tags 누적
- Paris 5-15 + 5-18 + 5-19 = 3 차례 archive
- 각 차례 = `archived-merge-{YYYY-MM-DD}` 태그 추가 = 누적
- 효과 = 옛 archive 행 = 어느 차례에 archive 됐는지 = 추적 가능

### L8. 응답 raw 보관 = 사용자 SSOT 2026-05-20
- dry-run groups = `docs/raw/{city_id}/07-merge-dups-groups-{YYYY-MM-DD}.json`
- (옵션) Gemini 의심 그룹 분석 = `docs/raw/{city_id}/07-merge-dups-decisions-{YYYY-MM-DD}.json`
- 이력 = 매번 재실행 시 = 새 그룹 발견 (= 카테고리 재분류 후) 가능

## 미해결 = 다음 도시 적용 시 주의

- [ ] **광역 행 (= name="Paris" 등)** = 옛 발굴 잔재 = batch 0 검수에서 DELETE (= 5-17 패턴)
- [ ] **bts_* 카테고리 제외 패턴** = 5 단계 매칭 시 = `WHERE seed_category NOT LIKE 'bts_%'` 적용 검토
- [ ] **cross-category 좌표 10m** = AI 가 자동 판단 가능 (= 묘사 분석으로 같은 장소 vs 다른 장소)
- [ ] **N × N 매칭 = O(N²)** = 활성 1000 행 = 100만 비교 = 메모리 부담 = 인덱스/공간 분할 검토