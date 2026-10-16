# 여정 지도 고정섹션 + 숙소 + 저장 통합 설계 (작업3+4+항목5)

> **작성**: 2026-06-28. superpowers brainstorming → 구현 계약서.
> **배경**: 사장님 SSOT로 작업3(숙소)·작업4(저장)·항목5(지도)가 사실상 **하나의 통합 작업**으로 확정됨.
> **대상**: 여정 결과화면(C) — `client/screens/TripPlannerScreen.tsx` + 신규 지도 컴포넌트 + 기존 BE 재사용.
> **검증**: Supabase Storage 402(이미지) = 사장님 결제영역, 7/1 재시도. 코드 무관.

---

## 0. 사장님 SSOT (단답 Q&A로 확정)

1. **지도 = 고정 섹션** (현 "지도" 탭 토글 → 항상 표시). 요약헤더 아래, 슬롯 위.
2. **BTS 미니앱 지도 패턴 동일** = 슬롯이 지도 위 **마커**, 마커 클릭 → 해당 슬롯 스크롤(인터랙티브).
3. **동선 polyline 라인 = 폐기** (불필요).
4. **웹/앱 동일** = BTSPlaceMap 패턴(웹 div+Google Maps SDK / 앱 WebView+SDK).
5. **출발 마커 = 깃발 Lucide 아이콘** = 숙소 미설정 시 도시중심(디폴트) / 숙소 입력 후 그 위치로 이동.
6. **숙소 설정 = 입력창만** (별도 구글맵 모달 ❌). 지도가 이미 떠 있으니 주소 입력 → 지도 깃발 이동 + 백그라운드 재최적화.
7. **숙소 동선 = 순서만 재최적화(장소 고정)** = 기존 `regenerateDay` 재사용. 장소 재선정/재분배 안 함(중복·재분배 난제 회피).
8. **Day별 숙소 가능** (파리 기점 1일씩 / 3일 살기 중간 숙소 변경 = 기존 Day 단위 구조).
9. **저장**: 비로그인 저장 유지(추후 "로그인없이 둘러보기" 삭제 예정). Day별 숙소 = 디폴트 저장(사용자 변경 안 하면 유지).

---

## A. 지도 고정섹션 (항목5 = 핵심 신규)

### 현재 (교체 대상)
- `client/components/InteractiveMap.tsx` = 토글 표시 / **웹 폴백("Expo Go에서 지도 확인")** / 서버 HTML + **동선 polyline 포함** / 마커 클릭 인터랙티브 없음.
- 하단탭 "지도" = 토글 더미탭 ([MainTabNavigator.tsx:30](../../../client/navigation/MainTabNavigator.tsx)).

### 목표 (BTSPlaceMap 패턴 일반화)
- 참조 원본: [BTSPlaceMap.tsx](../../../client/components/bts/BTSPlaceMap.tsx) + [bts-map-html.ts](../../../client/components/bts/bts-map-html.ts)
- 신규: `client/components/ItineraryMap.tsx` (BTSPlaceMap 패턴 재사용·여정화)
  - **웹** = `<div>` + Google Maps SDK 직접 (`new google.maps.Map`)
  - **앱** = `react-native-webview` + HTML(Google Maps SDK)
  - 카테고리 색상·Lucide SVG 마커 = `bts-marker-svg.ts` 재사용 (heritage·attraction·healing·shopping·restaurant 동일)

### BTS↔여정 데이터 차이 (구현 시 매핑)
| 항목 | BTSPlaceMap | ItineraryMap |
|---|---|---|
| place id | number | string ("db-N") → 마커 id 매핑 필요 |
| 마커 대상 | selectedIds(카트) only | **전 슬롯 항상** |
| 특수 마커 | venue(공연장, 별+BTS라벨) | **출발(깃발): 도시중심/숙소** |
| 클릭 동작 | onMarkerPress→카트 스크롤 | onMarkerPress→**슬롯 스크롤** |
| polyline | 없음 | 없음(폐기 = 일치) |
| 좌표 | latitude/longitude | place.lat/place.lng |

### 동작
- 슬롯(place.lat/lng)마다 카테고리 마커. 번호(①②③) 표시 검토(슬롯 순서).
- 출발 마커 = **깃발 Lucide 아이콘**(`flag` 또는 눈에 띄는 것), 위치 = dayAccommodation 좌표 ?? 도시중심(formData.destinationCoords).
- 마커 클릭 → 해당 슬롯으로 ScrollView 스크롤(BTSPlaceMap onMarkerPress 패턴).
- Day 전환 시 그 Day 마커만 표시(또는 전체 — 구현 시 확정).
- **항상 표시** = 토글 제거.

---

## B. 숙소 설정 (작업3 = 지도 연동)

### 현재
- Day헤더 "숙소 설정" 버튼 → PlaceAutocomplete 모달 → `handleSetDayAccommodation` → `/api/routes/regenerate-day`.
- 코드: [TripPlannerScreen.tsx:294](../../../client/screens/TripPlannerScreen.tsx#L294)

### 목표
- 숙소 입력(주소/숙소명 검색) → **지도 출발 깃발 마커가 그 위치로 이동** + 백그라운드 `regenerateDay` 호출(기존).
- 별도 구글맵 모달 ❌ (지도 고정섹션이 이미 있음).
- 입력화면 숙소칸도 동일 맥락(선택).

### ⚠️ 숙소 좌표 출처 = 구글 검색(외부), 우리 DB 아님 (사장님 SSOT 2026-06-28)
- 숙소 = **우리 내부 리소스(place_seed_raw) 아님.** 구글맵 검색 방식처럼 숙소명/행정 풀주소로 검색.
- 현 `PlaceAutocomplete`가 정확히 그 구조:
  - 입력 → `/api/places/autocomplete`(구글 Places, 우리 DB 아님) → 드롭다운
  - 선택 → `/api/places/details` → **구글이 좌표 반환**(`coords:{lat,lng}`). 신규 장소든 구글이 가진 모든 장소 좌표.
- 우리는 받아온 좌표만 → **우리 지도 위 우리 마커(깃발)로만 표시.** (구글 핀 아님)
- = "선택한 좌표 어떻게 아나?" 답 = 구글 details API가 줌. 우리 DB 저장 불필요.
- → **PlaceAutocomplete 검색방식 그대로 유지** + 받아온 coords를 ItineraryMap 출발 깃발에 연결. 구글맵 모달·지도 직접 핀찍기 불필요.

### BE (이미 구현 = 재사용)
- `regenerateDay` ([itinerary-generator.ts:1199](../../../server/services/itinerary-generator.ts#L1199)):
  - 숙소 좌표 기준 NN+2-opt **순서만 재최적화**(장소 고정)
  - 숙소→첫장소(departureTransit) / 마지막장소→숙소(returnTransit) Haversine 재계산
  - 식사 슬롯 위치 보존
- **거의 그대로 재사용.** 신규 BE 없음.

---

## C. 저장 (작업4)

### 현재 / 수정
- 저장 enum 버그 = **이미 수정**(routes.ts travel_style → persona enum 변환, 미커밋).
- 프로필 "나의 여정" 표시 = **이미 있음** ([ProfileScreen.tsx:218](../../../client/screens/ProfileScreen.tsx#L218), `/api/users/{id}/itineraries`).

### 목표
- 저장(💾) → DB itineraries. **Day별 숙소(dayAccommodations) = rawData에 포함** → 디폴트 유지.
- 프로필 섬네일 = 도시+요약헤더 = 기존 카드 재사용.
- 비로그인 저장 유지(userId=admin 강제 = 현행).

---

## D. 구현 순서 (제안)

1. **ItineraryMap.tsx 신규** (BTSPlaceMap 패턴 일반화) — 웹/앱 마커+클릭, polyline 없음. 🔴 가장 큼.
2. **결과화면 통합** — InteractiveMap(토글) → ItineraryMap(고정섹션) 교체. 토글탭 제거. 옛 InteractiveMap 삭제(§19).
3. **출발 깃발 마커** = 도시중심/숙소 좌표 연동.
4. **숙소 입력 → 깃발 이동 + regenerateDay** 배선 (기존 handleSetDayAccommodation 활용).
5. **저장** = dayAccommodations rawData 포함 확인 + 프로필 섬네일 검증.
6. 5단계 검증(tsc·빌드·§19가드·simplify·review) → 커밋.

## E. 검증
- 시각검증 = 운영앱 배포 후 Chrome DevTools (웹 지도 뜨는지 = BTS패턴이라 웹에서도 떠야 함).
- 이미지 썸네일은 Storage 402 해결(7/1) 후 별개 확인.
- ⚠️수정금지 코드(BTSPlaceMap·bts-map-html = BTS 보호) = **복사 재사용**, 원본 미변경.

## F. 미해결/보류
- C-F 교통/메트로/비용(€875) 산정로직 = 별도 보류.
- 이미지 402 = 사장님 Supabase 결제 영역.
