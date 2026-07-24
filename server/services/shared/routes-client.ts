// ⚠️ 수정금지(승인필요) 2026-07-24 사장님 승인 = Google Routes API 단일 진입점 (§16 재발명 차단)
//   용도 = 일별 [바로가기] 선처리: 클릭 시점 화면 순서 그대로(재정렬 안 함 = 사장님 SSOT = 클릭 시점 상태가 사용자 최종 요구)
//   실도로·실시간 교통(TRAFFIC_AWARE) 기준 당일 실소요시간·이동거리 산출 = "그날 정말 갈 수 있나" 재검증.
//   비용 = TRAFFIC_AWARE = Routes Compute Routes Pro SKU $10/1000콜 = 클릭당 $0.01(옛 $200 월크레딧 폐지 2025-03). raw = saveRaw('routes') 보존(§18, 클릭당 발생 = localSkip).
//   키 = process.env.GOOGLE_MAPS_API_KEY (= 서버 기동 시 DB api_keys 로드 = server/index.ts loader와 동일 소스).
import { saveRaw } from "./save-raw";
import { pool } from "../../db";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export interface DayLiveStop {
  lat: number;
  lng: number;
}

export interface DayLiveResult {
  durationSec: number; // 당일 총 이동 실소요(초)
  distanceKm: number; // 당일 총 이동거리(km)
}

// 딥링크용 = 좌표로 PSR(백엔드) 조회 = PID + 한국어명(구글맵에 주소 대신 장소명 표시 = 2026-07-24 사장님 SSOT).
//   슬롯 rawData 엔 PID 미탑재(DB-only) → 좌표만 넘기면 구글이 근처 주소를 라벨로 붙임(사장님 지적). PSR PID 를 실어 정확한 장소명 노출.
export interface EnrichedStop {
  lat: number;
  lng: number;
  placeId: string | null;
  nameKo: string | null;
  nameLocal: string | null;
}

export async function enrichStopsWithPsr(
  stops: DayLiveStop[],
): Promise<EnrichedStop[]> {
  if (!pool || !stops.length) {
    return stops.map((s) => ({
      ...s,
      placeId: null,
      nameKo: null,
      nameLocal: null,
    }));
  }
  const lats = stops.map((s) => s.lat);
  const lngs = stops.map((s) => s.lng);
  // 좌표 ~100m 박스 내 최근접 PSR 1개 (idx 로 순서 보존). 없으면 NULL(폴백=좌표).
  const r = await pool.query(
    `SELECT q.idx, m.google_place_id, m.name_ko, m.name_local
     FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS q(lat, lng, idx)
     LEFT JOIN LATERAL (
       SELECT google_place_id, name_ko, name_local FROM place_seed_raw p
       WHERE p.latitude BETWEEN q.lat - 0.0009 AND q.lat + 0.0009
         AND p.longitude BETWEEN q.lng - 0.0009 AND q.lng + 0.0009
       ORDER BY (p.latitude - q.lat) * (p.latitude - q.lat)
              + (p.longitude - q.lng) * (p.longitude - q.lng) ASC
       LIMIT 1
     ) m ON true
     ORDER BY q.idx`,
    [lats, lngs],
  );
  return stops.map((s, i) => {
    const row = r.rows.find((x: any) => Number(x.idx) === i + 1);
    return {
      lat: s.lat,
      lng: s.lng,
      placeId: row?.google_place_id ?? null,
      nameKo: row?.name_ko ?? null,
      nameLocal: row?.name_local ?? null,
    };
  });
}

// 왕복 실소요시간 = 출발/도착(endpoint) + 경유지(slots). endpoint = 숙소 좌표 또는 도시명 주소(구글 지오코딩).
//   도시명 주소 방식 = 도심중심 좌표 조회 불필요(구글이 알아서) = 사장님 SSOT 2026-07-24.
export type RouteEndpoint = { lat: number; lng: number } | { address: string };

export async function computeDayRouteLive(
  slots: DayLiveStop[],
  endpoint: RouteEndpoint,
): Promise<DayLiveResult> {
  if (!Array.isArray(slots) || slots.length < 1) {
    throw new Error("[routes-client] 경유지 1개 이상 필요");
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("[routes-client] GOOGLE_MAPS_API_KEY 없음");

  const toWp = (s: DayLiveStop) => ({
    location: { latLng: { latitude: s.lat, longitude: s.lng } },
  });
  // endpoint = 좌표(숙소) 또는 주소(도시명). 왕복이라 origin=destination=endpoint.
  const ep =
    "address" in endpoint
      ? { address: endpoint.address }
      : {
          location: {
            latLng: { latitude: endpoint.lat, longitude: endpoint.lng },
          },
        };
  const body = {
    origin: ep,
    destination: ep,
    intermediates: slots.map(toWp),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
  };
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify(body),
  });
  const raw: any = await res.json().catch(() => null);
  await saveRaw({
    source: "routes",
    contextId: "runtime",
    tag: "day-live",
    request: body,
    raw,
    localSkip: true, // 사용자 클릭당 발생 = 로컬 skip(스토리지만 = §18 보존 유지)
  });
  if (!res.ok) {
    throw new Error(
      `[routes-client] HTTP ${res.status} = ${JSON.stringify(raw)?.slice(0, 180)}`,
    );
  }
  const r = raw?.routes?.[0];
  const durationSec =
    parseInt(String(r?.duration || "0").replace("s", ""), 10) || 0;
  const distanceKm = (r?.distanceMeters || 0) / 1000;
  return { durationSec, distanceKm };
}
