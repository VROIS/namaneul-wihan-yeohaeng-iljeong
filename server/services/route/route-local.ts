// ⚠️ 수정금지(승인필요) 2026-06-06 = DB-only 결정적 동선 빌더 v2 = handleRouteRequest(Gemini) 동형 대체 (= 사용자 SSOT)
import type { AG1Output, PlaceResult } from "../agents/types";
import { minutesToTime, MEAL_BUDGET } from "../agents/types";
import { normalizeTravelStyle } from "../agents/pipeline-v3-types";
import {
  haversineKm,
  calcTransitHaversine,
  pickTransitMode,
} from "../agents/transit-haversine";
import type {
  RouteResponse,
  RouteScene,
  RouteHandlerResult,
} from "./route-types";
import { sectorIntoDays, orderHoming } from "./route-sector";
// ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 판별 단일 SSOT(Gemini·MIX 경로와 동일 함수 = 3경로 정합, §16 재발명 금지).
import { shouldApplyGuidePrice } from "../transport-pricing-service";

type LatLng = { lat: number; lng: number };

const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function orderByNN(items: PlaceResult[], center: LatLng): PlaceResult[] {
  const valid = items.filter(hasCoord);
  const invalid = items.filter((p) => !hasCoord(p));
  if (valid.length <= 1) return [...valid, ...invalid];
  if (valid.length <= 11) return [...heldKarpPath(valid, center), ...invalid];
  return [...nn2opt(valid, center), ...invalid];
}

function heldKarpPath(nodes: PlaceResult[], center: LatLng): PlaceResult[] {
  const n = nodes.length;
  if (n <= 1) return [...nodes];
  const d0 = nodes.map((p) =>
    haversineKm(center.lat, center.lng, p.lat, p.lng),
  ); // center→j
  const d = nodes.map((a) =>
    nodes.map((b) => haversineKm(a.lat, a.lng, b.lat, b.lng)),
  ); // i→j
  const FULL = 1 << n;
  const dp = Array.from({ length: FULL }, () =>
    new Float64Array(n).fill(Infinity),
  );
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
        if (cost < dp[nS][kk]) {
          dp[nS][kk] = cost;
          par[nS][kk] = j;
        }
      }
    }
  }
  let best = Infinity,
    endJ = 0;
  for (let j = 0; j < n; j++) {
    const total =
      dp[FULL - 1][j] +
      haversineKm(nodes[j].lat, nodes[j].lng, center.lat, center.lng);
    if (total < best) {
      best = total;
      endJ = j;
    }
  }
  const path: PlaceResult[] = [];
  let S = FULL - 1,
    j = endJ;
  while (j !== -1) {
    path.push(nodes[j]);
    const pj = par[S][j];
    S &= ~(1 << j);
    j = pj;
  }
  return path.reverse();
}

function nn2opt(valid: PlaceResult[], center: LatLng): PlaceResult[] {
  const remaining = [...valid];
  const ordered: PlaceResult[] = [];
  let cur: LatLng = center;
  while (remaining.length > 0) {
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dd = haversineKm(
        cur.lat,
        cur.lng,
        remaining[i].lat,
        remaining[i].lng,
      );
      if (dd < bd) {
        bd = dd;
        bi = i;
      }
    }
    ordered.push(remaining[bi]);
    cur = { lat: remaining[bi].lat, lng: remaining[bi].lng };
    remaining.splice(bi, 1);
  }
  let improved = true,
    iter = 0;
  while (improved && iter < 50) {
    improved = false;
    iter++;
    for (let i = -1; i < ordered.length - 2; i++) {
      const a: LatLng =
        i < 0 ? center : { lat: ordered[i].lat, lng: ordered[i].lng };
      for (let j = i + 2; j < ordered.length; j++) {
        const isLast = j + 1 >= ordered.length;
        const next: LatLng = isLast
          ? center
          : { lat: ordered[j + 1].lat, lng: ordered[j + 1].lng }; // 폐루프 귀환
        const b = ordered[i + 1],
          c = ordered[j];
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

function centroidOf(items: PlaceResult[]): LatLng {
  const v = items.filter(hasCoord);
  if (!v.length) return { lat: 0, lng: 0 };
  return {
    lat: v.reduce((s, p) => s + p.lat, 0) / v.length,
    lng: v.reduce((s, p) => s + p.lng, 0) / v.length,
  };
}

function distFromCenter(items: PlaceResult[], center: LatLng): number {
  const c = centroidOf(items);
  if (c.lat === 0 && c.lng === 0) return Infinity;
  return haversineKm(center.lat, center.lng, c.lat, c.lng);
}

function clusterIntoDays(
  items: PlaceResult[],
  k: number,
  center: LatLng,
): PlaceResult[][] {
  const pts = items.filter(hasCoord);
  if (k <= 1) return [pts];
  if (pts.length <= k)
    return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));

  const centroids: LatLng[] = [];
  let fi = 0,
    fd = -1;
  pts.forEach((p, i) => {
    const dd = haversineKm(center.lat, center.lng, p.lat, p.lng);
    if (dd > fd) {
      fd = dd;
      fi = i;
    }
  });
  centroids.push({ lat: pts[fi].lat, lng: pts[fi].lng });
  while (centroids.length < k) {
    let bi = 0,
      bd = -1;
    pts.forEach((p, i) => {
      const dn = Math.min(
        ...centroids.map((c) => haversineKm(c.lat, c.lng, p.lat, p.lng)),
      );
      if (dn > bd) {
        bd = dn;
        bi = i;
      }
    });
    centroids.push({ lat: pts[bi].lat, lng: pts[bi].lng });
  }

  for (let iter = 0; iter < 10; iter++) {
    const assign = pts.map((p) => {
      let bi = 0,
        bd = Infinity;
      centroids.forEach((c, ci) => {
        const dd = haversineKm(c.lat, c.lng, p.lat, p.lng);
        if (dd < bd) {
          bd = dd;
          bi = ci;
        }
      });
      return bi;
    });
    for (let ci = 0; ci < k; ci++) {
      const grp = pts.filter((_, i) => assign[i] === ci);
      if (grp.length) centroids[ci] = centroidOf(grp);
    }
  }

  const cap = Math.ceil(pts.length / k);
  const groups: PlaceResult[][] = Array.from({ length: k }, () => []);
  const order = pts
    .map((p, i) => {
      const ds = centroids
        .map((c) => haversineKm(c.lat, c.lng, p.lat, p.lng))
        .sort((a, b) => a - b);
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
      if (groups[ci].length < cap) {
        groups[ci].push(p);
        placed = true;
        break;
      }
    }
    if (!placed) groups[near[0].ci].push(p);
  }
  return groups;
}

export function buildRouteLocal(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: LatLng | undefined,
  restaurantPool?: PlaceResult[],
): RouteHandlerResult {
  const t0 = Date.now();
  const { formData, daySlotsConfig, paceConfig, companionCount } = skeleton;
  const slotDuration = paceConfig.slotDurationMinutes; // 활동 1곳 시간
  const mealDuration = paceConfig.mealDurationMinutes; // 식사 1회 시간(밀도별, 활동보다 짧음)
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];
  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계 BE-3) = 핀 식당 id 집합(풀 id 형식 = "db-<번호>").
  const pinnedRestIds = new Set(
    (formData.pinnedPlaceIds ?? []).map((n) => `db-${n}`),
  );

  // ⚠️ 2026-07-04 사장님 SSOT = 출발/종료 앵커 = 숙소 좌표 최우선(§14 A안=여행 전체 공통 숙소) → 없으면 도심 중심.
  const firstValid = places.find(hasCoord);
  const center: LatLng =
    formData.accommodationCoords && hasCoord(formData.accommodationCoords)
      ? formData.accommodationCoords
      : cityCoords && hasCoord(cityCoords)
        ? cityCoords
        : formData.destinationCoords && hasCoord(formData.destinationCoords)
          ? formData.destinationCoords
          : firstValid
            ? { lat: firstValid.lat, lng: firstValid.lng }
            : { lat: 0, lng: 0 };

  // ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 = 이동(Minimal·Moderate) OR 예산(Premium·Luxury) 중 하나라도 = 무조건 가이드(본업 퍼널).
  const transport: "public_transit" | "private_driver_guide" =
    shouldApplyGuidePrice(formData.mobilityStyle, formData.travelStyle)
      ? "private_driver_guide"
      : "public_transit";

  const maxActivities = daySlotsConfig.reduce(
    (s, dc) => s + Math.max(1, dc.slots - 2),
    0,
  );
  const activities = places
    .filter((p) => p.seedCategory !== "restaurant" && hasCoord(p))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, maxActivities);

  const restaurants = (
    restaurantPool && restaurantPool.length
      ? restaurantPool
      : places.filter((p) => p.seedCategory === "restaurant")
  ).filter(hasCoord);

  const usedRest = new Set<string>();
  const pickMealPriority = (
    anchors: LatLng[],
    priceMin: number,
    priceCap: number,
  ): PlaceResult | null => {
    const refs = anchors.filter((a) => a && a.lat != null && a.lat !== 0);
    const useRefs = refs.length ? refs : [center];
    const ranked = restaurants
      .filter((r) => !usedRest.has(r.id))
      .map((r) => ({
        r,
        d: Math.min(
          ...useRefs.map((a) => haversineKm(a.lat, a.lng, r.lat, r.lng)),
        ),
      }))
      .sort((a, b) => a.d - b.d);
    if (!ranked.length) return null;
    // ⚠️ 2026-07-31 사장님 승인(BTS D단계) = 핀 식당 우선 = 사용자가 직접 고른 것 = 가격대 필터보다 우선.
    const pinnedPick = ranked.find((x) => pinnedRestIds.has(x.r.id));
    if (pinnedPick) {
      usedRest.add(pinnedPick.r.id);
      return pinnedPick.r;
    }
    const lo = Math.min(priceMin, priceCap);
    const inBand = ranked.find(
      (x) =>
        x.r.estimatedPriceEur != null &&
        x.r.estimatedPriceEur >= lo &&
        x.r.estimatedPriceEur <= priceCap,
    );
    const within =
      inBand ||
      ranked.find(
        (x) =>
          x.r.estimatedPriceEur != null && x.r.estimatedPriceEur <= priceCap,
      );
    const pick = (within ?? ranked[0]).r; // 구간·예산내 0 시 = 최근접 폴백 (= 매일 2식 보장)
    usedRest.add(pick.id);
    return pick;
  };

  const USE_SECTOR_ROUTE = process.env.USE_SECTOR_ROUTE !== "false";
  const slotsPerDay = daySlotsConfig.map((dc) => Math.max(1, dc.slots - 2));
  const dayGroups = USE_SECTOR_ROUTE
    ? sectorIntoDays(activities, slotsPerDay, center)
    : clusterIntoDays(activities, daySlotsConfig.length, center).sort(
        (a, b) => distFromCenter(a, center) - distFromCenter(b, center),
      );

  const days: RouteResponse["days"] = [];
  let grandKm = 0;
  let grandSec = 0;

  for (let di = 0; di < daySlotsConfig.length; di++) {
    const dc = daySlotsConfig[di];
    const dayActs = USE_SECTOR_ROUTE
      ? orderHoming(dayGroups[di] || [], center)
      : orderByNN(dayGroups[di] || [], center);

    // ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 앵커를 오전활동 1개로 좁힘(옛 [오전,오후] 둘중 최근접 폐기 §19).
    const lunchIdx = Math.min(2, dayActs.length);
    const aBefore = dayActs[lunchIdx - 1];
    const lunch = pickMealPriority(
      aBefore ? [{ lat: aBefore.lat, lng: aBefore.lng }] : [center], // ⚠️ 활동 0개(빈 날) = 중심 앵커 = 2식 보장
      mealBudget.min, // 가격대 하한 (= 등급 구간)
      mealBudget.lunch,
    );
    const lastAct = dayActs[dayActs.length - 1];
    const dinner = pickMealPriority(
      lastAct ? [{ lat: lastAct.lat, lng: lastAct.lng }, center] : [center],
      mealBudget.min, // 가격대 하한 (= 등급 구간)
      mealBudget.dinner,
    );

    const seq: { p: PlaceResult; rest: boolean }[] = [];
    dayActs.forEach((act, idx) => {
      if (idx === lunchIdx && lunch) seq.push({ p: lunch, rest: true });
      seq.push({ p: act, rest: false });
    });
    if (lunch && lunchIdx >= dayActs.length) seq.push({ p: lunch, rest: true }); // 활동<2 = 점심 뒤에
    if (dinner) seq.push({ p: dinner, rest: true });

    // ⚠️ 2026-07-21 사장님 SSOT = 슬롯 시각 = 활동/식사 각 소요시간 누적(균일 그리드 폐기 §19). 활동 우선 = 최대한 활동 보장.
    let prev: LatLng = center;
    let dayKm = 0;
    const startMin = toMin(dc.startTime);
    const slotStartMins: number[] = [];
    let acc = startMin;
    for (const it of seq) {
      slotStartMins.push(acc);
      acc += it.rest ? mealDuration : slotDuration;
    }
    const scenes: RouteScene[] = seq.map((it, i) => {
      const km = round2(haversineKm(prev.lat, prev.lng, it.p.lat, it.p.lng));
      const { mode, calc } = pickTransitMode(
        km,
        transport === "private_driver_guide",
      );
      // ⚠️ 2026-07-04 사장님 SSOT = center(도시중심)를 넘겨 DRIVE 모드 도심/외곽 속도 분기(30/70km/h) 적용.
      const tr = calcTransitHaversine(
        prev,
        { lat: it.p.lat, lng: it.p.lng },
        calc,
        companionCount,
        center,
      );
      prev = { lat: it.p.lat, lng: it.p.lng };
      dayKm += km;
      grandSec += (it.rest ? mealDuration : slotDuration) * 60;
      const scene: RouteScene = {
        slot: i + 1,
        time: minutesToTime(slotStartMins[i]),
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
      if (it.rest && it.p.estimatedPriceEur != null)
        scene.price_eur = it.p.estimatedPriceEur;
      if (it.p.summaryKo) scene.selection_reason_ko = it.p.summaryKo;
      if (it.p.editorialSummary) scene.shortform_ko = it.p.editorialSummary;
      if (it.p.image) scene.image = it.p.image; // ⚠️ 2026-06-12 = PSR image_url 전달 (= 식당풀 픽 이미지 단절 해소)
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
