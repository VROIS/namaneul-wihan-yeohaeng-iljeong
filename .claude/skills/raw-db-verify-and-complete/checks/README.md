# checks/ — 정기 점검 + 감사 스크립트

> ⚠️ 사용자 SSOT 2026-05-20 = `prompts/` (= 발굴/보강 시 1 회 호출) 와 별개 = **정기 점검 = 데이터 품질 감사**

## 차이 (= prompts/ vs checks/)

| | prompts/ | checks/ |
|---|---|---|
| 호출 시점 | 발굴/보강 시 1 회 | 정기 (= cron 또는 수동) |
| 비용 | Gemini/TS 호출 비용 | 0 (= DB SELECT 만) |
| 산출물 | DB INSERT/UPDATE | 보고서 (= 의심 행 list) |
| 후처리 | upsertPlace v2 | 사용자 명시 후 = 시정 또는 폐기 |

## 점검 종류

| # | 파일 | 용도 | 출처 |
|---|---|---|---|
| 01 | [`01-coord-missing.ts`](01-coord-missing.ts) | 좌표 NULL 검출 | 사용자 SSOT 2026-05-20 |
| 02 | [`02-price-outlier.ts`](02-price-outlier.ts) | 가격 이상치 (= 카테고리 별 평균 대비 3 σ 초과) | 사용자 SSOT 2026-05-20 |
| 03 | [`03-outskirt-coverage.ts`](03-outskirt-coverage.ts) | 외곽 부족 진단 (= 도심 좌표 + 우편번호 분포) | 사용자 SSOT 2026-05-18 Paris Step 9 검증 |

## 호출

```bash
# 단일 도시
npx tsx .claude/skills/raw-db-verify-and-complete/checks/01-coord-missing.ts --city-id=19
npx tsx .claude/skills/raw-db-verify-and-complete/checks/02-price-outlier.ts --city-id=19
npx tsx .claude/skills/raw-db-verify-and-complete/checks/03-outskirt-coverage.ts --city-id=19

# 모든 도시
npx tsx .claude/skills/raw-db-verify-and-complete/checks/01-coord-missing.ts --all
```

## 산출물

= `docs/raw/{city_id}/_checks/{check-id}-{YYYY-MM-DD}.json`

= 사용자 cc2 검수 후 = 시정 = `prompts/0X-*/run.ts` 재호출 (= 예 02 enrich = 좌표 NULL 행 보강)