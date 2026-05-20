# 06-ts-pm-enrich — Google Places TS Enterprise + PhotoMedia 보강

> ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT (= 식당/어드벤처 = WK 오매칭 → TS 만 / 헌법 §15 = Atmosphere 33 필드 금지) = 1 글자 변경 금지

= 대상 행 (= image NULL + restaurant/adventure 또는 google_place_id NULL) = Google Places **TS Enterprise textSearch** (= $35/1K) → id 매칭 → **PhotoMedia 다운 → Supabase Storage 업로드** → image_url + priceRange + userRatingCount + googleMapsUri 갱신.

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **API 설정** (= Enterprise SKU 필드만) | [`prompt.txt`](prompt.txt) (= FieldMask 정의) | ✅ |
| 2 | **호출 설정** | 본 README + `server/services/shared/ts-client.ts` 영구 컴포넌트 | ✅ |
| 3 | **산출물 원본** | `docs/raw/{city_id}/06-ts-pm-enrich-candidates-{YYYY-MM-DD}.json` | ✅ |
| 4 | **실행 스크립트** | [`run.ts`](run.ts) | ✅ |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB UPDATE + Storage 업로드** | [`post-process.ts`](post-process.ts) | ✅ |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 핵심 정책 (= 헌법 §15)

### ✅ 허용 = **Enterprise SKU only** ($35/1K, 무료 1K/월)

= 시스템 SSOT 필수 필드:
- `places.id` / `places.displayName` / `places.formattedAddress` / `places.location`
- `places.userRatingCount` (= 인기도)
- `places.priceRange` (= 가격 SSOT = GREATEST §14)
- `places.priceLevel` (= 보조)
- `places.photos` (= PhotoMedia 호출용)
- `places.googleMapsUri` (= 13 SSOT)
- `places.regularOpeningHours`
- `places.types` / `places.primaryType`

### ❌ 절대 금지 = **Atmosphere 33 필드** ($40/1K)

= `editorialSummary`, `reviews`, `generativeSummary`, `dineIn`, `takeout`, `delivery` 등
= [`server/services/shared/google-places-sku.ts`](../../../../server/services/shared/google-places-sku.ts) 의 `validateFieldMask()` 단일 진입점 강제

## 대상 행 SELECT

```sql
SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude,
       google_place_id, image_url
FROM place_seed_raw
WHERE city_id = $1
  AND NOT (phase_tags && ARRAY['archived-*'])
  AND (
    (image_url IS NULL OR image_url = '')  -- 이미지 NULL
    OR google_place_id IS NULL              -- PID NULL
  )
  AND (
    seed_category IN ('restaurant', 'adventure')  -- WK 오매칭 카테고리
    OR rank <= 20                                  -- TOP 20 = 우선 (= TS 검증)
  )
```

## 호출 흐름

```
[입력] city_id
   ↓
1. 대상 행 SELECT
   ↓
2. 각 행 = TS textSearch (= name_en + address)
   = FieldMask = Enterprise SKU only (= validateFieldMask 강제)
   = languageCode='ko' (= displayName 한국어)
   ↓
3. 응답 id 매칭 = 우리 google_place_id NULL → TS id 채움
   ↓
4. photos[0] = PhotoMedia 호출 (= maxWidthPx=800)
   ↓
5. binary 다운 → Supabase Storage `place-photos/` bucket 업로드
   = file path = `{cityId}/{id}-{timestamp}.jpg`
   ↓
6. Storage public URL = image_url 채움
   ↓
7. priceRange.endPrice = priceEur (= GREATEST §14)
   ↓
8. upsertPlace() 호출 (= 5 단계 매칭 자동)
```

## 비용

| 항목 | 단가 | Paris 대상 추정 | 비용 |
|---|---:|---:|---:|
| TS Enterprise textSearch | $0.035/호출 | 200 행 | $7.00 |
| PhotoMedia | $0.007/호출 (= 1 photo) | 150 행 | $1.05 |
| Storage 업로드 | $0 (= Supabase 무료) | 150 행 | $0 |
| **합계** | - | 200 행 | **~$8.05** |

= 무료 1K/월 (= TS) 적용 시 = **$0** (= 신규 도시 1000 행 이하)

## 변경하려면?

= 사용자 명시 + 헌법 §15 (= Atmosphere 금지) + §17 (= 3 게이트) 후만.