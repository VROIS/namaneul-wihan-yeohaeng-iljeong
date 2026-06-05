# 로우데이터 장소별 분류 연구

> Phase 4: 인스타 사진, 구글 이미지, 셀렵 흔적 등 수집 로우데이터를 장소별로 분류해 저장하는 구조 설계

---

## 최종 목표: 이미지 정보 인스타 우선 한곳 통합

**목표**: 비용 들여 수집한 이미지 데이터를 **인스타 우선**으로 **한 테이블에 통합**

**수집 소스 (기존)**:
- instagram_photos (35K) — image_url, post_url
- places.instagram_photo_urls (228건, 1,970 URL)
- celebrity_place_evidence (셀럽 인스타)
- places.photoUrls (구글·위키메디어)

**통합 테이블: `place_images` (신규)**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | serial | PK |
| place_id | int (nullable) | places.id — places에 있으면 |
| place_seed_raw_id | int (nullable) | place_seed_raw.id — place_seed_raw만 있으면 |
| city_id | int | 도시 (place_id 없을 때 필수) |
| source_type | text | **instagram** \| celebrity \| google \| wikimedia |
| url | text | 이미지 URL (image_url 우선, 없으면 post_url) |
| sort_order | int | 1=인스타(최우선), 2=셀럽, 3=구글, 4=위키 |
| fetched_at | timestamp | 수집 시각 |

**우선순위**: instagram(1) > celebrity(2) > google(3) > wikimedia(4). 조회 시 ORDER BY sort_order, id.

**마이그레이션**: 기존 instagram_photos, places.instagram_photo_urls, celebrity_place_evidence, places.photoUrls → place_images로 이관. **신규 수집 없음.**

### 마이그레이션 순서 (기존 데이터 보존)
1. `place_images` 테이블 생성
2. instagram_photos (35K) → hashtag_id → instagram_hashtags (linkedPlaceId, linkedCityId) → place_id 또는 (city_id, place_seed_raw_id 매칭)로 INSERT
3. places.instagram_photo_urls → place_id로 INSERT (sort_order=1)
4. celebrity_place_evidence → place_id로 INSERT (sort_order=2)
5. places.photoUrls → place_id로 INSERT (sort_order=3)
6. (선택) 기존 places.instagram_photo_urls, celebrity_place_evidence 컬럼은 유지(하위호환) 또는 deprecated 표시

---

## 0. 현재 DB 상황 (Supabase 스크린샷 기준)

### instagram_photos (35,196건)
| 컬럼 | 상태 | 비고 |
|------|------|------|
| id | 있음 | PK |
| hashtag_id | 있음 (96, 78, 97, 99 등) | instagram_hashtags.id FK |
| location_id | **전부 NULL** | instagram_locations 0건이라 미사용 |
| post_url | 있음 | 인스타 게시물 링크 |
| image_url | 있음 (일부만) | 실제 이미지 URL, 3,774건만 채워짐 |
| caption | 있음 (한국어) | "런던 아이 타러 가는 길", "몽마르뜨 언덕" 등 |

→ **이미지 컬럼 있음** (image_url). 단 35K 중 3.7K만 image_url 채워짐. 나머지는 post_url만.

### place_seed_raw (4,500건)
| 컬럼 | 상태 | 비고 |
|------|------|------|
| city_id, seed_category, name_en, name_ko | 있음 | MCP 1단계 수집 |
| google_image_count_note | 있음 | "이미지 결과 수억 건" — 구글 검색 메타데이터 (실제 URL 아님) |
| source_type | 있음 | instagram, naver_blog — 선정 출처 |
| nubi_reason, evidence_url | 있음 | MCP 2단계 |
| **이미지 URL 컬럼** | **없음** | 실제 사진 URL 저장 불가 |

→ **이미지 컬럼 없음**. google_image_count_note는 "구글에서 몇 건 나왔는지" 수치만.

### 핵심 갭
- instagram_photos: image_url, post_url 있음. **hashtag_id로만** 연결 (location_id NULL)
- place_seed_raw: 이미지 저장할 컬럼 없음. city_id, seed_category, name_en만 있음
- **연결 다리**: instagram_photos → hashtag_id → instagram_hashtags (linkedCityId, category, hashtag 텍스트)

---

## 1. 현재 데이터 현황

| 데이터 소스 | 저장 위치 | 규모 | 장소 연결 | 비고 |
|-------------|-----------|------|-----------|------|
| 인스타 사진 | `places.instagram_photo_urls` | 36K+ | placeId (places.id) | 도시별 미분류, JSONB 배열 |
| 구글 이미지 | `places.photoUrls` | - | placeId | places 테이블에 직접 |
| 셀렵 흔적 | `celebrity_place_evidence` | 20인 | placeId | imageUrl, instagramHandle |
| nubiReason | `place_nubi_reasons`, `place_seed_raw.nubi_reason` | 4,500+ | placeId / cityId+nameEn | evidenceUrl 포함 |
| place_seed_raw | `place_seed_raw` | 6,100건 | cityId, nameEn (placeId 없음) | 5카테고리×30도시 |

### 문제점
- **인스타 36K**: `instagram_photo_urls`는 places에 있으나, 해시태그/위치 기반 수집 시 **장소 매칭이 안 된 데이터**가 많을 수 있음
- **place_seed_raw**: placeId 없음 → places와 매칭하려면 nameEn + cityId로 조인 필요
- **이미지 URL 분류**: 인스타/구글/셀렵 출처별로 구분되어 있으나, 장소별 검색/필터가 어려움

---

## 2. 분류 방안 (3가지)

### 방안 A: place_seed_raw ↔ places 매칭

**목적**: place_seed_raw에 placeId FK 추가 (선택)

- **매칭 키**: nameEn + cityId → places.id
- **장점**: place_seed_raw 가격/nubiReason을 places와 직접 연결
- **단점**: nameEn 정규화 불일치 시 매칭 실패, 유료 장소만 places에 있음
- **구현**: `place_seed_raw.place_id` FK 추가 (nullable), 배치 스크립트로 nameEn 매칭 후 업데이트

### 방안 B: place_media_sources 테이블 (신규)

**목적**: 장소별 미디어 URL을 별도 테이블로 분리

```sql
CREATE TABLE place_media_sources (
  id SERIAL PRIMARY KEY,
  place_id INTEGER REFERENCES places(id),
  source_type TEXT NOT NULL,  -- instagram, google, celebrity, wikimedia
  url TEXT NOT NULL,
  fetched_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(place_id, source_type, url)
);
```

- **장점**: placeId 기준 검색, 출처별 필터, URL 중복 방지
- **단점**: 기존 places.instagram_photo_urls 마이그레이션 필요, 스키마 변경
- **사용처**: 이미지 우선순위(셀렵>인스타>구글) 조회 시 JOIN

### 방안 C: MCP 2단계 확장 (evidenceUrl + 이미지)

**목적**: MCP 2단계에서 evidenceUrl, nubiReason과 함께 **이미지 URL**도 수집

- **place_seed_raw 확장**: `evidence_image_url` TEXT 컬럼 추가
- **프롬프트**: "evidenceUrl에서 대표 이미지 URL 추출, 또는 구글 이미지 검색 결과 1개"
- **장점**: 기존 MCP 파이프라인 활용, place_seed_raw 한 테이블에 집약
- **단점**: place_seed_raw에 placeId 없음 → places와 매칭 시 여전히 nameEn 필요

---

## 3. 권장 우선순위

1. **단기**: 방안 A (place_seed_raw.place_id) — 가격/nubiReason fallback 시 places 매칭 성능 향상
2. **중기**: 방안 C (MCP 2단계 이미지 확장) — evidenceUrl과 함께 이미지 URL 수집
3. **장기**: 방안 B (place_media_sources) — places.instagram_photo_urls 마이그레이션 후 통합 검색

---

## 4. 36K 인스타 사진 → 5대 카테고리 + 도시별 통합 (실무 설계)

### 4.1 데이터 출처 정리

| 출처 | 테이블/컬럼 | 도시·카테고리 | 비고 |
|------|-------------|---------------|------|
| places | `instagram_photo_urls` (JSONB) | city_id, seed_category 있음 | 장소별 이미 연결됨 |
| instagram_photos | `image_url`, `post_url` | hashtag_id→linkedCityId, location_id→linkedCityId | 해시태그/위치 기반, 미연결 가능 |
| instagram_hashtags | `linkedPlaceId`, `linkedCityId`, `category` | 있음 | 해시태그별 도시·장소 연결 |

### 4.2 통합 전략: place_seed_raw에 이미지 주입

**옵션 1: place_seed_raw에 `instagram_photo_urls` 컬럼 추가**

1. **스키마**: `place_seed_raw.instagram_photo_urls` JSONB (또는 `image_url` TEXT 1개)
2. **매칭**: places ↔ place_seed_raw (name_en + city_id, fuzzy 매칭)
3. **배치**: places에서 instagram_photo_urls 있는 row → place_seed_raw 매칭 → 업데이트

```
places (city_id, name, seed_category, instagram_photo_urls)
    ↓ name_en + city_id 매칭
place_seed_raw (city_id, name_en, seed_category) → instagram_photo_urls 채움
```

**옵션 2: place_seed_raw ↔ places 매칭 테이블 + 기존 places 활용**

- place_seed_raw에 `place_id` FK 추가 (nullable)
- 매칭 스크립트로 name_en + city_id → places.id 연결
- 이미지 조회 시: place_seed_raw.place_id → places.instagram_photo_urls

### 4.3 분류 스크립트 흐름 (제안)

```
1. places 조회 (instagram_photo_urls.length > 0, city_id, seed_category 있음)
2. place_seed_raw 조회 (city_id, seed_category, name_en)
3. 도시별·카테고리별 매칭:
   - places.name ≈ place_seed_raw.name_en (소문자, trim, fuzzy)
   - places.seed_category = place_seed_raw.seed_category
4. 매칭 성공 시 place_seed_raw에 이미지 URL 저장 (신규 컬럼)
```

### 4.4 DB 수정 필요 사항

| 작업 | 내용 |
|------|------|
| place_seed_raw 확장 | `instagram_photo_urls` JSONB 또는 `image_url` TEXT 추가 |
| 마이그레이션 | 기존 36K → place_seed_raw 매칭 후 채우기 |
| (선택) place_id FK | place_seed_raw.place_id 추가 시 places와 직접 연결 |

---

## 5. 상세 매칭 경로 (instagram_photos → place_seed_raw)

```
instagram_photos (35,196)
    │ hashtag_id (location_id는 전부 NULL)
    ▼
instagram_hashtags (3,565)
    │ hashtag(텍스트), linkedCityId(3,558건), category, linkedPlaceId(일부)
    ▼
place_seed_raw (4,500)
    city_id, seed_category, name_en
```

### 5.1 매칭 가능 조건
| 조건 | instagram_hashtags | place_seed_raw | 매칭 |
|------|-------------------|----------------|------|
| 도시 | linkedCityId | city_id | ✅ 직접 매칭 |
| 카테고리 | category (food, attraction, landmark, travel) | seed_category (restaurant, attraction, hotspot 등) | ⚠️ 매핑 테이블 필요 |
| 장소명 | hashtag ("GyeongbokgungPalace", "#파리맛집") | name_en | ⚠️ fuzzy 매칭 (해시태그≠장소명인 경우 많음) |

### 5.2 category → seed_category 매핑
| instagram_hashtags.category | place_seed_raw.seed_category |
|-----------------------------|------------------------------|
| food | restaurant |
| attraction, landmark | attraction |
| travel | attraction 또는 hotspot |
| (없음) | healing, adventure는 별도 규칙 필요 |

### 5.3 한계점
1. **hashtag ≠ 장소명**: "#파리맛집"은 도시+카테고리만 알 수 있음, 구체적 장소명 없음
2. **linkedPlaceId null 다수**: instagram_hashtags 중 linkedPlaceId 있는 건 일부만 → places와 연결 안 된 해시태그 많음
3. **image_url 10%만**: 35K 중 3.7K만 image_url 있음. 나머지는 post_url(게시물 링크)만 → 이미지 직접 표시 어려움

### 5.4 실용적 접근
- **도시+카테고리만 매칭**: linkedCityId + category → place_seed_raw (city_id, seed_category) 같은 row들에 **대표 이미지 1장**만 할당
- **해시태그=장소명인 경우**: GyeongbokgungPalace, hongdaeshoppingstreet 등 → name_en과 매칭 시 **장소별** 이미지 할당 가능
- **place_seed_raw 확장**: `image_url` TEXT 또는 `instagram_photo_urls` JSONB 추가 후, 매칭된 instagram_photos.image_url (또는 post_url) 저장

---

## 6. 구현 시 참고

- **매칭 유틸**: `server/services/city-resolver.ts` findCityUnified, `ag3-data-matcher` nameEn 매칭 로직
- **해시태그↔장소 연결**: `server/services/place-linker.ts` — linkedPlaceId 매칭
- **이미지 우선순위**: `ag3-data-matcher.ts` resolvePlaceImage(celebrityImageMap, instagramPhotoUrls, photoUrls)
- **MCP Stage 2**: `mcp-raw-service.ts` buildStage2Prompt, runStage2ForCityCategory
- **DB 조회 스크립트**: `npm run inspect:instagram`
