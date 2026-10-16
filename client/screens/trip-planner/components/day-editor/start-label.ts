import type { DayAccommodation, DayPlan } from "@/types/trip";
import { isCityCenterName } from "@/lib/display-city-name";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { finalOfDay } from "./edit-layout";

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
