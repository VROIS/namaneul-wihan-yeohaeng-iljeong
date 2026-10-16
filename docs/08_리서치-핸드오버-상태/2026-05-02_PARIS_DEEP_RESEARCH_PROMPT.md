# Paris Deep Research Prompt — 7 카테고리 top 20 비교 검증

> 외부 AI Deep Research (Gemini Deep Research / ChatGPT Deep Research / Perplexity Pro) 에 입력 → 결과를 우리 DB 와 비교 검증.

---

## 사용 방법

### 옵션 A — **1 통합 prompt** (한 번에 7×20=140 행 받기)

복사 → 외부 Deep Research 채팅창 붙여넣기:

```
You are a travel data assistant. Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

CITY: Paris
COUNTRY: France
CITY_CENTER: { lat: 48.8566, lng: 2.3522 }
RADIUS_KM: 100

For each of the 7 categories below, return TOP 20 most famous and popular places, ordered by Google's own ranking (Google AI's "famous popular" judgment, not just review count).

Categories:
1. heritage    — historical sites and museums
2. hotspot     — photogenic viewpoints, panoramic photo spots
3. attraction  — tourist attractions (theme parks, zoos, aquariums, family attractions)
4. adventure   — adventure places and activity spots (water parks, escape games, ropes courses)
5. healing     — parks, gardens, and peaceful nature spots
6. shopping    — shopping places and markets (department stores, malls)
7. restaurant  — famous and popular restaurants

For each place include:
- rank (1-20, Google's order)
- name_en (English official name)
- name_local (French official name, if different)
- name_ko (Korean name commonly used by Korean travelers, null if not commonly known)
- lat, lng (decimal degrees)
- address (short)
- google_review_count (approximate, if known)
- primary_type (Google's primaryType, e.g., "museum", "restaurant", "bridge", "park")
- types (array of all Google place types)
- summary_en (1-sentence English description)
- distance_km_from_center (haversine from CITY_CENTER, 1 decimal)

OUTPUT (strict JSON, no markdown fences):
{
  "city": "Paris",
  "country": "France",
  "center": { "lat": 48.8566, "lng": 2.3522 },
  "radius_km": 100,
  "results": {
    "heritage":   [ { ...20 items } ],
    "hotspot":    [ { ...20 items } ],
    "attraction": [ { ...20 items } ],
    "adventure":  [ { ...20 items } ],
    "healing":    [ { ...20 items } ],
    "shopping":   [ { ...20 items } ],
    "restaurant": [ { ...20 items } ]
  }
}
```

**저장**: 결과를 `docs/paris_deep_research_result.json` 으로 저장.

---

### 옵션 B — **7 분리 prompt** (Deep Research 응답 길이 제한 회피)

각 카테고리마다 별도 채팅 → 결과 합치기.

#### 1. heritage
```
Return strict JSON only. Top 20 most famous and popular historical sites and museums within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

#### 2. hotspot
```
Return strict JSON only. Top 20 most famous photogenic viewpoints and panoramic photo spots within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

#### 3. attraction
```
Return strict JSON only. Top 20 most famous and popular tourist attractions within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

#### 4. adventure
```
Return strict JSON only. Top 20 most famous adventure places and activity spots within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

#### 5. healing
```
Return strict JSON only. Top 20 most famous parks, gardens, and peaceful nature spots within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

#### 6. shopping
```
Return strict JSON only. Top 20 most famous shopping places and markets within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

#### 7. restaurant
```
Return strict JSON only. Top 20 most famous and popular restaurants within 100km radius from Paris city center (48.8566, 2.3522), France.
For each: rank, name_en, name_local, name_ko, lat, lng, address, google_review_count, primary_type, types, summary_en, distance_km_from_center.
Format: { "results": [ ...20 items ordered by Google's famous popular ranking ] }
```

---

## 받은 결과로 무엇을 비교

| 비교 항목 | 검증 |
|---|---|
| **Deep Research rank vs 우리 DB rank** | Google AI 순위 vs 우리 (rc DESC) 차이 측정 |
| **Deep Research 카테고리 분류 vs primary_type** | Pont Neuf=bridge → restaurant 매핑 X 검증 |
| **누락된 명소** | Deep Research 응답 ∖ 우리 DB = 미발굴 행 |
| **잘못된 분류 행** | Deep Research = adventure 가 아닌데 우리 = adventure |
| **거리 검증** | distance_km > 50 인 행 = 광역 fallback |

## 저장 경로

- 옵션 A 결과 = `docs/paris_deep_research_result.json`
- 옵션 B 결과 = `docs/paris_deep_research/{category}.json` (7 파일)

---

## Deep Research 도구 추천

| 도구 | 정확도 | 비용 |
|---|---|---|
| **Gemini 2.0 Deep Research** (gemini.google.com) | 매우 높음 (Google 자체 데이터) | $20/월 (Advanced) |
| **ChatGPT o3 Deep Research** | 높음 | $20/월 (Plus) |
| **Perplexity Pro Deep Research** | 중간~높음 | $20/월 |
| **Claude Opus Research** (claude.ai) | 중간 (Google 데이터 X) | $20/월 |

**추천 = Gemini Deep Research** (Google Places 데이터 직접 접근 가능성 높음).
