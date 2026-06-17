# upsertPlace v2 변경 가이드 (= 헌법 §14 v2 = 사용자 SSOT 2026-05-18)

## 변경 배경

**사용자 SSOT (= 본 세션 발견)**:
> "광역 주소 (= Disney Village 복합 상가) = 같은 주소 = 이름으로 분류 = 다른 식당이면 다른 행 유지"
> "**모든 정보는 최신 것을 덮어씀** = 이 원칙이 모든 카테고리 적용"

## 변경 2 종

### 1. 매칭 1 순위 변경 = 풀 주소 → 풀 주소 + 이름 9 조합 동시

**위치** = `server/services/place-upsert.ts:108-122`

**v1 (옛)**:
```ts
// 1순위 = 풀 주소 100%
if (!match && p.address) {
  const np = normAddr(p.address);
  if (np.length >= 20) {
    match = candidates.find((c) => c.address && normAddr(c.address) === np);
    if (match) matchedBy = 'address';
  }
}
```

**v2 (새)**:
```ts
// 1순위 = 풀 주소 100% + 이름 9 조합 한 쌍 일치 동시 (= 사용자 SSOT 2026-05-18)
// = 광역 주소 (= Disney Village 복합 상가) = 같은 주소 다른 식당 = 별도 행 보존
if (!match && p.address) {
  const np = normAddr(p.address);
  if (np.length >= 20) {
    const normName1 = (s: string | null | undefined) => (s || '').trim().toLowerCase();
    const pNames1 = [normName1(p.nameEn), normName1(p.nameLocal), normName1(p.nameKo)].filter(Boolean);
    match = candidates.find((c) => {
      if (!c.address || normAddr(c.address) !== np) return false;
      if (pNames1.length === 0) return true; // 입력 이름 X = 주소만 매칭 (= 옛 동작 호환)
      const cNames1 = [normName1(c.nameEn), normName1(c.nameLocal), normName1(c.nameKo)].filter(Boolean);
      return pNames1.some((pn) => cNames1.includes(pn));
    });
    if (match) matchedBy = 'address';
  }
}
```

### 2. UPDATE 정책 = COALESCE 옛 우선 → 새 우선

**위치** = `server/services/place-upsert.ts:151-180`

**v1 (옛)**:
- 검증된 식별 데이터 (name/주소/좌표/PID/이미지/리뷰수) = `COALESCE(<old>, <new>)` = 옛 우선
- 가격 = `GREATEST(old, new)` = 비싼 쪽
- 카피 (summary_ko/editorial_summary) = `COALESCE(<new>, <old>)` = 새 우선
- tags = UNION

**v2 (새)**:
- **모든 필드** = `COALESCE(<new>, <old>)` = 새 값 있으면 새 / 없으면 옛 유지
- tags = UNION (= 변경 X)

```sql
UPDATE place_seed_raw SET
  name_en             = COALESCE(${p.nameEn}, name_en),
  name_ko             = COALESCE(${p.nameKo}, name_ko),
  name_local          = COALESCE(${p.nameLocal}, name_local),
  latitude            = COALESCE(${p.latitude}::real, latitude),
  longitude           = COALESCE(${p.longitude}::real, longitude),
  address             = COALESCE(${p.address}, address),
  google_place_id     = COALESCE(${p.googlePlaceId}, google_place_id),
  google_review_count = COALESCE(${p.googleReviewCount}::integer, google_review_count),
  google_primary_type = COALESCE(${p.googlePrimaryType}, google_primary_type),
  google_maps_uri     = COALESCE(${p.googleMapsUri}, google_maps_uri),
  image_url           = COALESCE(${p.imageUrl}, image_url),
  image_attribution   = COALESCE(${p.imageAttribution}, image_attribution),
  price_eur           = COALESCE(${p.priceEur}::real, price_eur),
  editorial_summary   = COALESCE(${p.shortformKo}, editorial_summary),
  summary_ko          = COALESCE(${p.selectionReasonKo}, summary_ko),
  day_zone            = COALESCE(${p.dayZone}, day_zone),
  distance_km_from_center = COALESCE(${p.distanceKmFromCenter}::real, distance_km_from_center),
  category_tags       = (... UNION ...),
  phase_tags          = (... UNION ...),
  image_updated_at    = NOW()
WHERE id = ${match.id}
```

## 영향 분석

| 영역 | 영향 |
|---|---|
| 메인앱 = AG3 = `upsertPlace` 호출 | ✓ 새 정책 적용 = Gemini 추천 = 새 정보 = 옛 행 덮어쓰기 |
| 시드 = `scripts/seed-gemini.mjs` 등 | ✓ 새 정책 = 신규 시드 = 옛 검증 행 덮어쓰기 |
| 본 스킬 = Step 4 일괄 UPDATE | ✓ 새 정책 = Gemini 응답 최우선 |
| 본 스킬 = Step 10 외곽 INSERT | ✓ 새 정책 = 매칭 시 = 새 우선 |

## 본 세션 검증 (= Paris)

- Earl of Sandwich (id 76020) = 옛 잘못 매칭 (= McDonald's 큐레이션 혼합) → 새 정책 적용 후 = 일관성 회복
- McDonald's Disney Village (= 같은 주소) = 옛 정책 = 매칭 (= 잘못) / 새 정책 = 주소+이름 X = 별도 INSERT (= 정확)
- Paris 외곽 식당 = 60 호출 = 옛 정책 = 48 UPDATE + 12 skipped / 새 정책 = 48 UPDATE + 12 신규 INSERT (= 정확)

## 트리거 동기 변경

**필수** = `server/db/migrations/place-identity.sql` 동시 적용 (= upsertPlace v2 + 트리거 v2 = 두 곳 모두 새 정책).

= 트리거 v1 만 적용 = upsertPlace v2 의 신규 INSERT (= Disney Village 다른 식당) = 트리거 차단 = 모순.
= upsertPlace v2 만 = 트리거 v1 = 차단 = INSERT 실패.

= **두 곳 동시** 정책 변경 필수.
