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
  pickTransitMode,
} from "../agents/transit-haversine";
import type {
  RouteResponse,
  RouteScene,
  RouteHandlerResult,
} from "./route-types";
// ⚠️ 2026-06-12 = 정본 동선(NN체인+간격절단+Day1도심 / 일내 귀소동선) = k-means 지그재그 해소 (USE_SECTOR_ROUTE 토글, 1초 롤백)
import { sectorIntoDays, orderHoming } from "./route-sector";
// ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 판별 단일 SSOT(Gemini·MIX 경로와 동일 함수 = 3경로 정합, §16 재발명 금지).
import { shouldApplyGuidePrice } from "../transport-pricing-service";

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
  // 폐루프 = 마지막 노드 → center 귀환 비용 포함 (= 종착이 중심 근처)
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

/**
 * NN + 2-opt 폴백 (= 노드 >11) = 폐루프(중심 출발·귀환) + 시작 엣지(center→첫노드) 목적함수 포함.
 */
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
      // i = -1 = 시작 엣지(center→ordered[0]) 포함
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

// 🗑️ 2026-07-06 = pickMode 로컬정의 삭제 = transit-haversine.pickTransitMode 단일 SSOT 이동(§16, MIX·DB-only 공통) §19

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
function clusterIntoDays(
  items: PlaceResult[],
  k: number,
  center: LatLng,
): PlaceResult[][] {
  const pts = items.filter(hasCoord);
  if (k <= 1) return [pts];
  if (pts.length <= k)
    return Array.from({ length: k }, (_, i) => (pts[i] ? [pts[i]] : []));

  // 1) farthest-first 초기 centroid (= 서로 먼 씨앗 = 방향 분리)
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

  // 2) Lloyd 반복 (10회)
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

  // 3) 용량균형 재배정 (cap=ceil(n/k)) = 확신(regret) 높은 점 먼저 = 한 날 몰림 방지
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

/**
 * 로컬 동선 빌드 v2 = handleRouteRequest(Gemini) 동형 대체 (= 2단계: 활동 1차 / 식당 2차)
 * @param skeleton AG1 뼈대 (= 일자/슬롯/페이스/인원/travelStyle)
 * @param places AG2-DB 풀 (= 활동 후보, 좌표 보유)
 * @param cityCoords 도심 중심 = 출발/종료 앵커 (숙소좌표 있으면 formData.accommodationCoords 우선, 2026-07-04)
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
  const slotDuration = paceConfig.slotDurationMinutes; // 활동 1곳 시간
  const mealDuration = paceConfig.mealDurationMinutes; // 식사 1회 시간(밀도별, 활동보다 짧음)
  const mealBudget = MEAL_BUDGET[formData.travelStyle || "Reasonable"];

  // ⚠️ 2026-07-04 사장님 SSOT = 출발/종료 앵커 = 숙소 좌표 최우선(§14 A안=여행 전체 공통 숙소) → 없으면 도심 중심.
  //   지도 숙소깃발·슬롯순서 변경은 이미 실시간 연동인데 동선 최적화(center)만 도심 고정이던 결함 수정(§0).
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
  //   = Gemini·MIX 경로와 동일한 shouldApplyGuidePrice 단일 SSOT 적용(옛 "Minimal만" 판정 완전 삭제 §19). travelStyle=예산도 반영.
  const transport: "public_transit" | "private_driver_guide" =
    shouldApplyGuidePrice(formData.mobilityStyle, formData.travelStyle)
      ? "private_driver_guide"
      : "public_transit";

  // 활동 = 비식당, rank 높은 순, 슬롯 상한(= Σ(slots-2))까지 (= 유명 보존 = 베르사유, 버퍼 초과분 drop)
  const maxActivities = daySlotsConfig.reduce(
    (s, dc) => s + Math.max(1, dc.slots - 2),
    0,
  );
  const activities = places
    .filter((p) => p.seedCategory !== "restaurant" && hasCoord(p))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, maxActivities);

  // 식당풀 = ag4 가 DB 조회해 전달(우선) / 없으면 places 내 식당(= sim 폴백)
  const restaurants = (
    restaurantPool && restaurantPool.length
      ? restaurantPool
      : places.filter((p) => p.seedCategory === "restaurant")
  ).filter(hasCoord);

  // 2차 식당 우선순위 픽 = [1순위] 인접성(앵커 최근접) 정렬 → [2순위] 가격대 "구간"(min~max) 내 최근접 + 전역 중복 제외
  // ⚠️ 2026-06-12 = 가격대 구간 필터 = 사용자 예산등급 풀 (= 상한만 쓰면 Premium 도 싼 식당 뽑힘 = 등급 무의미 버그 수정).
  //   = priceMin~priceCap 구간 내 최근접 우선 → 없으면 상한이하 최근접 폴백 → 그것도 없으면 최근접(빈슬롯 방지).
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
    // ⚠️ 2026-06-12 = 하한 클램프 = Luxury 점심(min181 > 점심상한120) 역전 방어 = min 을 상한 이하로 (= 등급 필터 무력화 버그 수정)
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

  // 1차 = 활동 일자 배정 (= NN체인+간격절단+Day1도심, route-sector 정본)
  // ⚠️ 2026-06-12 = 기본 = 정본(좌표 최인접 묶음 = 붙은곳 보존 + Day1 도심 = 귀소 본능) / USE_SECTOR_ROUTE='false' = 옛 k-means 롤백
  //   = slotsPerDay = 일자별 활동 한도(= slots-2). sectorIntoDays 가 내부에서 Day1 도심 정렬까지 수행(= 추가 sort 불필요).
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
    // ⚠️ 2026-06-12 = 정본 = orderHoming(최외곽 1코스 → 도심/숙소 귀환 = 귀소 본능) / 롤백 = orderByNN(폐루프)
    const dayActs = USE_SECTOR_ROUTE
      ? orderHoming(dayGroups[di] || [], center)
      : orderByNN(dayGroups[di] || [], center);

    // 점심 = 슬롯3 (= 활동 2개 후) = 활동2·활동4 중 최근접 식당 (= detour 0)
    const lunchIdx = Math.min(2, dayActs.length);
    const aBefore = dayActs[lunchIdx - 1];
    const aAfter = dayActs[lunchIdx];
    const lunch = pickMealPriority(
      dayActs.length >= 1
        ? [aBefore, aAfter]
            .filter(Boolean)
            .map((p) => ({ lat: p.lat, lng: p.lng }))
        : [center], // ⚠️ 활동 0개(빈 날) = 중심 앵커 = 2식 보장
      mealBudget.min, // 가격대 하한 (= 등급 구간)
      mealBudget.lunch,
    );
    // 저녁 = 마지막 슬롯 = 최종활동·파리중심 중 최근접 (= 조회 폭 넓힘 = 중심 귀환 모델). 빈 날 = 중심 앵커
    const lastAct = dayActs[dayActs.length - 1];
    const dinner = pickMealPriority(
      lastAct ? [{ lat: lastAct.lat, lng: lastAct.lng }, center] : [center],
      mealBudget.min, // 가격대 하한 (= 등급 구간)
      mealBudget.dinner,
    );

    // 시퀀스 조립 = 활동 + 점심(슬롯3) + 저녁(마지막)
    const seq: { p: PlaceResult; rest: boolean }[] = [];
    dayActs.forEach((act, idx) => {
      if (idx === lunchIdx && lunch) seq.push({ p: lunch, rest: true });
      seq.push({ p: act, rest: false });
    });
    if (lunch && lunchIdx >= dayActs.length) seq.push({ p: lunch, rest: true }); // 활동<2 = 점심 뒤에
    if (dinner) seq.push({ p: dinner, rest: true });

    // ⚠️ 2026-07-21 사장님 SSOT = 슬롯 시각 = 활동/식사 각 소요시간 누적(균일 그리드 폐기 §19). 활동 우선 = 최대한 활동 보장.
    //   활동 = slotDuration, 점심 = mealDuration(중간). 저녁 = 마지막 슬롯 = 마지막 활동 끝난 시각부터 시작(시작시각만 = 종료 미지정 = 사용자 현장 결정).
    //   → 활동을 앞에 꽉 채우고 저녁은 그 직후 = 저녁이 실제 저녁시각(영업시간)에 자연히 옴. 옛 저녁 이른시각(16:30)·종료 인위고정 폐기 §19.
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
