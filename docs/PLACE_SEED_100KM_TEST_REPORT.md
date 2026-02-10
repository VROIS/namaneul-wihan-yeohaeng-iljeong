# Place Seed 전 도시 100km 반경 적용 — 내부 테스트 결과 보고

> **실행일**: 2026-02-10  
> **목적**: Place Seed 로직을 “전 도시 공통 도심+근교 100km”로 확대 적용한 뒤, 코드·빌드·리포트 검증

---

## 1. 적용 내용

| 항목 | 내용 |
|------|------|
| **반경 상수** | `CITY_SEARCH_RADIUS_METERS = 100000` (place-seeder.ts) |
| **적용 범위** | 전 도시 공통 — `seedCityPlacesOneCategory`, `seedCityPlaces` 모두 해당 상수 사용 |
| **변경 전** | 10km(10000m) 수준 사용 구간 → 100km(100000m)로 통일 |

- **seedCityPlacesOneCategory**: 1일 1카테고리 시딩 시 `searchNearby(..., CITY_SEARCH_RADIUS_METERS)` 사용 ✓  
- **seedCityPlaces**: 도시 일괄 시딩 시 `searchNearby(..., CITY_SEARCH_RADIUS_METERS)` 사용 ✓  

---

## 2. 내부 테스트 결과

| 검증 항목 | 결과 | 비고 |
|-----------|------|------|
| **코드 반영** | ✓ | place-seeder.ts 44행 상수, 203·305행 호출부 확인 |
| **서버 빌드** | ✓ | `npm run server:build` 성공 |
| **파리 데이터 리포트** | ✓ | `npx tsx dev/report-paris-data.ts` 정상 실행 |
| **API 키 없이 실행** | ✓ | GOOGLE_MAPS_API_KEY 미설정 시에도 리포트·DB 조회 정상 |

---

## 3. 파리 현재 상태 (리포트 스크립트 기준)

- **전체 장소**: 153건  
- **4대분류**: attraction 68 \| restaurant 59 \| cafe 26 \| hotel 0  
- **목표 대비**: attraction/restaurant ✓, cafe 26/30 (1일 1카테고리 1회 추가 시 30건 가능)  
- **가공**: Naver 28건, Instagram 121건, Place Prices 651건 연결  

---

## 4. 정리 및 다음 단계

- **전 도시 100km 확대 적용**: 코드 반영·빌드·리포트 기준으로 완료.  
- **실제 Places API 호출(100km 요청) 검증**: `GOOGLE_MAPS_API_KEY` 설정 후 `POST /api/admin/seed/places/paris-daily` 또는 스케줄러 `seedPriorityCityByCategory()` 1회 실행 시, 로그/응답에서 반경 100000m 사용 여부 확인 가능.  
- Google Places API가 100km 상한을 두는 경우, 필요 시 50km 등으로 상수만 조정 후 동일 로직 유지.

---

*보고서 작성: 2026-02-10*
