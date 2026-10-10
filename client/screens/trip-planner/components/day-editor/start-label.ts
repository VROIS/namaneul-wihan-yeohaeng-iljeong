import type { DayAccommodation, DayPlan } from "@/types/trip";
import { isCityCenterName } from "@/lib/display-city-name";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { finalOfDay } from "./edit-layout";

// 출발지 글자 = 실제 고른 숙소 이름, 없으면 "도심 출발" (Day 줄 · 수정 화면 공용 1벌)
export function startLabel(
  day: DayPlan,
  dayAccommodations: DayAccommodation[],
  t: PlannerApi["t"],
): string {
  if (finalOfDay(day.places)) return t("trip.departureFromVenue");
  const dayAccom = dayAccommodations.find((a) => a.day === day.day);
  if (dayAccom?.name && !isCityCenterName(dayAccom.name)) return dayAccom.name;
  const general = day.accommodation;
  if (general?.name && !isCityCenterName(general.name)) return general.name;
  return t("trip.departureFromCenter");
}
