// ⚠️ 수정금지(승인필요) 2026-05-16 = 장소 모달 폐기 + 외부 Google Maps 앱 즉시 호출 = 단일 진입점
// = 사용자 SSOT (= "장소 클릭 → 즉시 큰 정보 페이지 1 단계 → 우리 모달 X")
// = Google Maps URLs API 공식 = api=1 필수 = 모바일 네이티브 앱 자동 호출
// = 근거 = https://developers.google.com/maps/documentation/urls/get-started

import { Linking } from 'react-native';

/** Google Place ID 표준 prefix = base64 인코딩 헤더 (= 모든 PID = "ChIJ..." 시작) */
const GOOGLE_PLACE_ID_PREFIX = 'ChIJ';

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
  // 옛 객체 호환 (= TripPlannerScreen 의 place = name 필드)
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
  if (p.googleMapsUri && p.googleMapsUri.startsWith('http')) {
    Linking.openURL(p.googleMapsUri);
    return;
  }

  const name = p.nameEn || p.name || p.nameLocal || p.nameKo || '';
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
  console.warn('[openPlaceInMaps] 빈 input = name + PID + URI 모두 없음 = URL 호출 스킵', p);
}
