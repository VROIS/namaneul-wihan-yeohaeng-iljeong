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

  const name = p.nameEn || p.name || p.nameLocal || p.nameKo || "";
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

// ⚠️ 수정금지(승인필요) 2026-07-24 사장님 승인 = 일별 [바로가기] = 그 날 전체 동선을 구글맵 dir 모드로 열기(무료 딥링크).
//   순서 = 클릭 시점 화면 순서 그대로(재정렬 안 함 = 사장님 SSOT = 식사 배치·앱 리스트와 일치).
//   ⚠️ 노출명 = 슬롯처럼 한국어명(name = nameKo) = 라벨 = 사장님 SSOT 2026-07-24("경유지에 주소는 안됨").
//     좌표만 넘기면 구글이 근처 주소를 라벨로 붙임(공식문서 = 좌표는 핀만·장소정보 없음) → 백엔드(day-live)가 PSR 에서 PID+한국어명 보충.
//   규격 = Maps URLs API 공식: origin/destination(+*_place_id), waypoints=이름텍스트|… (+waypoint_place_ids 전원 보유 시 1:1 = 정확도).
//   경유지 상한 = 9(공식). 초과 = 순서 보존 앞 9개 절삭. 구글맵 앱 없는 모바일 브라우저 = 3개 제한(공식 명시 = 한계).

export interface DayRouteStop {
  name?: string | null; // 표시 라벨 = 한국어명(nameKo) 우선 = 주소 대신 장소명 노출
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}

const MAX_DIR_WAYPOINTS = 9;

export function buildDayRouteUrl(stops: DayRouteStop[]): string | null {
  const pts = (stops || []).filter(
    (s) => typeof s?.lat === "number" && typeof s?.lng === "number",
  );
  if (pts.length < 2) {
    console.warn("[buildDayRouteUrl] 지점 2개 미만 = 스킵");
    return null;
  }
  const origin = pts[0];
  const dest = pts[pts.length - 1];
  let mids = pts.slice(1, -1);
  if (mids.length > MAX_DIR_WAYPOINTS) {
    console.warn(
      `[buildDayRouteUrl] 경유지 ${mids.length} > ${MAX_DIR_WAYPOINTS} = 순서 보존 절삭`,
    );
    mids = mids.slice(0, MAX_DIR_WAYPOINTS);
  }
  const hasPid = (s: DayRouteStop) =>
    !!s.googlePlaceId?.startsWith(GOOGLE_PLACE_ID_PREFIX);
  // 라벨 = 이름(한국어명) 우선 = 주소 노출 금지(사장님 SSOT). 이름 없을 때만 좌표 폴백. PID 는 정확도 앵커로 별도 첨부.
  const label = (s: DayRouteStop) =>
    s.name?.trim() ? encodeURIComponent(s.name.trim()) : `${s.lat},${s.lng}`;

  const qs = [
    "api=1",
    "travelmode=driving", // 드라이빙 가이드 전용 버튼
    `origin=${label(origin)}`,
    `destination=${label(dest)}`,
  ];
  if (hasPid(origin)) qs.push(`origin_place_id=${origin.googlePlaceId}`);
  if (hasPid(dest)) qs.push(`destination_place_id=${dest.googlePlaceId}`);
  if (mids.length) {
    // 경유지 라벨 = 한국어명(주소 아님). PID 는 전원 보유 시에만 1:1 첨부(API 요구 = 개수 정렬).
    qs.push(`waypoints=${mids.map(label).join("%7C")}`);
    if (mids.every(hasPid)) {
      qs.push(
        `waypoint_place_ids=${mids.map((s) => s.googlePlaceId).join("%7C")}`,
      );
    }
  }
  return `https://www.google.com/maps/dir/?${qs.join("&")}`;
}

// 구글맵 URL 열기 = 단일 진입점 유지(컴포넌트가 Linking 직접 import 안 함)
export function openMapsUrl(url: string): void {
  Linking.openURL(url);
}
