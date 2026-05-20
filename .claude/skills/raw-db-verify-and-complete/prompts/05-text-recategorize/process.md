# 05-text-recategorize — 필수 과정

## 호출 흐름

```
[입력] city_id
   ↓
1. 활성 행 SELECT
   = WHERE city_id = $1
   AND NOT (phase_tags && ARRAY['archived-*'])
   AND summary_ko IS NOT NULL OR editorial_summary IS NOT NULL
   ↓
2. batch 분할 (= 100 곳 / batch = ~6500 토큰 안전)
   ↓
3. 각 batch = prompt 치환 + Gemini 호출
   ↓
4. 응답 raw = docs/raw/{city_id}/05-text-recategorize-batch-{offset}.json
   ↓
5. 모든 batch 통합 → 정정 후보 list 작성
   ↓
6. 사용자 cc2 검수 단계 (= 필수 = AI 자율 트랜잭션 X)
   ↓
7. post-process.ts = 사용자 명시 후 트랜잭션 UPDATE (= rank 자동 재할당)
```

## Batch 사이즈 = 100 곳 (= 본 세션 검증)

- 1 행 = id + current_cat + name + summary_ko + editorial_summary + address = ~100 토큰 입력
- 응답 = 정정 후보만 = 추정 10-30 행 / 100 = 약 500-1500 토큰
- 100 곳 / batch = 입력 ~10000 + 출력 ~1500 = 안전 (= 8192 출력 한계 이하)

## 사용자 cc2 검수 (= 필수)

= **AI 자율 트랜잭션 X**:
1. AI = 정정 후보 list = 사용자에게 보고 (= 표 형식)
2. 사용자 = 검토 + 결정 (= 옵션 = 전체 적용 / 일부 적용 / 거부)
3. 사용자 명시 후 = post-process.ts 트랜잭션 실행

= 본 세션 (= 2026-05-19) 패턴 = "cc2" 옵션 = 전체 read 완료 후 = 일괄 보고

## 트랜잭션 실행 (= post-process.ts)

```sql
BEGIN;
-- 카테고리 변경 + rank 자동 재할당 (= 새 카테고리 MAX+1)
UPDATE place_seed_raw
SET seed_category = $new,
    rank = (SELECT COALESCE(MAX(rank),0)+1 FROM place_seed_raw
            WHERE city_id=$cityId AND seed_category=$new)
WHERE id = $id;
-- ... 47 행 반복
COMMIT;
```

## 검증 조건

| 항목 | 기준 |
|---|---|
| 입력 행 수 | 활성 행 수와 일치 |
| 응답 confidence | 모두 ≥ 0.7 |
| 응답 suggested_category | 7 종 중 하나 |
| 사용자 명시 전 = UPDATE 실행 | 0 (= 자율 트랜잭션 금지) |
| 트랜잭션 = BEGIN/COMMIT | 원자성 |
| rank 충돌 | 0 (= MAX+1 자동) |