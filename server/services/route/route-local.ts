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
// ⚠️ 2026-07-04 사장님 SSOT = 드라이빙 가이드 판별 단일 SSOT(Gemini·MIX 경로와 동일 함수 = 3경로 정합, §16 재발명 금지).
import { shouldApplyGuidePrice } from "../transport-pricing-service";
import {
  slotMinutesFor,
  FREE_THRESHOLD_EUR,
  PRICED_STAY_CATEGORIES,
} from "../shared/slot-duration";
import { bestRankLangCount } from "../shared/best-rank";
import { VIBE_PRIMARY_CATEGORY } from "@shared/vibe-category";
import { tierRange, type CityMealTiers } from "../shared/meal-budget-tiers";

type LatLng = { lat: number; lng: number };

const hasCoord = (p: { lat?: number | null; lng?: number | null }): boolean =>
  p.lat != null && p.lng != null && p.lat !== 0 && p.lng !== 0;

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildRouteLocal(
  skeleton: AG1Output,
  places: PlaceResult[],
  cityCoords: LatLng | undefined,
  restaurantPool?: PlaceResult[],
  hourlyRate?: number | null,
  mealTiers?: CityMealTiers | null,
  // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 베스트 여정 분기 스위치 = 이동시간 더하기·점심창 11시·식당 등급 우선·배치 등급 순서가 전부 이 하나로 갈린다(옛 이름 addTransitTime = 역할과 어긋나 폐기 §19). 안 넘기면(기존 여정) 지금까지와 동일.
  bestMode?: boolean,
): RouteHandlerResult {
  const t0 = Date.now();
  const { formData, daySlotsConfig, paceConfig, companionCount } = skeleton;
  const slotDuration = paceConfig.slotDurationMinutes; // 활동 1곳 시간
  const mealDuration = paceConfig.mealDurationMinutes; // 식사 1회 시간(밀도별, 활동보다 짧음)
  // ⚠️ 수정금지(승인필요) 2026-08-31 사장님 확정 = 예산 구간 = 그 도시 분포 경계선(30/50/20) (정본 B4)
  //   = 전 도시 고정 유로(점심 상한 €16 등)는 물가를 못 담아 근처 후보를 전부 떨어뜨림 = 폐기 §19.
  //   = 표본 부족 도시만 MEAL_BUDGET 고정값으로 되돌린다.
  const style = normalizeTravelStyle(formData.travelStyle);
  const fixed = MEAL_BUDGET[style];
  const band = mealTiers
    ? tierRange(style, mealTiers)
    : { min: fixed.min, cap: fixed.max };
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
    // 미리보기 = 후보만 보고 쓰지는 않는다(소비하면 근처 식당이 헛되이 사라져 먼 곳만 남는다).
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

    // ① 핀 식당 = 사용자가 직접 고른 것 = 모든 기준보다 우선(2026-07-31 사장님 승인).
    const pinnedPick = [...scored]
      .sort((a, b) => a.d - b.d)
      .find((x) => pinnedRestIds.has(x.r.id));
    if (pinnedPick) {
      if (!peekOnly) usedRest.add(pinnedPick.r.id);
      return pinnedPick.r;
    }

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

    // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정(베스트 분기 전용) = 식당 = 걸어갈 거리(1km) 안에 있는 것 중 **베스트 등급 높은 순**을 먼저(랜드마크 옆 베스트 식당 3~6곳이 이미 창고에 있음). 1km 안에 없으면 아래 기존 규칙(가까운 순·예산 띠).
    if (bestMode) {
      const near = scored.filter((x) => x.d <= 1.0).sort(byBestRc);
      if (near.length && bestRankLangCount(near[0].r.bestRank) > 0) {
        if (!peekOnly) usedRest.add(near[0].r.id);
        return near[0].r;
      }
    }
    const byDist = [...scored].sort((a, b) => a.d - b.d || byBestRc(a, b));
    const hit = byDist.find(inBudget) ?? byDist.find(underCap) ?? byDist[0];
    if (!peekOnly) usedRest.add(hit.r.id);
    return hit.r;
  };

  const SAME_SPOT_KM = 0.5;
  // 같은 장소가 창고에 여러 행으로 있을 때(앵발리드 45m 실측)만 걸러낸다.
  // 거리만 보면 78m 떨어진 생트샤펠·콩시에르쥬리처럼 서로 다른 명소가 같이 잘린다.
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
  //   = 날짜별로 그때그때 고르면 앞날이 자리를 다 써 뒤에 남은 만장일치가 통째 탈락함(파리 ★7 3곳 실측).
  // 자리 = 곳수가 아니라 분(minute) = 입장료 슬롯이 밀도값보다 길어 곳수로 세면 뒤쪽이 통째 탈락함.
  const stayMin = (p: PlaceResult) =>
    slotMinutesFor(
      p.estimatedPriceEur,
      slotDuration,
      hourlyRate ?? null,
      p.seedCategory,
    );
  // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 유료 입장지는 18:00 이후 시작 불가(대부분 폐관) (정본 B4)
  const PAID_LAST_START_MIN = 18 * 60;
  const inRange = activities.filter((p) => kmFromCenter(p) <= OUTSKIRT_MAX_KM);
  const LUNCH_FROM = bestMode ? 11 * 60 : 12 * 60;
  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 점심은 11:00~14:00 안에 먹는다(베스트 분기 전용). 창을 놓치면 도착 직후.
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
    const endMin = toMin(dc.endTime);
    const actDeadline = endMin;
    const seq: { p: PlaceResult; rest: boolean }[] = [];
    const slotStartMins: number[] = [];
    const slotDurations: number[] = [];
    let acc = toMin(dc.startTime);
    let cursor: LatLng | null = null;
    let lunchDone = !hasRest;
    // 지금 자리에서 그 곳까지 실제 이동에 걸리는 분(옵션 꺼져 있으면 0 = 기존 동작).
    //   30km 넘으면 기차 = 순수 이동에 표·역접근·대기·환승 45분을 얹는다(직선거리라 실제와 맞춤).
    const moveMin = (p: PlaceResult): number => {
      if (!bestMode) return 0;
      const from = cursor ?? center;
      const km = haversineKm(from.lat, from.lng, p.lat, p.lng);
      if (km <= 1.0) return Math.round((km / 5) * 60);
      if (km <= 30) return Math.round((km / 25) * 60 + 10);
      return Math.round((km / 75) * 60 + 45);
    };
    const place = (p: PlaceResult, rest: boolean, dur: number, at: number) => {
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
      // 저녁 자리를 미리 비운다 = 볼거리가 하루 끝까지 채우면 저녁이 22시로 밀린다(베스트 분기 전용).
      return t <= (bestMode && hasRest ? endMin - mealDuration : endMin);
    };
    for (;;) {
      let pool: PlaceResult[];
      if (bestMode) {
        // ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정(베스트 분기 전용) = 배치도 등급을 본다 = 남은 곳 중 **가장 높은 동의 등급부터** 앉힌다(7 전부 → 6 → 5 → 4 → 3 → 리뷰수 채움). 같은 등급 안에서는 25km 안 먼저. 1·2일차는 25km 안만, 3일차부터 밖(당일치기) 허용. 리마·보고타·브뤼셀 3도시 시뮬 = 만장일치 탈락 0.
        const farOk = di >= 2;
        const cands = remaining.filter(
          (p) => (farOk || kmFromCenter(p) <= NEAR_KM) && fitsNow(p),
        );
        const top = cands.reduce(
          (m, p) => Math.max(m, bestRankLangCount(p.bestRank)),
          -1,
        );
        pool = cands.filter((p) => bestRankLangCount(p.bestRank) === top);
        const nearIn = pool.filter((p) => kmFromCenter(p) <= NEAR_KM);
        if (nearIn.length) pool = nearIn;
      } else {
        const nearLeft = remaining.some((p) => kmFromCenter(p) <= NEAR_KM);
        pool = remaining.filter(
          (p) => (!nearLeft || kmFromCenter(p) <= NEAR_KM) && fitsNow(p),
        );
      }
      if (!pool.length) break;
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
      // 점심 = 식당에 도착하는 시각이 창(11:00~14:00) 안이면 지금 먹는다.
      //   긴 볼거리가 창을 통째로 삼켜 점심이 2시 넘게 밀리던 것을 막는다(베스트 분기 전용).
      if (!lunchDone && bestMode) {
        const cand = pickMealPriority(
          [cursor ?? center],
          band.min,
          band.cap,
          true,
        );
        if (cand) {
          const eatAt = acc + moveMin(cand);
          if (eatAt >= LUNCH_FROM && eatAt <= LUNCH_BY) takeLunch();
        }
      }
      if (!lunchDone && !bestMode && acc >= LUNCH_FROM) takeLunch();
      const dur = stayMin(pick);
      // 이동한 만큼 늦게 도착한다(옵션 꺼져 있으면 0 = 기존과 동일).
      const arriveAt = acc + moveMin(pick);
      place(pick, false, dur, arriveAt);
      // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 그 곳이 점심창(11:00~14:00)을 통째로 덮으면 거기서 먹은 것으로 보고 점심을 따로 넣지 않는다(사람은 그 시간 전에도 넘겨서도 잘 안 먹는다).
      if (
        !lunchDone &&
        bestMode &&
        arriveAt <= LUNCH_FROM &&
        arriveAt + dur >= LUNCH_BY
      )
        lunchDone = true;
      if (!lunchDone && dur >= LONG_STAY_MIN) lunchDone = true;
      remaining.splice(remaining.indexOf(pick), 1);
    }
    if (!lunchDone) takeLunch();
    if (hasRest) {
      const dinner = pickMealPriority([cursor ?? center], band.min, band.cap);
      // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 저녁 = 무조건 마지막 슬롯(19:00 전이면 19:00), 손님 종료시각과 무관하게 남겨 둔다 · 이동시간은 켜졌을 때만 더한다.
      if (dinner)
        place(
          dinner,
          true,
          mealDuration,
          Math.max(acc + moveMin(dinner), DINNER_FROM),
        );
    }
    let prev: LatLng = center;
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
        slot_min: slotDurations[i],
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
