// ⚠️ 수정금지(승인필요) 2026-06-06 = DB-only 결정적 동선 빌더 v2 = handleRouteRequest(Gemini) 동형 대체 (= 사용자 SSOT)
import type { AG1Output, PlaceResult } from "../agents/types";
import { minutesToTime } from "../agents/types";
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
// ⚠️ 2026-10-16 사장님 SSOT = 드라이빙 가이드 판별 단일 SSOT(Gemini·MIX 경로와 동일 함수 = 3경로 정합, §16 재발명 금지).
import { shouldApplyGuidePrice } from "../transport/guide-pricing";
import {
  slotMinutesFor,
  FREE_THRESHOLD_EUR,
  PRICED_STAY_CATEGORIES,
} from "../shared/slot-duration";
import { bestRankLangCount } from "../shared/best-rank";
import { VIBE_PRIMARY_CATEGORY } from "@shared/vibe-category";
import { tierRange, type CityMealTiers } from "../shared/meal-budget-tiers";
import {
  retimeDay,
  moveMinKm as sharedMoveMinKm,
  moveMult,
  toMin,
} from "@shared/day-retime";
import { buildBtsDay } from "./route-bts";
import { buildPickedDay, type PickedLayoutItem } from "./route-picked";

type LatLng = { lat: number; lng: number };

const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildRouteLocal(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: LatLng | undefined,
  restaurantPool?: PlaceResult[],
  hourlyRate?: number | null,
  mealTiers?: CityMealTiers | null,
  picked?: {
    days: string[][];
    layout?: PickedLayoutItem[][];
    anchors?: (LatLng | null | undefined)[];
  },
): RouteHandlerResult {
  const pickedDays = picked?.days;
  const t0 = Date.now();
  const { formData, daySlotsConfig, paceConfig, companionCount } = skeleton;
  const slotDuration = paceConfig.slotDurationMinutes; // 활동 1곳 시간
  const mealDuration = paceConfig.mealDurationMinutes; // 식사 1회 시간(밀도별, 활동보다 짧음)
  // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 예산 구간 = 그 도시 가격 분포 1벌, 분포가 없으면 가격으로 자르지 않음 (정본 B4)
  const style = normalizeTravelStyle(formData.travelStyle);
  const band = mealTiers
    ? tierRange(style, mealTiers)
    : { min: 0, cap: Number.POSITIVE_INFINITY };

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

  const MOVE_MULT = moveMult(transport === "private_driver_guide");
  const isBts = !!formData.finalPlaceId;

  // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 곳수 상한 없음 = 선정은 분(minute) 기준이 유일 (정본 B4)
  const candidates = places.filter(
    (p) => p.seedCategory !== "restaurant" && hasCoord(p),
  );
  const activities = [...candidates];

  const restaurants = (
    restaurantPool && restaurantPool.length
      ? restaurantPool
      : places.filter((p) => p.seedCategory === "restaurant")
  ).filter(hasCoord);

  const usedRest = new Set<string>();
  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 식당 = 넓힌 풀 전체에서 그 슬롯에 가장 가까운 순(거리 상한 없음) · 예산 띠 안 첫 곳 → 상한 이하 첫 곳 → 최근접(같은 거리면 베스트>RC) · 점심 = 직전 활동 · 저녁 = 마지막 활동.
  const pickMealPriority = (
    anchors: LatLng[],
    priceMin: number,
    priceCap: number,
    peekOnly = false,
  ): PlaceResult | null => {
    const refs = anchors.filter((a) => a && a.lat != null && a.lat !== 0);
    const useRefs = refs.length ? refs : [center];
    const scored = restaurants
      .filter((r) => !usedRest.has(r.id))
      .map((r) => ({
        r,
        d: Math.min(
          ...useRefs.map((a) => haversineKm(a.lat, a.lng, r.lat, r.lng)),
        ),
      }));
    if (!scored.length) return null;

    const lo = Math.min(priceMin, priceCap);
    const byBestRc = (a: (typeof scored)[0], b: (typeof scored)[0]) =>
      bestRankLangCount(b.r.bestRank) - bestRankLangCount(a.r.bestRank) ||
      (a.r.rank ?? 9999) - (b.r.rank ?? 9999) ||
      a.d - b.d;
    const inBudget = (x: (typeof scored)[0]) =>
      x.r.estimatedPriceEur != null &&
      x.r.estimatedPriceEur >= lo &&
      x.r.estimatedPriceEur <= priceCap;
    const underCap = (x: (typeof scored)[0]) =>
      x.r.estimatedPriceEur != null && x.r.estimatedPriceEur <= priceCap;

    const byDist = [...scored].sort((a, b) => a.d - b.d || byBestRc(a, b));
    // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 식당 = 가까운 3곳 안에서 예산 띠 → 상한 이하 → 최근접 (일반 여정 · 옛 베스트 갈래 삭제) (정본 §)
    const nearPool = byDist.slice(0, 3);
    const hit =
      nearPool.find(inBudget) ?? nearPool.find(underCap) ?? nearPool[0];
    if (!peekOnly) usedRest.add(hit.r.id);
    return hit.r;
  };

  // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 예상 여정 식당 = 슬롯과 한 짝 = 그 볼거리에서 걸어갈 거리(1km · 베스트 발굴 지시문) 안의 베스트 식당 중 사용자 등급(도시 베스트 식당 가격 순 하·중·상)에서 가장 가까운 곳 → 없으면 우리 풀에서 예산 띠 안 가장 가까운 곳 (정본 §)
  const PAIR_WALK_KM = 1.0;
  const pickedTier = style === "Economic" ? 0 : style === "Reasonable" ? 1 : 2;
  const priceOf = (r: PlaceResult) =>
    r.estimatedPriceEur != null ? Number(r.estimatedPriceEur) : null;
  const bestRests = pickedDays
    ? restaurants.filter((r) => r.bestRank != null && priceOf(r) != null)
    : [];
  const bestPrices = [...new Set(bestRests.map((r) => priceOf(r)!))].sort(
    (a, b) => a - b,
  );
  const tierOfPrice = new Map(
    bestPrices.map((p, i) => [p, Math.floor((i * 3) / bestPrices.length)]),
  );
  const nearestOf = (cands: PlaceResult[], a: LatLng) => {
    let best: { r: PlaceResult; d: number } | null = null;
    for (const r of cands) {
      const d = haversineKm(a.lat, a.lng, r.lat, r.lng);
      if (!best || d < best.d) best = { r, d };
    }
    return best;
  };
  const pairNear = (a: LatLng): PlaceResult | null => {
    const hit = nearestOf(
      bestRests.filter(
        (r) =>
          !usedRest.has(r.id) && tierOfPrice.get(priceOf(r)!) === pickedTier,
      ),
      a,
    );
    return hit && hit.d <= PAIR_WALK_KM ? hit.r : null;
  };
  const poolNear = (a: LatLng): PlaceResult | null =>
    nearestOf(
      restaurants.filter((r) => {
        const p = priceOf(r);
        return (
          !usedRest.has(r.id) &&
          p != null &&
          p >= Math.min(band.min, band.cap) &&
          p <= band.cap
        );
      }),
      a,
    )?.r ?? null;

  const SAME_SPOT_KM = 0.5;
  const keyOf = (p: PlaceResult) =>
    String(p.nameKo || p.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, "");
  const sameName = (a: PlaceResult, b: PlaceResult) => {
    const x = keyOf(a),
      y = keyOf(b);
    return !!x && !!y && (x.includes(y) || y.includes(x));
  }; // 이 안 = 같은 자리(리조트·단지) = 같은 날에 묶음
  const OUTSKIRT_MAX_KM = 100;
  const kmFromCenter = (p: PlaceResult) =>
    haversineKm(center.lat, center.lng, p.lat, p.lng);

  // ⚠️ 수정금지(승인필요) 2026-08-31 사장님 확정 = ① 여행 전체에서 뽑을 곳을 먼저 확정(베스트 전부 → 카테고리별 RC) (정본 B4)
  const stayMin = (p: PlaceResult) =>
    slotMinutesFor(
      p.estimatedPriceEur,
      slotDuration,
      hourlyRate ?? null,
      p.seedCategory,
    );
  // ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 이동 분 = 직선 거리 시간 × 2(대중교통·도보) · 가이드 × 1.5 = 모든 여정이 이 한 값 (정본 §)
  const moveMinKm = (km: number): number => sharedMoveMinKm(km, MOVE_MULT);
  // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 유료 입장지는 18:00 이후 시작 불가(대부분 폐관) (정본 B4)
  const PAID_LAST_START_MIN = 18 * 60;
  const inRange = activities.filter((p) => kmFromCenter(p) <= OUTSKIRT_MAX_KM);
  // ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 점심은 11:00~14:00 안에 먹는다 = 모든 여정 (정본 §)
  const LUNCH_FROM = 11 * 60;
  const LUNCH_BY = 14 * 60;
  const LONG_STAY_MIN = 360;
  const DINNER_FROM = 19 * 60;
  const hasRest = restaurants.length > 0;
  const isPaidPlace = (p: PlaceResult) =>
    (p.estimatedPriceEur ?? 0) > FREE_THRESHOLD_EUR &&
    PRICED_STAY_CATEGORIES.has(p.seedCategory ?? "");
  const worth = (p: PlaceResult) => {
    const b = bestRankLangCount(p.bestRank);
    const r = Math.min(p.rank ?? 9999, 9999);
    return b > 0
      ? 10000 + b * 1000 + Math.max(0, 1000 - r)
      : Math.max(1, 1000 - Math.min(r, 999));
  };
  const sameSpot = (a: PlaceResult, b: PlaceResult) =>
    haversineKm(a.lat, a.lng, b.lat, b.lng) <= SAME_SPOT_KM && sameName(a, b);

  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 뽑기 = 25km 안 먼저(다른 카테고리로 넘어갈 때도 25km 안부터) → 사용자 카테고리 껍질 → 베스트 → rank 순으로 체류 합계가 전체 활동 시간에 찰 때까지 · 25km 안이 전 카테고리 다 떨어진 뒤에만 밖 (정본 B4 v26)
  const NEAR_KM = 25;
  const pickedCats = (formData.vibes ?? [])
    .map((v) => VIBE_PRIMARY_CATEGORY[v])
    .filter((c): c is string => !!c && c !== "restaurant");
  const nearTier = (p: PlaceResult) => (kmFromCenter(p) <= NEAR_KM ? 0 : 1);
  const catTier = (p: PlaceResult) =>
    pickedCats.includes(p.seedCategory ?? "") ? 0 : 1;
  const totalActMin = daySlotsConfig.reduce(
    (s, dc) =>
      s +
      (toMin(dc.endTime) - toMin(dc.startTime)) -
      (hasRest && LUNCH_FROM + mealDuration <= toMin(dc.endTime)
        ? mealDuration
        : 0),
    0,
  );
  const remaining: PlaceResult[] = [];
  let usedMin = 0;
  for (const p of [...inRange].sort(
    (a, b) =>
      nearTier(a) - nearTier(b) ||
      catTier(a) - catTier(b) ||
      worth(b) - worth(a),
  )) {
    if (remaining.some((q) => sameSpot(q, p))) continue;
    const s = stayMin(p);
    if (usedMin + s > totalActMin) continue;
    usedMin += s;
    remaining.push(p);
  }

  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 추출 뒤 랭킹·베스트는 동등 · 전부 동선이 가까운 대로 = 하루 첫 출발은 남은 곳 중 가장 먼 곳, 그 뒤는 지금 자리에서 가장 가까운 남은 곳으로 기차처럼 · 도심 기준 판단 없음 · 25km 안 후보를 먼저 다 돌고 떨어진 뒤에만 밖 · 자리가 차면 다음 날 · 방향 개념 없음 (정본 B4 v25)

  const days: RouteResponse["days"] = [];
  let grandKm = 0;
  let grandSec = 0;

  for (let di = 0; di < daySlotsConfig.length; di++) {
    const dc = daySlotsConfig[di];
    const dayCenter = picked?.anchors?.[di] ?? center;
    // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 끝 = 사용자 끝 시각(BTS 는 공연 시작) · 저녁 = 마지막 슬롯 · 시작 = 끝 − 밀도 길이(단 19:00 앞으로는 안 감) · 45분을 못 채우면 저녁을 만들지 않는다 (일반 여정 · 베스트는 기존) · 예상 여정(목록에서 고른 날)은 그 날 계산(route-picked)이 점심·저녁을 넣는다 (정본 §)
    const endMin = isBts
      ? toMin(formData.finalPlaceTime || "19:00")
      : toMin(dc.endTime);
    const dinnerLen = endMin - Math.max(endMin - mealDuration, DINNER_FROM);
    const skipDinner = dinnerLen < 45;
    const dinnerOn = hasRest && !skipDinner && !isBts && !pickedDays;
    const actDeadline = dinnerOn ? endMin - dinnerLen : endMin;
    const seq: { p: PlaceResult; rest: boolean }[] = [];
    const slotStartMins: number[] = [];
    const slotDurations: number[] = [];
    const slotMoves: number[] = [];
    let acc = toMin(dc.startTime);
    let cursor: LatLng | null = null;
    let lunchDone = !hasRest;
    const dinnerEarly: PlaceResult | null = dinnerOn
      ? pickMealPriority([center], band.min, band.cap)
      : null;
    const moveMin = (p: PlaceResult): number => {
      const from = cursor ?? center;
      return moveMinKm(haversineKm(from.lat, from.lng, p.lat, p.lng));
    };
    const place = (p: PlaceResult, rest: boolean, dur: number, at: number) => {
      slotMoves.push(moveMin(p));
      seq.push({ p, rest });
      slotStartMins.push(at);
      slotDurations.push(dur);
      acc = at + dur;
      if (!rest) cursor = { lat: p.lat, lng: p.lng };
    };
    // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 넣을 수 있는지(마감) 먼저 보고 그때만 식당을 소비한다 = 점심이 안 들어가는 짧은 날에 가장 가까운 식당이 헛되이 쓰여 저녁이 그 다음 식당을 받던 것 교정(옛 = 고른 뒤 마감 검사 §19).
    const takeLunch = () => {
      lunchDone = true;
      const peek = pickMealPriority(
        [cursor ?? center],
        band.min,
        band.cap,
        true,
      );
      if (!peek) return;
      if (
        Math.max(acc + moveMin(peek), LUNCH_FROM) + mealDuration >
        actDeadline
      )
        return;
      const lunch = pickMealPriority([cursor ?? center], band.min, band.cap);
      if (!lunch) return;
      place(
        lunch,
        true,
        mealDuration,
        Math.max(acc + moveMin(lunch), LUNCH_FROM),
      );
    };
    const fitsNow = (p: PlaceResult): boolean => {
      let t = acc + moveMin(p);
      let ld = lunchDone || LUNCH_FROM + mealDuration > endMin;
      if (!ld && t >= LUNCH_FROM) {
        t = Math.max(t, LUNCH_FROM) + mealDuration;
        ld = true;
      }
      if (isPaidPlace(p) && t >= PAID_LAST_START_MIN) return false;
      const s = stayMin(p);
      t += s;
      if (!ld && s >= LONG_STAY_MIN) ld = true;
      if (!ld) t = Math.max(t, LUNCH_FROM) + mealDuration;
      return (
        t <=
        (dinnerOn
          ? endMin -
            dinnerLen -
            (dinnerEarly
              ? moveMinKm(
                  haversineKm(p.lat, p.lng, dinnerEarly.lat, dinnerEarly.lng),
                )
              : 0)
          : endMin)
      );
    };
    let btsBuilt = false;
    let btsDinner = false;
    let finalMoveMin: number | undefined;
    if (pickedDays) {
      btsBuilt = true;
      lunchDone = true;
      const byId = new Map(places.map((p) => [p.id, p]));
      const day = buildPickedDay({
        acts: (pickedDays[di] ?? [])
          .map((id) => byId.get(id))
          .filter((p): p is PlaceResult => !!p && hasCoord(p)),
        center: dayCenter,
        startMin: toMin(dc.startTime),
        endMin,
        mult: MOVE_MULT,
        lunchFrom: LUNCH_FROM,
        lunchBy: LUNCH_BY,
        mealDuration,
        stayMin,
        layout: picked?.layout?.[di],
        pickMeal: (prev, next) =>
          (prev ? pairNear(prev) : null) ??
          (next ? pairNear(next) : null) ??
          poolNear(next ? (prev ?? next) : dayCenter),
        markUsed: (id) => usedRest.add(id),
      });
      day.items.forEach((it, i) => {
        seq.push(it);
        slotStartMins.push(day.starts[i]);
        slotDurations.push(day.stays[i]);
        slotMoves.push(day.moves[i]);
      });
      btsDinner = day.hasDinner;
      finalMoveMin = day.finalMove;
    } else if (isBts) {
      btsBuilt = true;
      lunchDone = true;
      const bts = buildBtsDay({
        places,
        pinnedPlaceIds: formData.pinnedPlaceIds ?? [],
        center,
        startMin: toMin(dc.startTime),
        endMin,
        mult: MOVE_MULT,
        lunchFrom: LUNCH_FROM,
        lunchBy: LUNCH_BY,
        mealDuration,
        stayMin,
        hasCoord,
        markUsed: (id) => usedRest.add(id),
        peekLunch: (near) => pickMealPriority([near], band.min, band.cap, true),
        pickDinner: () => pickMealPriority([center], band.min, band.cap),
      });
      bts.items.forEach((it, i) => {
        seq.push(it);
        slotStartMins.push(bts.starts[i]);
        slotDurations.push(bts.stays[i]);
        slotMoves.push(bts.moves[i]);
      });
      btsDinner = bts.hasDinner;
      finalMoveMin = bts.finalMove;
    }
    for (; !btsBuilt; ) {
      const nearLeft = remaining.some((p) => kmFromCenter(p) <= NEAR_KM);
      let pool = remaining.filter(
        (p) => (!nearLeft || kmFromCenter(p) <= NEAR_KM) && fitsNow(p),
      );
      if (!pool.length) break;
      // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 먼 곳부터 시작하되 첫 이동은 45분 안(베스트 언어 5개 이상인 곳은 예외) · 안에 없으면 상한을 풀어 그대로 (일반 여정 · 옛 베스트 갈래 삭제) (정본 §)
      if (!cursor) {
        const capped = pool.filter(
          (p) =>
            moveMinKm(haversineKm(center.lat, center.lng, p.lat, p.lng)) <=
              45 || bestRankLangCount(p.bestRank) >= 5,
        );
        if (capped.length) pool = capped;
      }
      const from = cursor;
      const pick = from
        ? pool.sort(
            (a, b) =>
              haversineKm(from.lat, from.lng, a.lat, a.lng) -
                haversineKm(from.lat, from.lng, b.lat, b.lng) ||
              worth(b) - worth(a),
          )[0]
        : pool.sort(
            (a, b) => kmFromCenter(b) - kmFromCenter(a) || worth(b) - worth(a),
          )[0];
      // ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 점심 = 식당 도착이 11:00~14:00 창 안이면 지금 먹는다 (정본 §)
      if (!lunchDone) {
        const cand = pickMealPriority(
          [cursor ?? center],
          band.min,
          band.cap,
          true,
        );
        if (cand) {
          const eatAt = acc + moveMin(cand);
          if (eatAt >= LUNCH_FROM) takeLunch();
        }
      }
      const dur = stayMin(pick);
      const arriveAt = acc + moveMin(pick);
      place(pick, false, dur, arriveAt);
      if (!lunchDone && dur >= LONG_STAY_MIN) lunchDone = true;
      remaining.splice(remaining.indexOf(pick), 1);
    }
    if (!lunchDone) takeLunch();
    let dinnerPlaced = false;
    if (dinnerOn) {
      const dinner =
        dinnerEarly ?? pickMealPriority([cursor ?? center], band.min, band.cap);
      // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 저녁 = 무조건 마지막 슬롯(19:00 전이면 19:00), 손님 종료시각과 무관하게 남겨 둔다.
      if (dinner) {
        place(
          dinner,
          true,
          dinnerLen,
          Math.max(acc + moveMin(dinner), endMin - dinnerLen),
        );
        dinnerPlaced = true;
      }
    }
    // ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 일반 여정 = 하루 시각표를 계산 1벌(shared/day-retime)로 다시 깐다 = 이동 · 점심 11~14시 · 저녁 끝에 박기 · 활동이 늘고 줄어 끝에 맞춤 (정본 §)
    if (btsBuilt && btsDinner) dinnerPlaced = true;
    if (seq.length && !btsBuilt) {
      const rt = retimeDay({
        slots: seq.map((it, i) => ({
          lat: it.p.lat,
          lng: it.p.lng,
          base: slotDurations[i],
          kind:
            dinnerPlaced && i === seq.length - 1
              ? "dinner"
              : it.rest
                ? "lunch"
                : "act",
        })),
        anchor: center,
        startMin: toMin(dc.startTime),
        endMin,
        mult: MOVE_MULT,
        lunchFrom: LUNCH_FROM,
        lunchBy: LUNCH_BY,
      });
      for (let i = 0; i < seq.length; i++) {
        slotStartMins[i] = rt.starts[i];
        slotDurations[i] = rt.stays[i];
        slotMoves[i] = rt.moves[i];
      }
    }
    let prev: LatLng = dayCenter;
    let dayKm = 0;
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
      grandSec += slotDurations[i] * 60;
      const scene: RouteScene = {
        slot: i + 1,
        time: minutesToTime(slotStartMins[i]),
        type: it.rest ? "restaurant" : "activity",
        meal_type: it.rest
          ? dinnerPlaced && i === seq.length - 1
            ? "dinner"
            : "lunch"
          : undefined,
        place_id: it.p.id,
        name_en: it.p.name || "",
        name_ko: it.p.nameKo || "",
        name_local: it.p.nameLocal || it.p.name || "",
        address: it.p.address || "",
        lat: it.p.lat,
        lng: it.p.lng,
        distance_from_prev_km: km,
        transit_mode: mode,
        transit_min: slotMoves[i],
        slot_min: slotDurations[i],
      };
      if (it.rest && it.p.estimatedPriceEur != null)
        scene.price_eur = it.p.estimatedPriceEur;
      if (it.p.summaryKo) scene.selection_reason_ko = it.p.summaryKo;
      if (it.p.editorialSummary) scene.shortform_ko = it.p.editorialSummary;
      if (it.p.image) scene.image = it.p.image; // ⚠️ 2026-06-12 = PSR image_url 전달 (= 식당풀 픽 이미지 단절 해소)
      return scene;
    });

    days.push({
      day: dc.day,
      total_distance_km: round2(dayKm),
      scenes,
      final_move_min: finalMoveMin,
    });
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
