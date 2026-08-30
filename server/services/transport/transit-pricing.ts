import { PARIS_TRANSIT_FARES, UBER_PARIS_FARES } from "./constants";
import type { UberBlackComparison } from "./constants";
import { round2 } from "./guide-pricing";

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

  const dailyTotal = round2(farePerTrip * tripCount);
  const perPersonPerDay = round2(dailyTotal / companionCount);

  return {
    perPersonPerDay,
    farePerTrip,
    details: `UberX €${farePerTrip}/회 × ${tripCount}회 ÷ ${companionCount}인 = €${perPersonPerDay}/일/인`,
  };
}

export function calculateUberBlackHourly(
  availableHours: number,
  segments: { distanceKm: number; durationMin: number }[],
  companionCount: number,
): UberBlackComparison {
  const fare = UBER_PARIS_FARES.black;

  let totalDrivingKm = 0;
  let totalDrivingMin = 0;
  for (const seg of segments) {
    totalDrivingKm += seg.distanceKm;
    totalDrivingMin += seg.durationMin;
  }

  const totalAvailableMin = availableHours * 60;

  const waitingMin = Math.max(0, totalAvailableMin - totalDrivingMin);

  const drivingFare =
    totalDrivingKm * fare.perKm + totalDrivingMin * fare.perMin;
  const waitingFare = waitingMin * fare.perMin; // 대기 중에도 분당 과금
  const totalFare = round2(fare.base + drivingFare + waitingFare);

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

export function calculateUberBlackForRoutes(
  segments: { distanceKm: number; durationMin: number }[],
  companionCount: number,
): UberBlackComparison {
  return calculateUberBlackHourly(8, segments, companionCount);
}
