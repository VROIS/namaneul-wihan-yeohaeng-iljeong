# 구현 계획 — 5대 슬롯 필수요소 + 5대 가격원칙

> [!IMPORTANT]
> 코드 수정 전 사용자 승인 필수

---

## A. 슬롯 5대 필수요소 (DB 감사 결과)

| # | 필수요소 | 현재 상태 | 데이터 소스 | 문제점 |
|:--|:---------|:----------|:------------|:-------|
| 1 | **장소명** | ✅ 작동 | `name` + `nameKo` (line 602) | 없음 |
| 2 | **이미지 1장+** | ✅ 작동 | AG3 `resolvePlaceImage()`: 셀럽인스타→인스타→구글사진 | 36K 인스타 사진이 도시별 미분류 |
| 3 | **선정이유** | ⚠️ 부분 | `nubiReason` (line 605) + `nubiEvidenceUrl` (line 607) | DB 4500건 매칭 작동하나 커버율 미확인 |
| 4 | **가격정보** | ❌ 문제 | `estimatedPriceEur` (Gemini 추측, line 449) | 식당: MEAL_BUDGET으로 덮어씀 (line 600) |
| 5 | **구글맵 링크** | ✅ 작동 | `googleMapsUrl` (AG3 line 359) | 없음 |

### 이미지 우선순위 (AG3 `resolvePlaceImage`)
```
1순위: 셀럽 인스타 이미지 (celebrityImageMap)
2순위: 인스타 사진 (instagramPhotoUrls[0])
3순위: 구글 사진 (photoUrls[0])  
4순위: API 사진 (fallback)
```
> 36K 인스타 사진: `places.instagram_photo_urls` 컬럼에 있으나 도시별 분류 필요

### nubiReason 우선순위 (pipeline-v3 `generateNubiReasonV2`)
```
Priority 0: placeNubiReasons DB (MCP 2단계 수집 4500건)
Priority 0b: place_seed_raw.nubi_reason
Priority 1: 셀럽 방문 실시간 검색
Priority 2: 유튜버 18인 DB
Priority 3: 네이버 블로그 건수
Priority 4: 패키지투어 4사
Priority 5: 여행앱 (마이리얼트립/클룩)
Priority 6: 구글 리뷰 수
```

---

## B. 5대 가격적용 원칙 → 코드 변경

### 원칙 1+2: Gemini 가격 최우선, 0=무료 유지

**[pipeline-v3.ts:600](file:///c:/Users/SY%20Lee/Desktop/nubi-clean/server/services/agents/pipeline-v3.ts#L600)** 수정:
```diff
-mealPrice: isMeal ? (s.gPlace.type === 'lunch' ? mealBudget.lunch : mealBudget.dinner) : undefined,
+mealPrice: isMeal
+  ? (s.gPlace.estimatedCostEur > 0
+      ? s.gPlace.estimatedCostEur
+      : (s.gPlace.type === 'lunch' ? mealBudget.lunch : mealBudget.dinner))
+  : undefined,
```

### 원칙 3: 유료만 DB 검증, 최신값 노출 (= COALESCE 새우선, 옛 "비싼 쪽" 폐기 2026-06-10)

**[pipeline-v3.ts:449](file:///c:/Users/SY%20Lee/Desktop/nubi-clean/server/services/agents/pipeline-v3.ts#L449)** 수정:
```diff
-estimatedPriceEur: gPlace.estimatedCostEur || 0,
+estimatedPriceEur: resolvePrice(gPlace.estimatedCostEur, enrichedPlace),
```

```typescript
function resolvePrice(geminiPrice: number, dbPlace: any): number {
  if (geminiPrice === 0) return 0;  // 원칙2: 무료 유지
  if (!dbPlace?.priceLevel) return geminiPrice;  // DB 없으면 Gemini
  // 원칙3: 최신최우선 (= Gemini 최신값 우선, 옛 "비싼 쪽 Math.max" 폐기 2026-06-10)
  return geminiPrice;  
}
```

### 원칙 4: 투어 패키지 가격 차단

`resolvePrice`에서 `placePrices.source`가 `viator`/`tour` 이면 무시.

### 원칙 5: priceLevel → 2026 실제 물가

```typescript
function priceLevelToEur(level: number, meal?: 'lunch'|'dinner'): number {
  const map: Record<number, {lunch:number, dinner:number, entrance:number}> = {
    0: {lunch:0, dinner:0, entrance:0},
    1: {lunch:12, dinner:18, entrance:8},
    2: {lunch:22, dinner:38, entrance:15},
    3: {lunch:40, dinner:70, entrance:25},
    4: {lunch:65, dinner:120, entrance:50},
  };
  if (meal) return map[level]?.[meal] ?? 0;
  return map[level]?.entrance ?? 0;
}
```

---

## C. 수정 파일 목록 (최소 침습)

| 파일 | 변경 | 라인 |
|:-----|:-----|:-----|
| `pipeline-v3.ts` | 식당 가격 덮어쓰기 제거 | 600 |
| `pipeline-v3.ts` | 유료 명소 DB 검증 + MAX | 449 |
| `pipeline-v3.ts` | `resolvePrice()` 함수 추가 | 신규 |
| `pipeline-v3.ts` | `priceLevelToEur()` 함수 추가 | 신규 |

---

## D. 검증 계획
1. 파리 3일 일정 → 트로카데로(€0), 루브르(€32↑), 식당(priceLevel 반영)
2. 모든 슬롯: name✅ image✅ nubiReason✅ price✅ googleMapsUrl✅
