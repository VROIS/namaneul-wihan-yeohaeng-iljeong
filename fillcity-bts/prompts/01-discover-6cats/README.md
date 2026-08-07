# 01-discover-6cats — 신규 도시 6 카테고리 TOP 20 발굴

> ⚠️ 수정금지(승인필요) 2026-05-12 = 사용자 SSOT v3 = 1 글자 변경 금지

= 신규 도시 = 처음 발굴 시 첫 호출 = **6 카테고리 (= 식당 제외) × 20 곳 = 총 120 곳**.

## 7 요소 (= 사용자 SSOT 2026-05-20)

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **프롬프트** (= 전문 = 1 글자 변경 X) | [`prompt.txt`](prompt.txt) | ✅ 영구 |
| 2 | **호출 설정** (= 모델/temp/tools) | [`../_call-config.md`](../_call-config.md) | ✅ 공유 |
| 3 | **산출물 원본** (= Gemini raw JSON) | `docs/raw/{city_id}/01-discover-6cats.json` | 호출 시 저장 |
| 4 | **실행 스크립트** | [`run.ts`](run.ts) | 🟡 작성 예정 |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB INSERT** | [`post-process.ts`](post-process.ts) | 🟡 작성 예정 |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 변수 치환

| 변수 | 의미 |
|---|---|
| `${CITY_NAME}` | 도시 영문명 (= Paris) |
| `${COUNTRY}` | 국가 (= France) |
| `${CITY_LAT}` | 도심 위도 |
| `${CITY_LNG}` | 도심 경도 |

## 응답 schema (= upsertPlace 호환)

```ts
{
  city, country, center, radius_km,
  results: {
    heritage:   [{ rank, name_en, name_local, name_ko, lat, lng, address,
                   selection_reason_ko, shortform_ko,
                   distance_km_from_center, day_zone, estimated_price_eur }, ...20],
    hotspot:    [...20],
    attraction: [...20],
    adventure:  [...20],
    healing:    [...20],
    shopping:   [...20]  // ⚠️ shopping = price_eur null 강제
  }
}
```

## 출처 + 검증

- **출처** = `scripts/seed-gemini.mjs:156-206` (= 옛 검증 = Paris/Tokyo/Madrid 등 다수 도시 적용 완료)
- **본 세션 (= 2026-05-19) 검증** = Paris 활성 455 행 = 모든 비식당 카테고리 발굴 후 사용 중