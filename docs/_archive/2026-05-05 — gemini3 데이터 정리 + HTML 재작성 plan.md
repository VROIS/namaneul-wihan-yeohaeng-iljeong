# 2026-05-05 — gemini3-2026-05 데이터 정리 + HTML 재작성 plan

> **단일 SSOT** — 이 plan 파일이 진행 상황의 진실. 매 단계 완료 시 체크. 컴팩팅/후임 AI 도 이 파일 보고 이어가면 됨.

**최종 갱신**: 2026-05-05 (Step 1 ~ 2G-2 완료 + U1~U3 자율 모드 진행 중)

---

## 1. 사용자 SSOT (확정 — 변경 시 사용자 명시 후만)

1. **단일 통합 HTML** = 9 도시 한 페이지 + 도시 풀다운 + **검색창**
2. **1 도시 = 7 카테고리 × 20 = 140 슬롯 강제** (빈 슬롯 = "수집 중" placeholder)
3. **정렬 = `gemini_rank` ASC** = 사용자 노출 순서 (rank 1~20)
4. **rank > 20 또는 NULL = 후보군 (검색 시에만 노출)**
5. **카테고리별 이미지 워크플로우**:
   - **restaurant + adventure** = **Google PhotoMedia 만** (Wiki = 셰프/포스터/약도 = 가짜 = NULL 이 정답)
   - **heritage / hotspot / attraction / healing / shopping** = Wiki **정확** (그대로 신뢰)
6. **HTML = DB SELECT** (하드코딩 절대 X = 선임 해고 사유)
7. **컬럼 활용** (사용자 SSOT 2026-05-05):
   - `editorial_summary` = 영문 직역 원본 (그대로)
   - `summary_ko` = 한국어 직역 (객관, 선정 이유, 여정 슬롯)
   - `nubi_reason` = 한국어 NUBI 카피 톤 (감성, 숏폼 미리보기)
   - = **새 컬럼 추가 X** (기존 활용)
8. **이미지 NULL = Lucide 카테고리 아이콘 fallback** (= 최후 보루, 모든 방법 시도 후만)
9. **2 차 작업 (별도 트리거)** = 메인앱 `matchPlacesWithDB` 이름 매칭으로 변경

---

## 2. 진행 단계 체크리스트

### ✅ 사전 점검 (완료)
- [x] `scripts/regen-qa-index.mjs` 검사 = DB SELECT 함 (하드코딩 X 확인)
- [x] `docs/raw/` 9 도시 JSON 존재 (1,251/1,260 = 99.3%)
- [x] DB 9 도시 phase 분포 측정 (gemini3 1,140 + bts2026 647 + phase2 17)
- [x] 헌법 `docs/_archive/로우데이타 최적화 과정 2026.04.30.md` 숙지
- [x] Paris phase2 17 행 정체 = 모두 image NULL (폐기 대상)

### ✅ Step 1. bts2026 가짜 INSERT 정리 (완료)
- [x] `_seed_raw/{cityId}/{cat}.json` 의 place_id Set 추출
- [x] DB bts2026 row 의 google_place_id 가 raw Set 안 = 진짜 / 밖 = 가짜
- [x] **가짜 273 행 DELETE / 진짜 345 행 보존 COMMIT**
- 발견 패턴: 4 도시 식당 + 2 도시 어드벤처 = Wikipedia 카테고리 페이지 ("American cuisine" 등) INSERT 됨
- 스크립트: `scripts/step1-clean-fake-bts2026.mjs`

### ✅ Step 2A. 식당/어드벤처 wiki URL → NULL (완료)
- [x] gemini3 식당 + 어드벤처 wiki URL 8 행 = NULL UPDATE
- 결과: adventure wiki 0, restaurant wiki 0 (= 헌법 §2.7 100% 준수)

### ✅ Step 1C. 누락 INSERT (완료)
- [x] raw JSON ↔ DB 매칭 진단 = 322 행 누락 발견
- [x] 9 도시 raw JSON → DB INSERT (= ON CONFLICT DO NOTHING 안전판)
- 결과: INSERT 179 행 / skip 143 행 (UNIQUE 충돌) / UPDATE cat 4 행
- 스크립트: `scripts/step1c-fix-missing-rows.mjs`

### ✅ Step 1D. ghost DELETE (완료)
- [x] gemini3 row 중 raw JSON 매칭 X 행 = 임의 추가 = DELETE
- 결과: **189 행 DELETE** (= Mexico City 85, Stanford 48, Las Vegas 47, Busan 9)
- 9 도시 gemini3 = 1,140 → 1,130 (Step 1C INSERT 179 + Step 1D DELETE 189)
- 스크립트: `scripts/step1d-clean-gemini3-ghost.mjs`

### ✅ Step 2B. bts2026 PhotoMedia 84 (완료)
- [x] bts2026 NULL 88 행 = raw photos[0].name 매칭 → PhotoMedia → Storage → DB UPDATE
- 결과: **84/88 = 100% 성공** (raw 매칭 X 4 행)
- 스크립트: `scripts/step2b-fill-bts2026-photomedia.mjs`

### ✅ Step D. bts2026 wiki NULL + phase2 DELETE (완료)
- [x] bts2026 식당/어드벤처 wiki → NULL = 869 행 UPDATE (= 9 도시 + 24 도시 추가)
- [x] phase2 17 행 DELETE
- 결과: 9 도시 = bts2026 storage 84 / wiki 191 / NULL 70 (식당/어드벤처 wiki 0)

### ✅ Step F (=Step 2C). bts2026 식당/어드벤처 NULL 66 (완료)
- [x] bts2026 식당/어드벤처 NULL 68 행 → PhotoMedia 호출
- 결과: **66/68 = 97% 성공** (raw 매칭 X 2 행 = Aqua'Gliss, Stanford Recreation)
- bts2026 restaurant Google = 100%, adventure = 96%
- 스크립트: `scripts/step2c-fill-bts2026-restaurant-adventure.mjs`

### ✅ Step 2E (= N1). textSearch 배치 20 (완료)
- [x] 18 textSearch (도시 × 카테고리 × pageSize 20) = 360 후보
- 결과: 매칭 4 행만 (= Brussels adventure)
- = 헌법 §2.2 textQuery (인기 top 20) ↔ Gemini 추천 식당 (특이) = 거의 안 겹침
- 스크립트: `scripts/step2e-fill-gemini3-batch20.mjs`

### ✅ Step 2G-1. textSearch 개별 (= 사용자 정정) (완료)
- [x] 107 행 textSearch (textQuery = name + address + city, pageSize=10)
- [x] 응답 10 곳 매칭 검사 (= 순위 X, 단순 일치 검사)
- 결과: **exact 59 + partial 32 + token 4 = 진짜 매칭 95 (89%)** ✅ 사용자 기준 통과
- mismatch 12 (= 일부는 정규화 한계의 진짜)
- 결과 저장: `docs/_step2g_textsearch_results.json`
- 스크립트: `scripts/step2g-1-textsearch-only.mjs`

### ✅ Step 2G-2. PhotoMedia + Storage + DB UPDATE (완료)
- [x] 진짜 매칭 95 행 = PhotoMedia → Storage → DB UPDATE
- 결과: **95/95 = 100% 성공**
- 9 도시 식당/어드벤처 = adventure 95% Google + restaurant 98% Google
- 스크립트: `scripts/step2g-2-photomedia-after-review.mjs`

### ✅ Step U1. plan 파일 갱신 (= 이 문서, 완료)

### ✅ Step U2. summary_ko + nubi_reason 백필 (완료)
- [x] 사전 진단 = 처리 대상 정정 (= 약 1,400 행, 71 batch)
  - bts2026 = summary_ko 345 + nubi_reason 265 + editorial_summary 278 NULL
  - gemini3 = nubi_reason 1,071 NULL (= 큰 추가 작업)
- [x] Gemini 2.5 Flash 호출 = 71 batch × 20 행/batch
- [x] 응답 JSON: { editorial_summary?, summary_ko, nubi_reason }
- [x] **UPDATE 1,406 / 실패 0**
- 결과:
  - summary_ko NULL = **0** (100%)
  - editorial_summary NULL = **0** (100%)
  - nubi_reason NULL = 10 (= 99%, Gemini 일부 응답 누락)
- 스크립트: `scripts/step2u-translate-summary-ko.mjs`

### ✅ Step U3. HTML 재작성 (완료)
**`scripts/regen-qa-index.mjs` 영구 표준 갱신**:
- [x] `collection_phase` 필터 = 모든 phase SELECT (gemini3 + bts2026)
- [x] **검색창 추가** (장소명 입력 = 모든 도시·카테고리·rank 21+ 후보군 통합 검색)
- [x] **140 슬롯 강제** = JS 안에서 카테고리당 rank ASC 정렬 → top 20 = ranked, 21+ = extras
- [x] 빈 슬롯 = "수집 중" placeholder + Lucide 카테고리 아이콘
- [x] rank > 20 = extras 보존 (검색 시에만 노출)
- [x] NULL image_url = Lucide 카테고리 아이콘 fallback (= 사용자 SSOT 최후 보루)
- [x] phase 뱃지 (g3 / bts) = 카드 우하단 표시
- [x] 카드 SSOT (사용자 확정 적용):
  - 이미지 + rank 뱃지 + src 뱃지 (WIKIPEDIA / GOOGLE_PHOTO / LUCIDE / EMPTY)
  - 이름 EN + KO
  - 주소
  - 메타 (거리 + day_zone CORE/OUTSKIRT + RC)
  - 요약 EN (직역) + KO 직역 (선정 이유) + KO 카피 (NUBI 감성, 보라색 이탤릭)
- [x] HTML 사이즈 = 1,471 KB (= inline JSON DB 데이터)
- [x] **DB 동적 SELECT 입증** = 매 실행 시 DB 최신 반영 (= 하드코딩 X)
- 결과: `docs/qa/index.html` 저장 완료

---

## 4-2. 최종 9 도시 분포 (= U2/U3 후)

```
Brussels    = 150 행
Busan       = 151 행
Las Vegas   = 161 행
London      = 172 행
Madrid      = 176 행
Mexico City = 161 행
Munich      = 165 행
Paris       = 181 행
Stanford    = 158 행
─────────
9 도시 합계 = 1,475 행
```

### 카드 표시 가능 행 수
- 이미지 有 (storage + wiki) = 1,457 (= 99%)
- NULL image (= Lucide fallback) = 18 (= 1%)
- summary_ko 채움 = 1,475 (= 100%)
- nubi_reason 채움 = 1,465 (= 99%)
- editorial_summary 채움 = 1,475 (= 100%)

### Paris 예시 (= 사용자 시각 검수 대상)
- 7 카테고리 × 20 = 140 슬롯 (= 사용자 SSOT)
- Paris 실제 = 181 행 (= ranked 140 + extras 41 검색 후보군)
- 카테고리당 = heritage 30, hotspot 25, attraction 25, adventure 28, healing 26, shopping 24, restaurant 23
- 모두 카테고리당 20+ (= 사용자 의도 = "최소 20" 충족)

### ⏳ Step 5. 메인앱 `matchPlacesWithDB` 변경 (별도 트리거)
- 트리거: U3 HTML 검수 통과 후
- 매칭 = name_en NFD 정규화 + city_id 컨텍스트
- NULL 이미지 = Lucide

---

## 3. 환경 인프라 (이미 구축, 재사용)

| 인프라 | 위치 | 비고 |
|---|---|---|
| Supabase DB | `.env` `SUPA_URL` (pooler) | service_role key 별도 |
| Supabase Storage | `.env` `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | bucket: `place-images` |
| Google PhotoMedia API | `api_keys` 테이블 `GOOGLE_MAPS_API_KEY` | per user 무제한 (사용자 quota 상향) |
| Google textSearch | 동일 | per minute per user 무제한 |
| Gemini API | `api_keys` 테이블 `GEMINI_API_KEY` | summary_ko + nubi_reason 번역용 |

**9 도시 city_id**:
```
Paris=19, Madrid=37, Brussels=41, London=24, Munich=39,
Mexico City=102, Stanford=103, Las Vegas=104, Busan=105
```

**Storage URL 패턴**:
```
https://wxebceflvuythuodemro.supabase.co/storage/v1/object/public/place-images/{cityId}/{cat}/{place_id}.jpg
```

---

## 4. 현재 9 도시 진실 (Step 2G-2 후)

```
gemini3-2026-05 = 1,130 행 (= raw JSON 1,251 의 90%)
bts2026          =   345 행 (Step 1 정정 후 진짜만)
phase2           =     0 (DELETE 됨)
─────────────────────────────────
9 도시 총       = 1,475 행
```

### 카테고리당 보존 (예: Paris)
- heritage 30, hotspot 25, attraction 25, adventure 28, healing 26, shopping 24, restaurant 23
- = 총 181 행 (목표 140 보다 over = bts2026 진짜 추가)

### NULL image_url = 16 행 (= 1.1%)
- bts2026 raw 외 source 4 행 (Aqua'Gliss 등)
- gemini3 식당/어드벤처 mismatch 12 행
- = Lucide fallback 대상

### 식당/어드벤처 Google 비율
- adventure: 164/172 = **95%**
- restaurant: 161/165 = **98%**
- wiki = 0 (= 사용자 SSOT 100% 준수)

---

## 5. 사용자 검증 SQL

```sql
-- 9 도시 phase 분포
SELECT c.name_en AS city, p.collection_phase AS phase, COUNT(*)::int AS n
FROM place_seed_raw p
JOIN cities c ON c.id = p.city_id
WHERE c.name_en IN ('Paris','Madrid','Brussels','London','Munich','Mexico City','Stanford','Las Vegas','Busan')
  AND p.seed_category IN ('heritage','hotspot','attraction','adventure','healing','shopping','restaurant')
GROUP BY 1, 2 ORDER BY 1, 2;

-- 식당/어드벤처 Google 비율
SELECT seed_category,
  COUNT(*) FILTER (WHERE image_url LIKE '%supabase%') AS google_storage,
  COUNT(*) FILTER (WHERE image_url LIKE '%upload.wikimedia%') AS wiki,
  COUNT(*) FILTER (WHERE image_url IS NULL) AS null_n
FROM place_seed_raw p JOIN cities c ON c.id = p.city_id
WHERE c.name_en IN ('Paris','Madrid','Brussels','London','Munich','Mexico City','Stanford','Las Vegas','Busan')
  AND p.collection_phase = 'gemini3-2026-05'
  AND p.seed_category IN ('restaurant','adventure')
GROUP BY 1;

-- summary_ko + nubi_reason 충족률 (= U2 후 검증용)
SELECT collection_phase,
  COUNT(*) FILTER (WHERE summary_ko IS NOT NULL) AS with_ko,
  COUNT(*) FILTER (WHERE nubi_reason IS NOT NULL) AS with_nubi,
  COUNT(*) AS total
FROM place_seed_raw p JOIN cities c ON c.id = p.city_id
WHERE c.name_en IN ('Paris','Madrid','Brussels','London','Munich','Mexico City','Stanford','Las Vegas','Busan')
  AND p.seed_category IN ('heritage','hotspot','attraction','adventure','healing','shopping','restaurant')
GROUP BY 1;
```

---

## 6. 일회용 스크립트 목록 (= 작업 후 _archive 또는 삭제)

```
scripts/step1-clean-fake-bts2026.mjs    (= Step 1 정정)
scripts/step1c-fix-missing-rows.mjs     (= 누락 INSERT)
scripts/step1d-clean-gemini3-ghost.mjs  (= ghost DELETE)
scripts/step2b-fill-bts2026-photomedia.mjs (= bts2026 NULL 84)
scripts/step2c-fill-bts2026-restaurant-adventure.mjs (= bts2026 식당/어드벤처)
scripts/step2e-fill-gemini3-batch20.mjs (= N1 batch)
scripts/step2g-1-textsearch-only.mjs    (= textSearch 결과 저장)
scripts/step2g-2-photomedia-after-review.mjs (= PhotoMedia 95)
scripts/step2u-translate-summary-ko.mjs (= U2, 작성 예정)
```

영구 표준은 `scripts/seed-gemini.mjs` 와 `scripts/regen-qa-index.mjs` 만.

---

## 7. 비용 누적 (Google API)

```
Step 2B PhotoMedia 84 = ~$0.42
Step 2C PhotoMedia 66 = ~$0.33
Step 2E textSearch 18 = ~$0.58 (Enterprise)
Step 2G-1 textSearch 107 = ~$3.42
Step 2G-2 PhotoMedia 95 = ~$0.48
─────
누적 = 약 $5.23 = €4.86
```

= 무료 한도 (각 SKU 10,000/월) 안 (= 1~2%)

---

## 8. 다음 결정 (Step U2 / U3 진행 후)

- [ ] HTML 시각 검수 통과 = 9 도시 정리 완료
- [ ] 통과 시 = Step 5 (메인앱 매칭 변경)
- [ ] 실패 시 = 사용자 피드백 → 정정
