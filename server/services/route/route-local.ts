// ⚠️ 수정금지(승인필요) 2026-06-06 = DB-only 결정적 동선 빌더 v2 = handleRouteRequest(Gemini) 동형 대체 (= 사용자 SSOT)
// = 2단계: ① 활동만 동선최적화(점심/저녁 슬롯 빈칸) → ② 식당 우선순위 삽입(인접성 → 가격, 순차)
// = 부품 재사용(헌법 §16): haversineKm / calcTransitHaversine ← transit-haversine.ts (단일 Haversine SSOT)
// = Gemini 0 / 외부호출 0 (= 식당풀은 ag4 가 DB 조회해 전달) / 결정적 → 시뮬 = 라이브 동일
// = 동선 = Held-Karp 폐루프(중심 출발·귀환, 노드 ≤11) + NN/2-opt 폴백 = 출발<>종료 = 파리중심 앵커 (= 추후 숙소주소 입력 시 그 좌표로 전체 재최적화)
// = 활동 = AG2 풀 top-rank 채택(슬롯 상한) / 식사 = 슬롯3 점심(활동2·4 최근접) + 마지막 저녁(최종활동·중심 최근접)
import type { AG1Output, PlaceResult } from "../agents/types";
import { minutesToTime, MEAL_BUDGET } from "../agents/types";
import {
  haversineKm,
  calcTransitHaversine,
  type TravelMode,
} from "../agents/transit-haversine";
import type {
  RouteResponse,
  RouteScene,
  RouteHandlerResult,
} from "./route-types";

type LatLng = { lat: number; lng: number };

// 유효 좌표 = NULL/0 아님
const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 일자 1개 동선 정렬 = 폐루프 최단경로 (= 중심 출발·귀환)
 * = 노드 ≤11 = Held-Karp 정확해 / >11 = NN+2-opt 폴백
 * = 종착이 중심 근처가 되도록 귀환비용 포함 (= 출발<>종료 중심 = 저녁/숙소 앵커 정합)
 */
function orderByNN(items: PlaceResult[], center: LatLng): PlaceResult[] {
  const valid = items.filter(hasCoord);
  const invalid = items.filter((p) => !hasCoord(p));
  if (valid.length <= 1) return [...valid, ...invalid];
  if (valid.length <= 11) return [...heldKarpPath(valid, center), ...invalid];
  return [...nn2opt(valid, center), ...invalid];
}

/**
 * Held-Karp DP = 고정 시작(center)에서 전체 1회 방문 후 center 귀환 = 폐루프 최단.
 * = dp[S][j] = center→…→j (S 방문완료) 최소비용. 답 = min_j (dp[full][j] + j→center). O(2^n·n²).
 */
function heldKarpPath(nodes: PlaceResult[], center: LatLng): PlaceResult[] {
  const n = nodes.length;
  if (n <= 1) return [...nodes];
  const d0 = nodes.map((p) => haversineKm(center.lat, center.lng, p.lat, p.lng)); // center→j
  const d = nodes.map((a) => nodes.map((b) => haversineKm(a.lat, a.lng, b.lat, b.lng))); // i→j
  const FULL = 1 << n;
  const dp = Array.from({ length: FULL }, () => new Float64Array(n).fill(Infinity));
  const par = Array.from({ length: FULL }, () => new Int8Array(n).fill(-1));
  for (let j = 0; j < n; j++) dp[1 << j][j] = d0[j];
  for (let S = 1; S < FULL; S++) {
    for (let j = 0; j < n; j++) {
      if (!(S & (1 << j))) continue;
      const base = dp[S][j];
      if (base === Infinity) continue;
      for (let kk = 0; kk < n; kk++) {
        if (S & (1 << kk)) continue;
        const nS = S | (1 << kk);
        const cost = base + d[j][kk];
        if (cost < dp[nS][kk]) { dp[nS][kk] = cost; par[nS][kk] = j; }
      }
    }
  }
  // 폐루프 = 마지막 노드 → center 귀환 비용 포함 (= 종착이 중심 근처)
  let best = Infinity, endJ = 0;
  for (let j = 0; j < n; j++) {
    const total = dp[FULL - 1][j] + haversineKm(nodes[j].lat, nodes[j].lng, center.lat, center.lng);
    if (total < best) { best = total; endJ = j; }
  }
  const path: PlaceResult[] = [];
  let S = FULL - 1, j = endJ;
  while (j !== -1) { path.push(nodes[j]); const pj = par[S][j]; S &= ~(1 << j); j = pj; }
  return path.reverse();
}

/**
 * NN + 2-opt 폴백 (= 노드 >11) = 폐루프(중심 출발·귀환) + 시작 엣지(center→첫노드) 목적함수 포함.
 */
function nn2opt(valid: PlaceResult[], center: LatLng): PlaceResult[] {
  const remaining = [...valid];
  const ordered: PlaceResult[] = [];
  let cur: LatLng = center;
  while (remaining.length > 0) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dd = haversineKm(cur.lat, cur.lng, remaining[i].lat, remaining[i].lng);
      if (dd < bd) { bd = dd; bi = i; }
    }
    ordered.push(remaining[bi]);
    cur = { lat: remaining[bi].lat, lng: remaining[bi].lng };
    remaining.splice(bi, 1);
  }
  let improved = true, iter = 0;
  while (improved && iter < 50) {
    improved = false; iter++;
    for (let i = -1; i < ordered.length - 2; i++) {
      // i = -1 = 시작 엣지(center→ordered[0]) 포함
      const a: LatLng = i < 0 ? center : { lat: ordered[i].lat, lng: ordered[i].lng };
      for (let j = i + 2; j < ordered.length; j++) {
        const isLast = j + 1 >= ordered.length;
        const next: LatLng = isLast ? center : { lat: ordered[j + 1].lat, lng: ordered[j + 1].lng }; // 폐루프 귀환
        const b = ordered[i + 1], c = ordered[j];
        const d1 = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const d2 = haversineKm(c.lat, c.lng, next.lat, next.lng);
        const n1 = haversineKm(a.lat, a.lng, c.lat, c.lng);
        const n2 = haversineKm(b.lat, b.lng, next.lat, next.lng);
        if (n1 + n2 < d1 + d2 - 1e-9) {
          const seg = ordered.slice(i + 1, j + 1).reverse();
          ordered.splice(i + 1, j - i, ...seg);
          improved = true;
        }
      }
    }
  }
  return ordered;
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
 * 활동을 dayCount 개 지리 군집으로 = 용량균형 k-means (cap = ceil(n/k))
 * = farthest-first 초기화 → Lloyd 10회 → 용량균형 재배정 (= 한 날 몰림 방지 + 먼 곳 인근끼리 묶음)
 * = 입력 활동이 슬롯 상한(= n)으로 이미 잘려 옴 → cap = ceil(n/k) = 일자당 활동 슬롯 수
 */
function clusterIntoDays(items: PlaceResult[], k: number, center: LatLng): PlaceResult[][] {
  const pts = items.filter(hasCoord);
  if (k <= 1) return [pts];
  if (pts.length <= k) return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));

  // 1) farthest-first 초기 centroid (= 서로 먼 씨앗 = 방향 분리)
  const centroids: LatLng[] = [];
  let fi = 0, fd = -1;
  pts.forEach((p, i) => {
    const dd = haversineKm(center.lat, center.lng, p.lat, p.lng);
    if (dd > fd) { fd = dd; fi = i; }
  });
  centroids.push({ lat: pts[fi].lat, lng: pts[fi].lng });
  while (centroids.length < k) {
    let bi = 0, bd = -1;
    pts.forEach((p, i) => {
      const dn = Math.min(...centroids.map((c) => haversineKm(c.lat, c.lng, p.lat, p.lng)));
      if (dn > bd) { bd = dn; bi = i; }
    });
    centroids.push({ lat: pts[bi].lat, lng: pts[bi].lng });
  }

  // 2) Lloyd 반복 (10회)
  for (let iter = 0; iter < 10; iter++) {
    const assign = pts.map((p) => {
      let bi = 0, bd = Infinity;
      centroids.forEach((c, ci) => {
        const dd = haversineKm(c.lat, c.lng, p.lat, p.lng);
        if (dd < bd) { bd = dd; bi = ci; }
      });
      return bi;
    });
    for (let ci = 0; ci < k; ci++) {
      const grp = pts.filter((_, i) => assign[i] === ci);
      if (grp.length) centroids[ci] = centroidOf(grp);
    }
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

/**
 * 로컬 동선 빌드 v2 = handleRouteRequest(Gemini) 동형 대체 (= 2단계: 활동 1차 / 식당 2차)
 * @param skeleton AG1 뼈대 (= 일자/슬롯/페이스/인원/travelStyle)
 * @param places AG2-DB 풀 (= 활동 후보, 좌표 보유)
 * @param cityCoords 도심 중심 = 출발/종료 앵커 (= 추후 숙소주소로 교체)
 * @param restaurantPool ag4 가 DB 조회한 예산 매칭 식당 전체풀 (= 2차 우선순위 삽입용). 없으면 places 내 식당 폴백.
 */
export function buildRouteLocal(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: LatLng | undefined,
  restaurantPool?: PlaceResult[],
): RouteHandlerResult {
  const t0 = Date.now();
  const { formData, daySlotsConfig, paceConfig, companionCount } = skeleton;
  const slotDuration = paceConfig.slotDurationMinutes;
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];

  // 출발/종료 앵커 = 도심 중심 (= 추후 숙소주소 입력 시 그 좌표로 교체 = 전체 재최적화)
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

  // 활동 = 비식당, rank 높은 순, 슬롯 상한(= Σ(slots-2))까지 (= 유명 보존 = 베르사유, 버퍼 초과분 drop)
  const maxActivities = daySlotsConfig.reduce((s, dc) => s + Math.max(1, dc.slots - 2), 0);
  const activities = places
    .filter((p) => p.seedCategory !== "restaurant" && hasCoord(p))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, maxActivities);

  // 식당풀 = ag4 가 DB 조회해 전달(우선) / 없으면 places 내 식당(= sim 폴백)
  const restaurants = (restaurantPool && restaurantPool.length
    ? restaurantPool
    : places.filter((p) => p.seedCategory === "restaurant")
  ).filter(hasCoord);

  // 2차 식당 우선순위 픽 = [1순위] 인접성(앵커 최근접) 정렬 → [2순위] 그중 예산내 첫 (= 동시 아님, 순차) + 전역 중복 제외
  const usedRest = new Set<string>();
  const pickMealPriority = (anchors: LatLng[], priceCap: number): PlaceResult | null => {
    const refs = anchors.filter((a) => a && a.lat != null && a.lat !== 0);
    const useRefs = refs.length ? refs : [center];
    const ranked = restaurants
      .filter((r) => !usedRest.has(r.id))
      .map((r) => ({ r, d: Math.min(...useRefs.map((a) => haversineKm(a.lat, a.lng, r.lat, r.lng))) }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) return null;
    const within = ranked.find((x) => (x.r.estimatedPriceEur ?? 0) <= priceCap); // 인접성순 첫 예산내
    const pick = (within ?? ranked[0]).r; // 인근에 예산내 없으면 최근접 폴백 (= 한도 완화)
    usedRest.add(pick.id);
    return pick;
  };

  // 1차 = 활동 일자 배정 (= 좌표 용량균형 cluster) + 도심→외곽 정렬 (= 자연 흐름)
  const dayGroups = clusterIntoDays(activities, daySlotsConfig.length, center)
    .sort((a, b) => distFromCenter(a, center) - distFromCenter(b, center));

  const days: RouteResponse["days"] = [];
  let grandKm = 0;
  let grandSec = 0;

  for (let di = 0; di < daySlotsConfig.length; di++) {
    const dc = daySlotsConfig[di];
    const dayActs = orderByNN(dayGroups[di] || [], center); // 폐루프 = 중심 출발·귀환

    // 점심 = 슬롯3 (= 활동 2개 후) = 활동2·활동4 중 최근접 식당 (= detour 0)
    const lunchIdx = Math.min(2, dayActs.length);
    const aBefore = dayActs[lunchIdx - 1];
    const aAfter = dayActs[lunchIdx];
    const lunch = dayActs.length
      ? pickMealPriority(
          [aBefore, aAfter].filter(Boolean).map((p) => ({ lat: p.lat, lng: p.lng })),
          mealBudget.lunch,
        )
      : null;
    // 저녁 = 마지막 슬롯 = 최종활동·파리중심 중 최근접 (= 조회 폭 넓힘 = 중심 귀환 모델)
    const lastAct = dayActs[dayActs.length - 1];
    const dinner = dayActs.length
      ? pickMealPriority(
          lastAct ? [{ lat: lastAct.lat, lng: lastAct.lng }, center] : [center],
          mealBudget.dinner,
        )
      : null;

    // 시퀀스 조립 = 활동 + 점심(슬롯3) + 저녁(마지막)
    const seq: { p: PlaceResult; rest: boolean }[] = [];
    dayActs.forEach((act, idx) => {
      if (idx === lunchIdx && lunch) seq.push({ p: lunch, rest: true });
      seq.push({ p: act, rest: false });
    });
    if (lunch && lunchIdx >= dayActs.length) seq.push({ p: lunch, rest: true }); // 활동<2 = 점심 뒤에
    if (dinner) seq.push({ p: dinner, rest: true });

    // 고정 페이스 그리드 시각 (= startTime + i×슬롯간격, 이동시간 미반영 = 깔끔 시각) + 거리/교통(Haversine)
    let prev: LatLng = center;
    let dayKm = 0;
    const startMin = toMin(dc.startTime);
    const scenes: RouteScene[] = seq.map((it, i) => {
      const km = round2(haversineKm(prev.lat, prev.lng, it.p.lat, it.p.lng));
      const { mode, calc } = pickMode(km, transport);
      const tr = calcTransitHaversine(prev, { lat: it.p.lat, lng: it.p.lng }, calc, companionCount);
      prev = { lat: it.p.lat, lng: it.p.lng };
      dayKm += km;
      grandSec += slotDuration * 60;
      const scene: RouteScene = {
        slot: i + 1,
        time: minutesToTime(startMin + i * slotDuration),
        type: it.rest ? "restaurant" : "activity",
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
      if (it.rest && it.p.estimatedPriceEur != null) scene.price_per_person_eur = it.p.estimatedPriceEur;
      if (it.p.summaryKo) scene.selection_reason_ko = it.p.summaryKo;
      if (it.p.editorialSummary) scene.shortform_ko = it.p.editorialSummary;
      return scene;
    });

    days.push({ day: dc.day, total_distance_km: round2(dayKm), scenes });
    grandKm += dayKm;
  }

  const response: RouteResponse = {
    total_duration_sec: grandSec,
    total_distance_km: round2(grandKm),
    days,
  };
  return {
    ok: days.length > 0,
    response,
    raw: "",
    finishReason: "local-nn-haversine-v2",
    elapsedMs: Date.now() - t0,
  };
}
