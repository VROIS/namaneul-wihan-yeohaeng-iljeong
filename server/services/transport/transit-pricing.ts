// 대중교통·우버X·우버블랙 요금 계산 = transport-pricing-service 분리(2026-07-16 §0 슬림화, 순수 이동)

import { PARIS_TRANSIT_FARES, UBER_PARIS_FARES } from "./constants";
import type { UberBlackComparison } from "./constants";
import { round2 } from "./guide-pricing";

// ===================================================================
// 대중교통 비용 계산
// ===================================================================

/**
 * 대중교통 1인 1일 비용 (최적 패스 자동 선택)
 */
export function calculateTransitPerPersonPerDay(
  dayCount: number,
  tripCount: number,
): {
  perPersonPerDay: number;
  method: string;
  details: string;
} {
  const singleFare = PARIS_TRANSIT_FARES.metro.single;
  const carnetFare = PARIS_TRANSIT_FARES.metro.carnet10 / 10;
  const navigoDay = PARIS_TRANSIT_FARES.metro.navigo_day;
  const navigoWeek = PARIS_TRANSIT_FARES.metro.navigo_week;

  const dailyIndividual = tripCount * singleFare;
  const dailyCarnet = tripCount * carnetFare;

  let perPersonPerDay: number;
  let method: string;
  let details: string;

  if (dayCount >= 5) {
    perPersonPerDay = round2(navigoWeek / dayCount);
    method = "Navigo 주간권";
    details = `€${navigoWeek}/주 ÷ ${dayCount}일 = €${perPersonPerDay}/일/인`;
  } else if (dailyIndividual > navigoDay) {
    perPersonPerDay = navigoDay;
    method = "Navigo 일일권";
    details = `Mobilis Zone 1-5: €${navigoDay}/일/인`;
  } else if (tripCount >= 5) {
    perPersonPerDay = round2(dailyCarnet);
    method = "t+ 카르네";
    details = `카르네 €1.69/회 × ${tripCount}회 = €${perPersonPerDay}/일/인`;
  } else {
    perPersonPerDay = round2(dailyIndividual);
    method = "t+ 개별";
    details = `€${singleFare}/회 × ${tripCount}회 = €${perPersonPerDay}/일/인`;
  }

  return { perPersonPerDay, method, details };
}

/**
 * UberX 1인 1일 비용 (Moderate에서 대중교통과 혼합)
 */
export function calculateUberXDailyPerPerson(
  tripCount: number,
  companionCount: number,
): {
  perPersonPerDay: number;
  farePerTrip: number;
  details: string;
} {
  const fare = UBER_PARIS_FARES.uberx;
  const avgKm = UBER_PARIS_FARES.avg_trip_km;
  const avgMin = UBER_PARIS_FARES.avg_trip_min;

  let farePerTrip = fare.base + avgKm * fare.perKm + avgMin * fare.perMin;
  farePerTrip = Math.max(farePerTrip, fare.min_fare);
  farePerTrip = round2(farePerTrip);

  // 우버는 차량 1대에 같이 탑승 → 총 요금을 인원으로 나눔
  const dailyTotal = round2(farePerTrip * tripCount);
  const perPersonPerDay = round2(dailyTotal / companionCount);

  return {
    perPersonPerDay,
    farePerTrip,
    details: `UberX €${farePerTrip}/회 × ${tripCount}회 ÷ ${companionCount}인 = €${perPersonPerDay}/일/인`,
  };
}

// ===================================================================
// 우버 블랙 시간제 비교 계산 (가이드와 동일 조건 비교)
// ===================================================================

/**
 * 우버블랙 시간제 요금 계산 (가이드와 공정 비교용)
 *
 * 💡 핵심 원칙:
 *   - 가이드처럼 하루 종일 사용 (가용시간 풀, 대기 포함)
 *   - 구간별 호출이 아니라, 시간제 대절 개념
 *   - 전체 가용시간(예: 09~21시=12시간) 동안:
 *     · 실제 이동 시간(driving) → 주행 요금 (km + min)
 *     · 대기 시간(waiting) → 대기 요금 (min 단위)
 *   - 센트 단위 정밀도 (€168.75)
 *   - 도시별 요금 적용 (현재: 파리, 향후 DB 확장)
 *
 * @param availableHours 사용자 가용시간 (startTime~endTime, 기본 8시간)
 * @param segments 실제 경로 데이터 (이동 거리/시간)
 * @param companionCount 인원수
 */
export function calculateUberBlackHourly(
  availableHours: number,
  segments: { distanceKm: number; durationMin: number }[],
  companionCount: number,
): UberBlackComparison {
  const fare = UBER_PARIS_FARES.black;

  // 실제 이동 거리/시간 합산
  let totalDrivingKm = 0;
  let totalDrivingMin = 0;
  for (const seg of segments) {
    totalDrivingKm += seg.distanceKm;
    totalDrivingMin += seg.durationMin;
  }

  // 전체 가용시간 (분)
  const totalAvailableMin = availableHours * 60;

  // 대기 시간 = 가용시간 - 실제 이동시간 (가이드처럼 기다리는 시간도 요금에 포함)
  const waitingMin = Math.max(0, totalAvailableMin - totalDrivingMin);

  // 우버블랙 시간제 요금:
  // = 기본료 (1회만)
  // + 주행 거리 요금 (실제 이동 km)
  // + 주행 시간 요금 (실제 이동 min)
  // + 대기 시간 요금 (대기 min × per-min 요금)
  //
  // ⚠️ 우버블랙은 대기시간도 분당 과금됨 (택시와 동일 원리)
  const drivingFare =
    totalDrivingKm * fare.perKm + totalDrivingMin * fare.perMin;
  const waitingFare = waitingMin * fare.perMin; // 대기 중에도 분당 과금
  const totalFare = round2(fare.base + drivingFare + waitingFare);

  // 최소 요금 적용
  const finalFare = Math.max(totalFare, fare.min_fare);
  const perPersonPerDay = round2(finalFare / companionCount);

  return {
    totalFare: round2(finalFare),
    perPersonPerDay,
    segmentCount: segments.length,
    totalDistanceKm: round2(totalDrivingKm),
    totalDurationMin: Math.round(totalAvailableMin), // 전체 가용시간 표시
  };
}

/**
 * @deprecated 구간별 합산 방식 → calculateUberBlackHourly 사용
 */
export function calculateUberBlackForRoutes(
  segments: { distanceKm: number; durationMin: number }[],
  companionCount: number,
): UberBlackComparison {
  // 기본 8시간으로 시간제 계산에 위임
  return calculateUberBlackHourly(8, segments, companionCount);
}
