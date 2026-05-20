# 08-wk-image-fill — 필수 과정

## 호출 흐름

```
[입력] city_id
   ↓
1. 대상 행 SELECT (= image NULL + 식당/어드벤처 제외 + rank 21+ 또는 NULL)
   ↓
2. 각 행 = Wikidata SPARQL (= 좌표 around 10m)
   = 옵션 P18 (= 이미지) + P31 (= instance/카테고리)
   ↓
3. 각 후보 = score 계산 (= 좌표/이름/카테고리/이미지)
   ├─ score ≥ 5 → TRUST (= 자동 UPDATE 후보)
   ├─ score 3-4 → VERIFY (= 사용자 검수 또는 AI 판별)
   └─ score ≤ 2 → reject (= SKIP)
   ↓
4. 산출물 raw 저장 = docs/raw/{city_id}/08-wk-image-fill-candidates-{YYYY-MM-DD}.json
   ↓
5. 사용자 cc2 검수 (= TRUST 자동 / VERIFY 명시 / reject 폐기)
   ↓
6. post-process.ts = 명시 후 image_url UPDATE (= upsertPlace 우회 = COALESCE 옛 우선 정책 무시 = 직접 UPDATE)
```

## SPARQL endpoint + UA (= 필수)

```ts
const UA = 'TRIPIS/1.0 (contact@vibetrip.app) Expo/54';  // = AOS Glide bypass
const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql);
const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/sparql-results+json' } });
```

## Score 계산 함수

```ts
function calculateScore(
  cat: string,
  rowLat: number, rowLng: number,
  cand: { lat: number; lng: number; label: string; desc: string; instance: string; image: string | null },
  rowNames: { name_en: string; name_local: string }
): number {
  let score = 0;
  const dist = haversineM(rowLat, rowLng, cand.lat, cand.lng);
  if (dist <= 10) score += 3;
  else if (dist <= 50) score += 2;
  else if (dist <= 100) score += 1;

  const nameSc = Math.max(
    nameMatch(rowNames.name_en, cand.label),
    nameMatch(rowNames.name_local, cand.label),
  );
  score += nameSc * 2;  // = 완전 일치 +4 / 부분 +2

  if (categoryMatch(cat, cand.desc, cand.instance)) score += 1;
  if (cand.image) score += 1;

  return score;
}
```

## 분류 임계

| score | 분류 | 처리 |
|---:|---|---|
| ≥ 5 | **TRUST** | post-process.ts = 자동 UPDATE 가능 |
| 3-4 | **VERIFY** | 사용자 cc2 또는 AI Gemini 추가 검증 후 UPDATE |
| ≤ 2 | **reject** | SKIP |
| (= 후보 없음) | **no_candidate** | Wikidata 좌표 10m 내 0 행 = SKIP |

## DB UPDATE 정책 (= image_url 만)

- **직접 UPDATE** (= upsertPlace 우회 = COALESCE 옛 우선 정책이 = image NULL 덮어쓰기 차단)
- WHERE id = $id AND (image_url IS NULL OR image_url = '')
- SET image_url = $wikimedia_url, phase_tags = array_cat(phase_tags, ARRAY[`wk-image-fill-${YYYY-MM-DD}`])

## 검증 조건

| 항목 | 기준 |
|---|---|
| 대상 행 = 식당/어드벤처 제외 + rank 21+/NULL + image NULL | 100% |
| SPARQL 10m 검색 (= 사용자 SSOT) | 0.01 km radius |
| TRUST 비율 | ~30-40% (= 사용자 기대 = 검증된 명소 위주) |
| UPDATE 시 = image_url 기존 NULL 만 | 100% (= 옛 이미지 덮어쓰기 금지) |

## 본 세션 검증 (= Paris 2026-05-19)

- 대상 = 84 행 (= image NULL + 식당/어드벤처 제외 + rank 21+/NULL)
- TRUST 30 / VERIFY 12 / reject 12 / no_candidate 30
- 사용자 cc2 검수 후 UPDATE = 28/30 TRUST (= 2 행 = AI 검증 시 오패칭 = SKIP)
- 결과 = 이미지 보유 = heritage 91% / hotspot 100% / healing 87%