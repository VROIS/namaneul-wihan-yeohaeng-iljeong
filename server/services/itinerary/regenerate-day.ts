// Day별 동선 재최적화(숙소 변경 시 호출) = itinerary-generator 분리(2026-07-15 §0 슬림화, 순수 이동)
import {
  calcTransitHaversine,
  haversineKm,
  pickTransitMode,
  estimateTransitCost,
} from "../agents/transit-haversine";
// ⚠️ 2026-07-04 사장님 SSOT = 숙소 재계산(regenerate)의 교통 판별·가격·표시 = 최초생성(pipeline-v3/ag4)과 동일 SSOT 재사용(§16 재발명금지).
//   = shouldApplyGuidePrice(이동+예산) 단일 판별 / calculateTransportPrice(가이드·대중교통 1인1일 SSOT) / calculateUberBlackHourly(가이드 비교값).
import {
  shouldApplyGuidePrice,
  calculateTransportPrice,
  calculateUberBlackHourly,
  guideCostForDay,
  buildDayConfig,
  round2,
  type GuidePriceResult,
  type TransitPriceResult,
} from "../transport-pricing-service";
import { DEFAULT_START_TIME, DEFAULT_END_TIME } from "./types";
import { getCompanionCount, calculateDayCount } from "./helpers";
import { optimizeDayRoute } from "./route-optimizer";

/**
 * Day별 동선 재최적화 (숙소 변경 시 호출)
 * - 기존 장소들을 유지하면서 숙소 기준으로 순서만 재배열
 * - 이동시간 재계산
 */
export async function regenerateDay(params: {
  day: number;
  accommodationCoords?: { lat: number; lng: number };
  places: any[];
  formData?: any;
}): Promise<{
  day: number;
  places: any[];
  departureTransit?: any;
  returnTransit?: any;
  transit?: any;
  // ⚠️ 2026-07-04 사장님 SSOT = 화면이 실제 읽는 가격·교통표시 = 반드시 반환(없으면 숙소 재계산해도 칩·가격 stale = 버그 미해결).
  dailyCost?: any;
  transportDisplay?: any;
}> {
  const { day, accommodationCoords, places, formData } = params;

  if (!places || places.length === 0) {
    return { day, places: [] };
  }

  // 동선 최적화 (숙소 기준 nearest-neighbor + 2-opt)
  const nonMealPlaces = places.filter((p: any) => !p.isMealSlot);
  const mealPlaces = places.filter((p: any) => p.isMealSlot);

  let optimized = nonMealPlaces;
  if (nonMealPlaces.length > 2 && accommodationCoords) {
    optimized = optimizeDayRoute(nonMealPlaces, accommodationCoords);
  }

  // 식사 슬롯을 원래 위치에 다시 삽입
  const reordered: any[] = [];
  let optIdx = 0;
  for (const p of places) {
    if (p.isMealSlot) {
      reordered.push(p);
    } else if (optIdx < optimized.length) {
      reordered.push(optimized[optIdx]);
      optIdx++;
    }
  }

  // ⚠️ 2026-07-04 사장님 SSOT = 가이드 판별 = shouldApplyGuidePrice(이동+예산) 단일 SSOT(옛 mobilityStyle 3분기 폐기).
  const isGuideDay = shouldApplyGuidePrice(formData?.mobilityStyle, formData?.travelStyle);
  // 🗑️ 2026-07-06 = travelMode/feMode(하루 전체 고정 mode) 완전삭제 §19 = MIX·DB-only 처럼 구간별 pickTransitMode(거리 1km)로 mode 결정(§16/§20) = mobilityStyle 편향(전부 도보) 근본제거.
  const companionCount = formData
    ? getCompanionCount(formData.companionType || "Solo")
    : 2;

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Google Routes API 폐기 = Haversine 자체 계산 (= 사용자 SSOT)
  // ⚠️ 2026-07-06 사장님 SSOT = 한 구간 계산 = MIX·DB-only 단일 SSOT(§16) = 거리(haversineKm)→pickTransitMode(1km 도보/초과 metro)→calcTransitHaversine(시간)→estimateTransitCost(구간 €3).
  //   center(숙소좌표) 전달 = DRIVE 도심/외곽 30·70km/h 분기. 가이드는 구간 cost 0(일 총합만), 대중교통은 구간 균일예상가.
  const center = accommodationCoords;
  const buildTransit = (from: { lat: number; lng: number }, fromName: string, to: { lat: number; lng: number }, toName: string) => {
    const km = round2(haversineKm(from.lat, from.lng, to.lat, to.lng));
    const { mode, calc } = pickTransitMode(km, isGuideDay);
    const tr = calcTransitHaversine({ ...from, name: fromName }, { ...to, name: toName }, calc, companionCount, center);
    const cost = isGuideDay ? 0 : estimateTransitCost(mode);
    return {
      from: fromName, to: toName,
      distance: Math.round(km * 1000),
      duration: tr.duration,
      durationText: `${tr.duration}분`,  // FE departure/return 폴백없이 읽음 = 필수
      mode,
      modeLabel: mode === 'walk' ? '도보' : mode === 'private_guide' ? '전용차량이동' : '지하철/버스',
      cost, costTotal: cost,
    };
  };

  // 숙소 → 첫 장소 (= 별도 필드, transits 배열엔 미포함). 숙소좌표 있을 때만.
  const departureTransit = accommodationCoords && reordered.length > 0
    ? buildTransit(accommodationCoords, "🏨 숙소", reordered[0], reordered[0].name)
    : undefined;

  // 장소 간 이동 = transits 배열 = n-1
  const transits: any[] = [];
  for (let i = 0; i < reordered.length - 1; i++) {
    transits.push(buildTransit(reordered[i], reordered[i].name, reordered[i + 1], reordered[i + 1].name));
  }

  // 마지막 장소 → 숙소 (= 별도 필드)
  const returnTransit = accommodationCoords && reordered.length > 0
    ? buildTransit(reordered[reordered.length - 1], reordered[reordered.length - 1].name, accommodationCoords, "🏨 숙소")
    : undefined;

  // 일 총합·우버비교용 = 전 구간(departure+between+return).
  const allTransits = [
    ...(departureTransit ? [departureTransit] : []),
    ...transits,
    ...(returnTransit ? [returnTransit] : []),
  ];

  // ⚠️ 2026-07-04 사장님 SSOT = 교통비·표시 = 최초생성(pipeline-v3:955~1066)과 동일 조립 = calculateTransportPrice 단일 SSOT(§16).
  //   옛 "구간 km × 정액" 합산 완전삭제(§0·§19). 가이드 하루요금·대중교통 하루요금 모두 이 함수가 1인1일로 계산.
  // ⚠️ 2026-07-04 사장님 SSOT = dayCount = 최초생성과 동일 계산(calculateDayCount) = startDate~endDate에서 도출.
  const dayCount = formData?.startDate && formData?.endDate
    ? calculateDayCount(formData.startDate, formData.endDate)
    : 1;
  // ⚠️ 2026-07-06 사장님 SSOT = 그 날 가용시각 = buildDayConfig 단일 SSOT(DB-only ag1 버퍼) = 최초생성과 동일 dayConfig(§16/§20).
  //   옛 formData 전체(버퍼 미반영) availableHours 폐기 §19 = 첫날/막날 가이드 요금 최초생성과 어긋나던 결함 근본해결.
  const dc = buildDayConfig(day, dayCount, formData?.startTime || DEFAULT_START_TIME, formData?.endTime || DEFAULT_END_TIME, DEFAULT_START_TIME, DEFAULT_END_TIME);
  const [sh, sm] = dc.startTime.split(":").map(Number);
  const [eh, em] = dc.endTime.split(":").map(Number);
  const availableHours = Math.max(4, round2((eh * 60 + em - (sh * 60 + sm)) / 60));

  // ⚠️ calculateTransportPrice = 대중교통 표시 부가정보(method/details/업셀·우버비교)의 SSOT. 교통비 '값'은 아래 가이드=날짜별/대중교통=구간합산으로 대체.
  const priceResult = await calculateTransportPrice({
    companionType: (formData?.companionType || "Couple") as any,
    companionCount,
    mobilityStyle: (formData?.mobilityStyle || "Moderate") as any,
    travelStyle: (formData?.travelStyle || "Reasonable") as any,
    availableHours,
    dayCount,
  });
  // ⚠️ 2026-07-06 사장님 SSOT = 1인 1일 교통비 = 가이드는 그 날 dayConfig 기준 재계산(guideCostForDay 공용, DB-only 동형), 대중교통은 구간별 합산(between).
  //   옛 가이드 flat(priceResult.perPersonPerDay = 전체 availableHours) 폐기 §19 = 첫날/막날 버퍼 미반영 결함 해소.
  const transportPerPersonPerDay = isGuideDay
    ? await guideCostForDay({ dayConfig: dc, companionType: (formData?.companionType || "Couple") as any, companionCount, mobilityStyle: (formData?.mobilityStyle || "Moderate") as any, travelStyle: (formData?.travelStyle || "Reasonable") as any, dayCount })
    : transits.reduce((s: number, t: any) => s + (t.cost || 0), 0);

  let transportDisplay: any;
  if (isGuideDay) {
    // 가이드: 구간별 비용 화면 숨김(일 총합만), 우버블랙 비교 조립(pipeline-v3:957~1013 정합)
    allTransits.forEach((t: any) => { t.cost = 0; t.costTotal = 0; });
    const routeSegments = allTransits.map((t: any) => {
      const hasRealData = t.distance > 0 && t.duration > 0;
      return {
        distanceKm: hasRealData ? round2((t.distance || 0) / 1000) : 3.0,
        durationMin: hasRealData ? (t.duration || 0) : 12,
      };
    });
    const uberBlackComp = routeSegments.length > 0
      ? calculateUberBlackHourly(availableHours, routeSegments, companionCount)
      : null;
    // KRW 필드는 제외 = 화면이 € 단독 표시(KRW 미참조 grep 0건) = 죽은 값 미복제(§0·§19). 환율 상수 재발명도 소멸(§16).
    transportDisplay = {
      category: "guide" as const,
      perPersonPerDay: transportPerPersonPerDay,
      uberBlackComparison: uberBlackComp ? {
        perPersonPerDay: uberBlackComp.perPersonPerDay,
        totalDistanceKm: uberBlackComp.totalDistanceKm,
        totalDurationMin: uberBlackComp.totalDurationMin,
      } : null,
      vehicleDescription: priceResult.category === "guide"
        ? (priceResult as GuidePriceResult).vehicleDescription : "전용 차량",
      notes: priceResult.notes || [],
    };
  } else {
    // 대중교통: 구간 상세 유지 + 가이드 업셀(클릭 가능) 조립(pipeline-v3:1014~1046 정합)
    const guideUpsell = priceResult.category === "transit"
      ? (priceResult as TransitPriceResult).guideUpsell : null;
    transportDisplay = {
      category: "transit" as const,
      perPersonPerDay: transportPerPersonPerDay,
      method: priceResult.category === "transit"
        ? (priceResult as TransitPriceResult).method : "대중교통",
      details: priceResult.category === "transit"
        ? (priceResult as TransitPriceResult).details : "",
      guideUpsell: guideUpsell ? {
        perPersonPerDay: guideUpsell.perPersonPerDay,
        vehicleDescription: guideUpsell.vehicleDescription,
        clickable: true,
      } : null,
      notes: priceResult.notes || [],
    };
  }

  // 식사·입장료 = 장소 집합 불변(순서만 바뀜) → 재계산 안전. 화면(dc.breakdown) 구조 그대로(pipeline-v3:1052~1065 정합).
  const mealEur = reordered.reduce((s: number, p: any) => s + (p.isMealSlot && p.mealPrice ? p.mealPrice : 0), 0);
  const entranceEur = reordered.reduce(
    (s: number, p: any) => s + (!p.isMealSlot && typeof p.estimatedPriceEur === "number" && p.estimatedPriceEur > 0 && p.estimatedPriceEur < 500 ? p.estimatedPriceEur : 0),
    0,
  );
  const perPersonEur = round2(mealEur + entranceEur + transportPerPersonPerDay);

  return {
    day,
    places: reordered,
    departureTransit,
    returnTransit,
    // ⚠️ 2026-07-06 = transits 배열(FE) = place 간(between)만 = n-1(MIX·DB-only 동형). departure/return = 별도 필드(위). 옛 allTransits(departure/return 포함 n+1) 폐기 §19.
    transit: {
      transits,
      totalDuration: transits.reduce((sum: number, t: any) => sum + t.duration, 0),
      totalCost: transits.reduce((sum: number, t: any) => sum + t.costTotal, 0),
      totalDistanceKm: round2(transits.reduce((sum: number, t: any) => sum + ((t.distance || 0) / 1000), 0)),
    },
    // ⚠️ 화면(요약헤더·일별카드)이 실제 읽는 두 필드 = 반드시 반환(없으면 숙소 재계산해도 가격·가이드칩 stale = 버그 미해결). KRW 미참조라 EUR만.
    dailyCost: {
      perPersonEur,
      breakdown: { mealEur, entranceEur, transportEur: transportPerPersonPerDay },
    },
    transportDisplay,
  };
}
