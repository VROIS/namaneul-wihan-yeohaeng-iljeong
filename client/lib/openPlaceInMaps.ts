// ⚠️ 수정금지(승인필요) 2026-05-16 = 장소 모달 폐기 + 외부 Google Maps 앱 즉시 호출 = 단일 진입점
// = 사용자 SSOT (= "장소 클릭 → 즉시 큰 정보 페이지 1 단계 → 우리 모달 X")
// = Google Maps URLs API 공식 = api=1 필수 = 모바일 네이티브 앱 자동 호출
// = 근거 = https://developers.google.com/maps/documentation/urls/get-started

import { Linking } from "react-native";

/** Google Place ID 표준 prefix = base64 인코딩 헤더 (= 모든 PID = "ChIJ..." 시작) */
const GOOGLE_PLACE_ID_PREFIX = "ChIJ";

export interface PlaceForMaps {
  // ⚠️ 수정금지(승인필요) 2026-05-20 = 0 순위 = google_maps_uri (= cid URL = 100% 정확)
  googleMapsUri?: string | null;
  googlePlaceId?: string | null;
  nameEn?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
  address?: string | null;
  // pipeline-v3.ts:643 = AG2 응답 풀주소 = geminiAddress 필드로 저장 (= place.address X)
  geminiAddress?: string | null;
  // TripPlannerScreen 의 place = name 필드 수용
  name?: string | null;
}

/**
 * Google Maps 공식 URL 호출 = api=1 필수.
 * = 0 순위 google_maps_uri (= cid URL) = 100% 정확 = 직접 호출 (= 사용자 SSOT 2026-05-20)
 * = 1 순위 PID = query_place_id 추가 = 100% 정확 (= Sainte-Chapelle 스샷 동작)
 * = 2 순위 PID 없음 → name + address 텍스트 검색 (= 공식 권장)
 */
export function openPlaceInMaps(p: PlaceForMaps): void {
  // ⚠️ 수정금지(승인필요) 2026-05-20 = 0 순위 = google_maps_uri 직접 호출 (= 사용자 SSOT = TS 검증 cid URL)
  if (p.googleMapsUri && p.googleMapsUri.startsWith("http")) {
    Linking.openURL(p.googleMapsUri);
    return;
  }

  // ⚠️ 2026-08-22 사장님 원칙 = nameEn>nameLocal 체인 정렬(공식명 우선 = 지도검색 정확도)
  const name = p.nameEn || p.nameLocal || p.name || p.nameKo || "";
  const address = p.address || p.geminiAddress;
  const query = encodeURIComponent(address ? `${name},${address}` : name);

  if (p.googlePlaceId && p.googlePlaceId.startsWith(GOOGLE_PLACE_ID_PREFIX)) {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${p.googlePlaceId}`,
    );
    return;
  }
  if (name) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    return;
  }
  console.warn(
    "[openPlaceInMaps] 빈 input = name + PID + URI 모두 없음 = URL 호출 스킵",
    p,
  );
}

// ⚠️ 수정금지(승인필요) 2026-07-24 사장님 승인 = 일별 [바로가기] = 그 날 동선을 구글맵 dir 모드로 열기(무료 딥링크).
//   ⚠️ 출발지+경유지+도착지 = 왕복(사장님 SSOT). 출발/도착(origin·destination):
//     - 숙소 변경시 = 숙소명+placeId(정확).
//     - 미설정 = **도시명 텍스트**("Paris") = 구글맵이 알아서 도시 중심으로 잡음(사장님 SSOT 2026-07-24 = 좌표 조회 불필요·견고).
//   경유지(waypoints) = 그날 슬롯(클릭 시점 순서, 재정렬 안 함) = PID+이름 보충됨.
//   노출명 = place_id 있으면 구글 공식명(기기언어), 없으면 우리 텍스트. 좌표는 주소로 역표기되니 이름 우선.
//   경유지 상한 = 9(공식). 초과 = 순서 보존 절삭. 구글맵 앱 없는 모바일 브라우저 = 3개 제한(한계).

export interface DayRouteStop {
  name?: string | null; // 경유지 표시 라벨(이름 우선). PID 있으면 구글 공식명이 우선.
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}

// 출발/도착 = 숙소(좌표+placeId) 또는 도시명 텍스트(좌표 없음 = 구글이 도시중심 지오코딩).
export interface DayRouteEnd {
  name?: string | null; // 도시명("Paris") 또는 숙소명. 있으면 라벨.
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
}

const MAX_DIR_WAYPOINTS = 9;

function endLabel(e: DayRouteEnd): string | null {
  if (e.name?.trim()) return encodeURIComponent(e.name.trim());
  if (typeof e.lat === "number" && typeof e.lng === "number")
    return `${e.lat},${e.lng}`;
  return null; // 이름·좌표 둘 다 없음 = 무효
}

export function buildDayRouteUrl(
  waypoints: DayRouteStop[],
  origin: DayRouteEnd,
  destination: DayRouteEnd,
): string | null {
  let mids = (waypoints || []).filter(
    (s) => typeof s?.lat === "number" && typeof s?.lng === "number",
  );
  const oL = endLabel(origin);
  const dL = endLabel(destination);
  if (!oL || !dL || mids.length < 1) {
    console.warn("[buildDayRouteUrl] 출발/도착/경유지 부족 = 스킵");
    return null;
  }
  if (mids.length > MAX_DIR_WAYPOINTS) {
    console.warn(
      `[buildDayRouteUrl] 경유지 ${mids.length} > ${MAX_DIR_WAYPOINTS} = 순서 보존 절삭`,
    );
    mids = mids.slice(0, MAX_DIR_WAYPOINTS);
  }
  const hasPid = (s: DayRouteEnd | DayRouteStop) =>
    !!s.googlePlaceId?.startsWith(GOOGLE_PLACE_ID_PREFIX);

  const qs = [
    "api=1",
    "travelmode=driving", // 드라이빙 가이드 전용 버튼
    `origin=${oL}`,
    `destination=${dL}`,
  ];
  if (hasPid(origin)) qs.push(`origin_place_id=${origin.googlePlaceId}`);
  if (hasPid(destination))
    qs.push(`destination_place_id=${destination.googlePlaceId}`);
  // 경유지 라벨 = 이름(주소 아님) 우선. PID 전원 보유 시에만 1:1 첨부(API 요구 = 개수 정렬).
  qs.push(
    `waypoints=${mids
      .map((s) =>
        s.name?.trim()
          ? encodeURIComponent(s.name.trim())
          : `${s.lat},${s.lng}`,
      )
      .join("%7C")}`,
  );
  if (mids.every(hasPid)) {
    qs.push(
      `waypoint_place_ids=${mids.map((s) => s.googlePlaceId).join("%7C")}`,
    );
  }
  return `https://www.google.com/maps/dir/?${qs.join("&")}`;
}

// 구글맵 URL 열기 = 단일 진입점 유지(컴포넌트가 Linking 직접 import 안 함)
export function openMapsUrl(url: string): void {
  Linking.openURL(url);
}
