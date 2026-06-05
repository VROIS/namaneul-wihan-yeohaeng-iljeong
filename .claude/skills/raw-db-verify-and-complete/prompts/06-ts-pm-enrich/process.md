# 06-ts-pm-enrich — 필수 과정

## 호출 흐름

```
[입력] city_id
   ↓
1. 대상 행 SELECT (= image NULL OR pid NULL + 식당/어드벤처 OR rank 1-20)
   ↓
2. cities = name_en, country_code 조회 (= regionCode 용)
   ↓
3. 각 행 = TS Enterprise textSearch 호출
   = textQuery = "${name_en} ${address}" (= 좌표 명시 X = locationBias null)
   = languageCode='ko' (= displayName 한국어)
   = FieldMask = 9요소 표준 관문 tsSearch() (= 함수내 강제 + validateFieldMask 내장)
   ↓
4. 응답 places[] = 1 등 선택 (= 응답 순서 = userRatingCount DESC)
   ↓
5. 산출물 raw 저장 = docs/raw/{city_id}/06-ts-pm-enrich-candidates-{YYYY-MM-DD}.json
   ↓
6. 사용자 cc2 검수 (= 선택 = 응답 1 등 = 우리 행과 같은 장소 검증)
   ↓
7. post-process.ts:
   a. PhotoMedia 호출 (= photos[0].name) = binary 다운
   b. Supabase Storage 업로드 (= place-photos/{cityId}/{rowId}-{ts}.jpg)
   c. upsertPlace() = image_url + pid + priceEur (GREATEST) + reviewCount + mapsUri 갱신
```

## 대상 행 카테고리 (= 사용자 SSOT [[feedback_wikidata_first_not_google]])

| 카테고리 | WK 효과 | TS 효과 | 권장 |
|---|---|---|---|
| heritage / hotspot / healing / attraction / shopping | ✅ WK 좋음 | OK | **08 WK 우선** |
| restaurant / adventure | ❌ WK 오매칭 多 | ✅ TS 정확 | **06 TS 우선** |
| 모든 카테고리 rank 1-20 | OK | ✅ TS 검증 | **06 TS = 가격/사진 정확화** |

## 비용 + 무료 한도

- TS Enterprise = $35/1K = **$0.035/호출** = 무료 1K/월 (= GCP 청구서 실측)
- PhotoMedia = $7/1K = **$0.007/호출** (= 1 photo 당)
- Paris 본 세션 대상 추정 = 200 행 (= 122 식당 image NULL + 80 어드벤처/관광 잔여)
- = 200 × ($0.035 + $0.007) = **~$8.40** (= 무료 한도 적용 시 = $0)

## SKU §15 가드 (= 헌법 §15)

```ts
import { tsSearch, tsPhoto } from 'server/services/shared/ts-client';
// = 9요소 FieldMask + validateFieldMask(Atmosphere 차단) = 관문 함수 안에서 자동 강제
// = 자체 FieldMask 작성 / 직접 fetch 금지 (= §16 우회 위반)
```

= **회피 절대 금지** (= 직접 fetch / FieldMask 우회 = AI 미래 실수 위험 = 14% 비용 폭탄)

## 데이터 흐름 (= 응답 → DB)

| 응답 필드 | upsertPlace 필드 | DB 컬럼 | 정책 |
|---|---|---|---|
| `id` | `googlePlaceId` | `google_place_id` | COALESCE 새 우선 (= 덮어쓰기) |
| `displayName.text` | `nameKo` | `name_ko` | 새 우선 (= 한국어 갱신) |
| `formattedAddress` | `address` | `address` | COALESCE 새 우선 (= 덮어쓰기) |
| `location.latitude` | `latitude` | `latitude` | COALESCE 새 우선 (= 덮어쓰기) |
| `userRatingCount` | `googleReviewCount` | `google_review_count` | 새 우선 |
| `priceRange.endPrice.units` | `priceEur` | `price_eur` | **GREATEST 비싼 쪽** (= §14) |
| `photos[0].name` → PhotoMedia → Storage URL | `imageUrl` | `image_url` | 새 우선 (= 새 있으면 교체, 없으면 옛 보존) |
| `googleMapsUri` | `googleMapsUri` | `google_maps_uri` | COALESCE 새 우선 (= 덮어쓰기) |
| `businessStatus` | (= 폐업 게이트 = 보조) | (= 미저장) | CLOSED_PERMANENTLY 판정용 |

## 검증 조건

| 항목 | 기준 |
|---|---|
| FieldMask 검증 | validateFieldMask() 통과 = Atmosphere 0 |
| languageCode | 'ko' (= 사용자 SSOT) |
| 응답 places[] 길이 | 1 이상 (= 0 = no_match) |
| PhotoMedia photo 다운 | 200 OK = binary |
| Storage 업로드 | public URL 발급 |
| upsertPlace 결과 | updated 또는 inserted |