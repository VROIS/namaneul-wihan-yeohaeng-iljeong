# 08-wk-image-fill — Wikidata SPARQL 이미지 보강 (= 식당 제외 6 카테고리)

> ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT (= Paris 5-19 검증 = 28/30 TRUST UPDATE = 이미지 보유 37% → 62%) = 1 글자 변경 금지

= 활성 행 중 = **이미지 NULL + 식당/어드벤처 제외 + rank 21+ 또는 NULL** = Wikidata SPARQL 좌표 10m 검색 → P18 이미지 + 라벨/카테고리 score 계산 → TRUST/VERIFY/reject 분류 → 사용자 cc2 검수 후 UPDATE.

## 7 요소

| # | 요소 | 파일 | 상태 |
|---|---|---|---|
| 1 | **알고리즘 (= SPARQL + score 계산)** | [`process.md`](process.md) (= prompt 없음 = Wikidata API 사용) | ✅ |
| 2 | **API 설정** (= Wikidata SPARQL endpoint + UA) | 본 README + [`run.ts`](run.ts) | ✅ |
| 3 | **산출물 원본** | `docs/raw/{city_id}/08-wk-image-fill-candidates-{YYYY-MM-DD}.json` | ✅ |
| 4 | **실행 스크립트** (= dry-run = SPARQL + score) | [`run.ts`](run.ts) | ✅ |
| 5 | **필수 과정** | [`process.md`](process.md) | ✅ |
| 6 | **후처리 + DB UPDATE** | [`post-process.ts`](post-process.ts) | ✅ |
| 7 | **최종 보고서 템플릿** | [`report.md`](report.md) | ✅ |
| + | **교훈** | [`lessons.md`](lessons.md) | ✅ |

## 핵심 = Gemini 호출 X (= Wikidata SPARQL API 사용)

= 본 prompt = **Gemini X** = Wikidata SPARQL (= 무료 / 인증 없음 / 좌표 around 검색)
= UA = `TRIPIS/1.0 (contact@vibetrip.app) Expo/54` (= AOS Glide bypass = BTS 1주일 검증)

## API 설정

| 항목 | 값 |
|---|---|
| endpoint | `https://query.wikidata.org/sparql` |
| method | GET (= query in URL) |
| UA | `TRIPIS/1.0 (contact@vibetrip.app) Expo/54` (= 필수) |
| Accept | `application/sparql-results+json` |
| 검색 radius | 10m (= 사용자 SSOT) |
| timeout | 30 초 |

## 대상 행 SELECT

```sql
SELECT id, seed_category, rank, name_en, name_local, address, latitude, longitude
FROM place_seed_raw
WHERE city_id = $1
  AND seed_category NOT IN ('restaurant', 'adventure')  -- WK 오매칭 多
  AND (rank > 20 OR rank IS NULL)                        -- TOP 20 제외
  AND (image_url IS NULL OR image_url = '')              -- 이미지 NULL 만
  AND NOT (phase_tags && ARRAY['archived-*'])
```

## Score 계산 (= 사용자 SSOT 2026-05-19)

| 항목 | 점수 |
|---|---:|
| 좌표 ≤10m | +3 |
| 좌표 ≤50m | +2 |
| 좌표 ≤100m | +1 |
| 이름 LOWER 일치 (= name_en 또는 name_local) | +2 (= 완전 일치) / +1 (= 부분) |
| 카테고리 일치 (= heritage = 'cathedral'/'castle' 등) | +1 |
| 이미지 보유 (= P18) | +1 |

= **score ≥ 5 = TRUST** (= 자동 UPDATE 가능) / **3-4 = VERIFY** (= AI 또는 사용자 판별) / **≤2 = reject** (= SKIP)

## Wikimedia 이미지 URL 정규화 (= 사용자 SSOT)

- Wikimedia 원본 = `https://upload.wikimedia.org/wikipedia/commons/{x}/{xx}/{file}`
- 정규화 = `shared/lib/normalize-image-url.ts` 의 `normalizeImageUrl()` 사용 (= 메인앱 BTS 1주일 검증)
- 메인앱 표시 = `client/lib/wikimedia-image.ts` 의 `resolveImageSource()` (= UA + bucket + Platform 분기)

## 출처 + 검증

- **본 세션 (= 2026-05-19) Paris 검증** = 84 후보 행 dry-run
  - TRUST 30 (= score ≥ 5) / VERIFY 12 (= score 3-4) / reject 12 / no_candidate 30
- **사용자 cc2 검수 후 UPDATE** = 28/30 TRUST (= 2 행 = AI 검증 오패칭 = SKIP)
- **결과** = 이미지 보유율 = heritage/hotspot/healing 등 카테고리 = 87-100%

## 변경하려면?

= 사용자 명시 + 헌법 §17 (= 3 게이트) 후만.