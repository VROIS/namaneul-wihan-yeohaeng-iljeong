# 12-ts-discover-pool — TS 식당 발굴 풀 (외곽 + 시내) 표준

> ⚠️ 수정금지(승인필요) 2026-06-02 사용자 SSOT = Google Places API (New)로 식당 풀 발굴 → 가격대별 RC 정렬 → DB-only 동선 최적화용.
> 모드 2개: **외곽(zone=outskirt)** = day-trip 명소별 circle / **시내(zone=downtown)** = 도심 단일 원형 3종 합본.
> 신규 도시 = `destinations.ts` 추가 + 아래 순서 그대로 = 동일 결과 보장 (= 헌법 §16 영구 컴포넌트).

## 핵심 SSOT (= 입증된 사실, 추측 X)

- **인기/리뷰 발굴 = `searchNearby` + `rankPreference:POPULARITY`** (= 진짜 인기순). `searchText`(관련성)는 리뷰 5만짜리 챔피언(Bouillon Pigalle)을 놓침 = 입증됨. → [[reference_ts_searchnearby_popularity]]
- **검색당 상한**: searchText = **60** (20×3 페이지, nextPageToken) / searchNearby = **20** (페이지네이션 없음). → 합본으로 커버.
- **SKU = Enterprise $35/1K** (9필드). `rankPreference`·`priceLevels`는 필드가 아니라 = 비용 영향 0. Atmosphere 0 (= validateFieldMask 가드 = §15). nearby/text 동일 단가 + 각자 무료 1,000/월.
- **가격필터(priceLevels) = searchText 전용** (searchNearby엔 없음). POPULARITY = searchNearby 전용. → 둘을 한 콜에 못 합침.
- **잡음 필터**: `primaryType` 블랙리스트(department_store/movie_theater/hotel/museum 등) = 식당 아님 = 식당풀 제외 = 원 카테고리(shopping/hotel) 유지 (= 1장소1row, [[feedback_single_db_no_app_specific_columns]]).
- **글로벌 UNIQUE(city_id, name_norm)**: 동명 1개만(RC 높은쪽) + INSERT 충돌 시 skip(크래시 X, 기존 행 보존).
- **가격 = GREATEST** (시내, 절대 안 낮춤 = [[feedback_price_max_always]]) / 외곽 = 덮어쓰기(오염청소).
- **이미지 PM = FE 노출분만** = 가격대별 RC 상위 quota (시내 eco20/reason40/premium20). 런타임 백필(ag3 uploadPhoto)과 **동일 프로세스** = place-images 버킷 + PUT + `{cityId}/{cat}/{PID}.jpg`. 로컬은 SERVICE_ROLE(ANON 비어있음) / Replit 런타임은 ANON. 병렬 10개씩.

## 시내(downtown) 표준 — 3종 합본 발굴

```bash
CITY=19; DATE=$(date +%F)
# 1. nearby = 인기 챔피언 (POPULARITY 20)
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY --zone=downtown --method=nearby --label=nearby
# 2. text = 관련성 넓이 (60)
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY --zone=downtown --method=text --pages=3 --label=text
# 3. premium = 고급 가격필터 (priceLevels)
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY --zone=downtown --method=text --pages=3 --price-levels=EXPENSIVE,VERY_EXPENSIVE --label=premium
# 4. 병합 + 잡음필터 + name-dedup + tier×RC = upsert (dry-run 먼저, 그 후 --apply)
npx tsx .../12-ts-discover-pool/post-process.ts --city-id=$CITY --zone=downtown --date=$DATE          # dry-run
npx tsx .../12-ts-discover-pool/post-process.ts --city-id=$CITY --zone=downtown --date=$DATE --apply  # 반영
# 5. 한국 요약 2개 + 가격(unknown만) = 13번 (RC>0 & summary 없는 식당, batch 40)
npx tsx .../13-restaurant-summary/run.ts --city-id=$CITY
npx tsx .../13-restaurant-summary/post-process.ts --city-id=$CITY --date=$DATE --apply
# 6. 이미지 PM = FE 노출분 (가격대별 RC 상위). --limit=3 테스트 먼저 권장
npx tsx .../12-ts-discover-pool/image-pool.ts --city-id=$CITY --zone=downtown --date=$DATE --apply --limit=3
npx tsx .../12-ts-discover-pool/image-pool.ts --city-id=$CITY --zone=downtown --date=$DATE --apply   # --eco=20 --reason=40 --premium=20 기본
```

## 외곽(outskirt) 모드

```bash
# day-trip 명소별 circle (method=text 기본, 명소당 1콜)
npx tsx .../12-ts-discover-pool/run.ts --city-id=$CITY --zone=outskirt
npx tsx .../12-ts-discover-pool/post-process.ts --city-id=$CITY --zone=outskirt --date=$DATE --apply
npx tsx .../12-ts-discover-pool/image-pool.ts --city-id=$CITY --zone=outskirt --date=$DATE --apply   # 명소별 fill-to-10
# 발굴이 놓친 진짜 명소 = recover-by-name (manual-additions.ts 에 이름 추가 후)
npx tsx .../12-ts-discover-pool/recover-by-name.ts --city-id=$CITY --apply
```

## 신규 도시 추가

`destinations.ts` 에 추가:
```ts
<cityId>: {
  downtown: [{ name: '<City>', lat: <중심>, lng: <중심>, radius: 10000 }],  // = 도심 단일 원형
  outskirt: [{ name: '<명소>', lat, lng, radius }, ...],                     // = day-trip 명소
},
```

## 파일

| 파일 | 역할 |
|---|---|
| `destinations.ts` | 도시별 구역 config (downtown 단일원형 + outskirt 명소들) |
| `run.ts` | 발굴 = text(관련성)/nearby(POPULARITY) + label + price-levels + pages + primaryType |
| `post-process.ts` | 병합(zone 전 변형 파일) + 거리/폐업/잡음(primaryType) 필터 + place_id·name_norm 중복제거 + tier×RC + upsertPlace(충돌 skip) |
| `image-pool.ts` | FE 노출분 이미지 PM (시내 tier quota / 외곽 명소별 fill-to-10) |
| `recover-by-name.ts` | 이름으로 개별 TS 보강 (manual-additions.ts) |
| `manual-prices.ts` / `manual-additions.ts` | 수동 보강 데이터 |

## Paris(19) 검증 결과 (2026-06-02)

- **시내 125 → 220곳** (신규 94 INSERT + 28 UPDATE). RC 24→**124**. summary/price **100%**. 이미지 FE노출 **72곳**.
- 비식당 5곳(Printemps/UGC/Generator/Galerie Vivienne/IMA) = 원 카테고리 유지(식당풀 제외).
- 동명 충돌 1 skip (Bouillon Chartier = 기존 RC 48k 행 보존). **dup_pid 0.**
- 외곽 141곳 = 별도 기 완료 (이미지 64).
