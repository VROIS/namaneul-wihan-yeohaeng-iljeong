// ⚠️ 수정금지(승인필요) 2026-06-05 = NN+Haversine 로컬 동선 = handleRouteRequest(Gemini) 동형 대체 (= 사용자 SSOT)
// = 입력 동일(skeleton, places, cityCoords) / 출력 동일(RouteResponse) = AG4-DB drop-in 가능
// = 부품 재사용(헌법 §16, 재발명 X):
//     · haversineKm / calcTransitHaversine  ← transit-haversine.ts (단일 Haversine SSOT)
//     · pickRestaurantBySegment / pickRestaurantNearVenue ← route-matcher.ts (식당 거리선택 SSOT)
// = Gemini 0 / 외부호출 0 / 비용 0 / 결정적(deterministic) → 시뮬 결과 = 라이브 결과 동일
// = NN(최근접) + 2-opt 동선정렬 = 옛 optimizeDayRoute(itinerary-generator, 폐기경로 private) 알고리즘과 동일 = route 모듈 단일 전방 소스
import type { AG1Output, PlaceResult } from "../agents/types";
import { minutesToTime } from "../agents/types";
import {
  haversineKm,
  calcTransitHaversine,
  type TravelMode,
} from "../agents/transit-haversine";
import {
  pickRestaurantBySegment,
  pickRestaurantNearVenue,
  type GeoPoint,
} from "../route-matcher";
import type {
  RouteResponse,
  RouteScene,
  RouteHandlerResult,
} from "./route-types";

type LatLng = { lat: number; lng: number };

// 유효 좌표 = NULL/0 아님 (= NN 제외 대상 판정)
const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// PlaceResult.id ("db-123") → 숫자 id (route-matcher GeoPoint 호환)
const idNum = (id: string): number => {
  const n = parseInt(String(id).replace(/^db-/, ""), 10);
  return Number.isFinite(n) ? n : -1;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 일자 1개 동선 정렬 = Nearest Neighbor + 2-opt + Haversine
 * = 출발(start)에서 가장 가까운 곳 순 방문(NN) → 교차(지그재그) 구간을 뒤집어 제거(2-opt) → 도착(end) anchor
 * = NULL 좌표 행은 제외 후 마지막에 배치 (= 999km 폭탄 방지)
 */
function orderByNN(items: PlaceResult[], start: LatLng, end: LatLng): PlaceResult[] {
  const valid = items.filter(hasCoord);
  const invalid = items.filter((p) => !hasCoord(p));
  if (valid.length <= 1) return [...valid, ...invalid];

  // 1) Nearest Neighbor = 출발지에서 가까운 순
  const remaining = [...valid];
  const ordered: PlaceResult[] = [];
  let cur: LatLng = start;
  while (remaining.length > 0) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cur.lat, cur.lng, remaining[i].lat, remaining[i].lng);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    ordered.push(remaining[bi]);
    cur = { lat: remaining[bi].lat, lng: remaining[bi].lng };
    remaining.splice(bi, 1);
  }

  // 2) 2-opt = 교차하는 두 구간 뒤집어 총거리 감소 시 채택 (최대 50회)
  let improved = true;
  let iter = 0;
  while (improved && iter < 50) {
    improved = false;
    iter++;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 2; j < ordered.length; j++) {
        const jNext: LatLng =
          j + 1 < ordered.length
            ? { lat: ordered[j + 1].lat, lng: ordered[j + 1].lng }
            : end; // 종점 = 도착지 anchor
        const d1 = haversineKm(ordered[i].lat, ordered[i].lng, ordered[i + 1].lat, ordered[i + 1].lng);
        const d2 = haversineKm(ordered[j].lat, ordered[j].lng, jNext.lat, jNext.lng);
        const n1 = haversineKm(ordered[i].lat, ordered[i].lng, ordered[j].lat, ordered[j].lng);
        const n2 = haversineKm(ordered[i + 1].lat, ordered[i + 1].lng, jNext.lat, jNext.lng);
        if (n1 + n2 < d1 + d2) {
          const seg = ordered.slice(i + 1, j + 1).reverse();
          ordered.splice(i + 1, j - i, ...seg);
          improved = true;
        }
      }
    }
  }
  return [...ordered, ...invalid];
}

// 거리 + 이동수단(공공/도보 vs 전용차) → RouteScene.transit_mode + 시간계산용 TravelMode
function pickMode(
  km: number,
  transport: "public_transit" | "private_driver_guide",
): { mode: RouteScene["transit_mode"]; calc: TravelMode } {
  if (transport === "private_driver_guide") return { mode: "private_guide", calc: "DRIVE" };
  if (km <= 1.0) return { mode: "walk", calc: "WALK" }; // 1km 이내 = 도보
  return { mode: "metro", calc: "TRANSIT" };
}

// 군집 평균 좌표(centroid)
function centroidOf(items: PlaceResult[]): LatLng {
  const v = items.filter(hasCoord);
  if (!v.length) return { lat: 0, lng: 0 };
  return {
    lat: v.reduce((s, p) => s + p.lat, 0) / v.length,
    lng: v.reduce((s, p) => s + p.lng, 0) / v.length,
  };
}

// 군집 centroid ~ 도심 거리 (= 빈 군집은 맨 뒤로)
function distFromCenter(items: PlaceResult[], center: LatLng): number {
  const c = centroidOf(items);
  if (c.lat === 0 && c.lng === 0) return Infinity;
  return haversineKm(center.lat, center.lng, c.lat, c.lng);
}

/**
 * 활동을 dayCount 개 지리 군집으로 = 용량균형 k-means
 * = 각 군집 = 한 방향으로 압축 (= 반대방향 혼합 방지 = 지그재그 근절)
 * = farthest-first 초기화 → Lloyd 10회 → cap=ceil(n/k) 균형 재배정 (= 한 날 몰림 방지)
 */
function clusterIntoDays(items: PlaceResult[], k: number, center: LatLng, balanced = true): PlaceResult[][] {
  const pts = items.filter(hasCoord);
  if (k <= 1) return [pts];
  if (pts.length <= k) return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));

  // 1) farthest-first 초기 centroid (= 서로 먼 씨앗 = 방향 분리)
  const centroids: LatLng[] = [];
  let fi = 0,
    fd = -1;
  pts.forEach((p, i) => {
    const d = haversineKm(center.lat, center.lng, p.lat, p.lng);
    if (d > fd) { fd = d; fi = i; }
  });
  centroids.push({ lat: pts[fi].lat, lng: pts[fi].lng });
  while (centroids.length < k) {
    let bi = 0,
      bd = -1;
    pts.forEach((p, i) => {
      const dn = Math.min(...centroids.map((c) => haversineKm(c.lat, c.lng, p.lat, p.lng)));
      if (dn > bd) { bd = dn; bi = i; }
    });
    centroids.push({ lat: pts[bi].lat, lng: pts[bi].lng });
  }

  // 2) Lloyd 반복 (10회)
  for (let iter = 0; iter < 10; iter++) {
    const assign = pts.map((p) => {
      let bi = 0,
        bd = Infinity;
      centroids.forEach((c, ci) => {
        const d = haversineKm(c.lat, c.lng, p.lat, p.lng);
        if (d < bd) { bd = d; bi = ci; }
      });
      return bi;
    });
    for (let ci = 0; ci < k; ci++) {
      const grp = pts.filter((_, i) => assign[i] === ci);
      if (grp.length) centroids[ci] = centroidOf(grp);
    }
  }

  // 비균형 모드 = 순수 근접 배정 (= 외곽 방향 분리용 = 정반대 방향 군집 강제 병합 방지)
  if (!balanced) {
    const g: PlaceResult[][] = Array.from({ length: k }, () => []);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      centroids.forEach((c, ci) => { const d = haversineKm(c.lat, c.lng, p.lat, p.lng); if (d < bd) { bd = d; bi = ci; } });
      g[bi].push(p);
    }
    return g;
  }

  // 3) 용량균형 재배정 (cap=ceil(n/k)) = 확신(regret) 높은 점 먼저 = 한 날 몰림 방지
  const cap = Math.ceil(pts.length / k);
  const groups: PlaceResult[][] = Array.from({ length: k }, () => []);
  const order = pts
    .map((p, i) => {
      const ds = centroids.map((c) => haversineKm(c.lat, c.lng, p.lat, p.lng)).sort((a, b) => a - b);
      return { i, regret: (ds[1] ?? ds[0]) - ds[0] };
    })
    .sort((a, b) => b.regret - a.regret);
  for (const { i } of order) {
    const p = pts[i];
    const near = centroids
      .map((c, ci) => ({ ci, d: haversineKm(c.lat, c.lng, p.lat, p.lng) }))
      .sort((a, b) => a.d - b.d);
    let placed = false;
    for (const { ci } of near) {
      if (groups[ci].length < cap) { groups[ci].push(p); placed = true; break; }
    }
    if (!placed) groups[near[0].ci].push(p);
  }
  return groups;
}

// vibe → seed_category 주 매핑 (= 사용자 바이브와 맞는 카테고리에 가중)
const VIBE_CAT: Record<string, string> = {
  Culture: 'heritage', Healing: 'healing', Adventure: 'adventure',
  Hotspot: 'hotspot', Attraction: 'attraction', Shopping: 'shopping', // = 미식(Foodie) 제거 → 즐길거리(attraction) (= 식당은 바이브 아님 = 자동 식사)
};
type VibeBoost = Record<string, number>; // category → 배수(>1 = 선호)

// 가치(profit) = rank 점수 × 바이브 매칭배수 (낮은 rank=높은 가치 / 바이브 맞으면 ×배수)
const profitOf = (p: PlaceResult, boost: VibeBoost = {}): number =>
  Math.max(1, 21 - (p.rank ?? 20)) * (boost[p.seedCategory ?? ''] ?? 1);

// 앵커 = 도시 최상위(rank≤3) + 사용자 바이브 매칭 = "하루 써서라도 가는 곳"(예: 문화여행의 Versailles) = 게이트 무조건 통과 + 외곽일 최우선
const ANCHOR_RANK = 3;
const isAnchor = (p: PlaceResult, boost: VibeBoost = {}): boolean =>
  (p.rank ?? 99) <= ANCHOR_RANK && (boost[p.seedCategory ?? ''] ?? 1) > 1;

const FAR_KM = 12;        // 도심에서 이 이상 = 외곽(당일치기 후보)
const DROP_LAMBDA = 0.5;  // profit < 0.5 × 도심거리(km) = 가치<거리 = 제외 (= OR-Tools disjunction penalty=profit 의 순수 TS판)

/**
 * ⚠️ 사용자 SSOT 2026-06-05 = TOPTW cluster-first + 가치/거리 선정 (= 딥리서치 검증 = Gavalas CSCRoutes + OR-Tools disjunction)
 * ① 가치/거리 게이트 = 멀고 가치 낮은 외곽 제외(= Giverny 75km 류) ② 외곽 당일치기 day 수 제한 = 가치합 상위 군집만(= 흩어진 외곽 전부 X)
 * ③ 중심은 남은 날로 k-means ④ 일자 용량 초과분 = 가치낮은 순 제외. → "빠짐없이 모두" 폐기 = 가치순 선택.
 * @returns dayGroups(날짜별 활동) + dropped(이번 트립 미포함 = 정직 표시)
 */
function planDays(
  activities: PlaceResult[],
  dayCount: number,
  caps: number[],
  center: LatLng,
  boost: VibeBoost = {},
): { dayGroups: PlaceResult[][]; dropped: PlaceResult[] } {
  const valid = activities.filter(hasCoord);
  const dropped: PlaceResult[] = [];
  const commute = (p: PlaceResult) => haversineKm(center.lat, center.lng, p.lat, p.lng);

  // ① 중심/외곽 분리. 중심(FAR_KM 이내) = 전부 후보(= 용량 cap 이 추림, 거리게이트 적용 X = 중심 과잉제외 방지).
  //    외곽 = 가치/거리 게이트 통과분만 (= 가치가 거리 정당화 / 앵커=바이브매칭 최상위는 무조건 통과).
  const central = valid.filter((p) => commute(p) <= FAR_KM);
  const far: PlaceResult[] = [];
  for (const p of valid) {
    if (commute(p) <= FAR_KM) continue; // 중심은 위에서 처리
    if (isAnchor(p, boost) || profitOf(p, boost) >= DROP_LAMBDA * commute(p)) far.push(p);
    else dropped.push(p); // 외곽인데 가치 < 거리 = 이번 트립 제외
  }

  // ③ 외곽 당일치기 day 수 = dayCount/3 내림(외곽 있을 때 최소 1) = 가치합 상위 군집만, 나머지 외곽 제외
  const outskirtBudget = far.length ? Math.max(1, Math.floor(dayCount / 3)) : 0;
  let outskirtDays: PlaceResult[][] = [];
  if (outskirtBudget > 0) {
    const fc = clusterIntoDays(far, Math.min(far.length, Math.max(outskirtBudget + 1, dayCount)), center, false)
      .filter((c) => c.length)
      // 앵커 포함 군집 최우선(= 바이브 아이콘은 무조건 당일치기) → 그다음 가치합
      .map((c) => ({ c, val: c.reduce((s, p) => s + profitOf(p, boost), 0) + (c.some((p) => isAnchor(p, boost)) ? 1e6 : 0) }))
      .sort((a, b) => b.val - a.val);
    outskirtDays = fc.slice(0, outskirtBudget).map((x) => x.c);
    for (const x of fc.slice(outskirtBudget)) dropped.push(...x.c);
  } else {
    dropped.push(...far);
  }

  // ④ 중심 = 남은 날 수로 k-means
  const centralDayCount = Math.max(1, dayCount - outskirtDays.length);
  const centralGroups = (central.length ? clusterIntoDays(central, centralDayCount, center) : [])
    .filter((c, i) => i < centralDayCount)
    .sort((a, b) => distFromCenter(a, center) - distFromCenter(b, center));

  // ⑤ 날짜 배열 = 중심날(앞) + 외곽날(뒤), dayCount 로 맞춤
  let dayGroups: PlaceResult[][] = [...centralGroups, ...outskirtDays].slice(0, dayCount);
  while (dayGroups.length < dayCount) dayGroups.push([]);

  // ⑥ 일자 용량 초과분 = 가치낮은 순 제외
  dayGroups = dayGroups.map((g, i) => {
    const cap = caps[i] ?? 99;
    const sorted = [...g].sort((a, b) => profitOf(b, boost) - profitOf(a, boost));
    if (sorted.length > cap) dropped.push(...sorted.slice(cap));
    return sorted.slice(0, cap);
  });

  return { dayGroups, dropped };
}

/**
 * 로컬 동선 빌드 = handleRouteRequest(Gemini) 동형 대체
 * @param skeleton AG1 뼈대 (= 일자/슬롯/페이스/인원)
 * @param places AG2-DB 풀 (= 활동 + 식당, 좌표 보유)
 * @param cityCoords 도심 중심 = 매일 출발/귀환 anchor
 * @returns RouteHandlerResult (= ok / response: RouteResponse / elapsedMs)
 */
export function buildRouteLocal(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: LatLng | undefined,
): RouteHandlerResult {
  const t0 = Date.now();
  const { formData, daySlotsConfig, paceConfig, companionCount } = skeleton;
  const slotDuration = paceConfig.slotDurationMinutes;

  // 출발/귀환 기점 = 도심 중심 (없으면 formData 좌표 / 첫 유효 장소)
  const firstValid = places.find(hasCoord);
  const center: LatLng =
    cityCoords && hasCoord(cityCoords)
      ? cityCoords
      : formData.destinationCoords && hasCoord(formData.destinationCoords)
        ? formData.destinationCoords
        : firstValid
          ? { lat: firstValid.lat, lng: firstValid.lng }
          : { lat: 0, lng: 0 };

  // 이동수단 = Minimal(거동 불편) → 전용차 / 그 외 → 대중교통
  const transport: "public_transit" | "private_driver_guide" =
    formData.mobilityStyle === "Minimal" ? "private_driver_guide" : "public_transit";

  // 활동 / 식당 분리 (좌표 보유만)
  const activities = places.filter((p) => p.seedCategory !== "restaurant" && hasCoord(p));
  const restaurants = places.filter((p) => p.seedCategory === "restaurant" && hasCoord(p));
  const restById = new Map<number, PlaceResult>();
  const geoPool: GeoPoint[] = [];
  for (const r of restaurants) {
    const n = idNum(r.id);
    if (n < 0) continue; // 비정상 id(= db-N 아님) = 매칭 충돌 방지 = 스킵
    restById.set(n, r);
    geoPool.push({ id: n, latitude: r.lat, longitude: r.lng });
  }

  // 일자별 = 점심/저녁 유무 + 활동 용량(= 슬롯 - 식사)
  const dayPlan = daySlotsConfig.map((dc) => {
    const sMin = toMin(dc.startTime);
    const eMin = toMin(dc.endTime);
    const hasLunch = sMin <= 13 * 60 + 30 && eMin >= 13 * 60;
    const hasDinner = eMin >= 18 * 60 + 30;
    const activitySlots = Math.max(1, dc.slots - (hasLunch ? 1 : 0) - (hasDinner ? 1 : 0));
    return { day: dc.day, startMin: sMin, hasLunch, hasDinner, activitySlots };
  });

  // 바이브 가중 = 사용자 vibe 와 맞는 카테고리에 배수 (= profit 에 반영 = Versailles 문화 ↑)
  const boost: VibeBoost = {};
  for (const vw of skeleton.vibeWeights || []) {
    const cat = VIBE_CAT[String(vw.vibe)];
    if (cat) boost[cat] = 1 + (vw.weight ?? 0); // weight 0~1 → 배수 1~2
  }

  // ⚠️ 사용자 SSOT 2026-06-05 = TOPTW cluster-first + 가치/거리 선정 (= "빠짐없이 모두" 폐기, 딥리서치 검증)
  //   = planDays: 가치<거리 외곽 제외 + 외곽 당일치기 제한(앵커 최우선) + 중심 k-means + 용량초과 제외 → dropped = "이번 트립 미포함"
  const { dayGroups, dropped } = planDays(activities, dayPlan.length, dayPlan.map((d) => d.activitySlots), center, boost);

  const usedRest = new Set<number>();
  const days: RouteResponse["days"] = [];
  let grandKm = 0;
  let grandSec = 0;

  for (let di = 0; di < dayPlan.length; di++) {
    const dp = dayPlan[di];
    const dayActs0 = dayGroups[di] || [];
    // 일자 내 재정렬 (도심 출발/귀환 anchor = 하루 한 바퀴)
    const dayActs = orderByNN(dayActs0, center, center);

    // 동선 시퀀스 = 활동 + (점심 = 중간 / 저녁 = 끝)
    type Item = { p: PlaceResult; kind: "activity" | "restaurant" };
    const seq: Item[] = dayActs.map((p) => ({ p, kind: "activity" as const }));

    // 식당이 그날 동선에서 MAX_MEAL_KM 보다 멀면 = 외곽 식당 DB 공백 = 끼우지 않음 (= 정직 = 30km 식당 왕복 방지)
    const MAX_MEAL_KM = 6;
    if (dp.hasLunch && dayActs.length >= 1) {
      const mid = Math.max(1, Math.floor(dayActs.length / 2));
      const a = dayActs[mid - 1];
      const b = dayActs[mid] || a;
      const pick = pickRestaurantBySegment(
        geoPool,
        { id: idNum(a.id), latitude: a.lat, longitude: a.lng },
        { id: idNum(b.id), latitude: b.lat, longitude: b.lng },
        [...usedRest],
      );
      if (pick && haversineKm(a.lat, a.lng, pick.latitude!, pick.longitude!) <= MAX_MEAL_KM) {
        usedRest.add(pick.id);
        seq.splice(mid, 0, { p: restById.get(pick.id)!, kind: "restaurant" });
      }
    }
    if (dp.hasDinner && dayActs.length >= 1) {
      const last = dayActs[dayActs.length - 1];
      const pick = pickRestaurantNearVenue(
        geoPool,
        { id: idNum(last.id), latitude: last.lat, longitude: last.lng },
        [...usedRest],
      );
      if (pick && haversineKm(last.lat, last.lng, pick.latitude!, pick.longitude!) <= MAX_MEAL_KM) {
        usedRest.add(pick.id);
        seq.push({ p: restById.get(pick.id)!, kind: "restaurant" });
      }
    }

    // 씬 빌드 = 시간/거리/교통 (= calcTransitHaversine 재사용)
    let t = dp.startMin;
    let prev: LatLng = center;
    let dayKm = 0;
    const scenes: RouteScene[] = [];
    seq.forEach((it, i) => {
      const km = round2(haversineKm(prev.lat, prev.lng, it.p.lat, it.p.lng));
      const { mode, calc } = pickMode(km, transport);
      const tr = calcTransitHaversine(prev, { lat: it.p.lat, lng: it.p.lng }, calc, companionCount);
      t += tr.duration;
      const isRest = it.kind === "restaurant";
      const scene: RouteScene = {
        slot: i + 1,
        time: minutesToTime(t),
        type: isRest ? "restaurant" : "activity",
        place_id: it.p.id,
        name_en: it.p.name || "",
        name_ko: it.p.nameKo || "",
        name_local: it.p.nameLocal || it.p.name || "",
        address: it.p.address || "",
        lat: it.p.lat,
        lng: it.p.lng,
        distance_from_prev_km: km,
        transit_mode: mode,
        transit_min: tr.duration,
      };
      if (isRest && it.p.estimatedPriceEur != null) scene.price_per_person_eur = it.p.estimatedPriceEur;
      if (it.p.summaryKo) scene.selection_reason_ko = it.p.summaryKo; // → DB summary_ko
      if (it.p.editorialSummary) scene.shortform_ko = it.p.editorialSummary; // → DB editorial_summary
      scenes.push(scene);

      dayKm += km;
      grandSec += tr.duration * 60 + (isRest ? 90 : slotDuration) * 60;
      t += isRest ? 90 : slotDuration; // 식사 90분 / 활동 = 페이스 슬롯
      prev = { lat: it.p.lat, lng: it.p.lng };
    });

    days.push({ day: dp.day, total_distance_km: round2(dayKm), scenes });
    grandKm += dayKm;
  }

  const response: RouteResponse = {
    total_duration_sec: grandSec,
    total_distance_km: round2(grandKm),
    days,
  };
  // 이번 트립 미포함(= 가치/거리 제외) = 정직 표시용 (AG4 는 무시 = 표준 필드 아님)
  (response as any)._dropped = dropped.map((p) => ({ name: p.nameLocal || p.name, profit: Math.round(profitOf(p, boost)) }));
  return {
    ok: days.length > 0,
    response,
    raw: "",
    finishReason: "local-nn-haversine",
    elapsedMs: Date.now() - t0,
  };
}
