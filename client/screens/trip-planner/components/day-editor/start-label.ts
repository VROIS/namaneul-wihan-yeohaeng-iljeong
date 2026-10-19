import type { DayAccommodation, DayPlan } from "@/types/trip";
import { isCityCenterName } from "@/lib/display-city-name";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { finalOfDay } from "./edit-layout";

type StartPoint =
  | { kind: "venue" }
  | { kind: "center" }
  | { kind: "place"; name: string };

function startPoint(
  day: DayPlan,
  dayAccommodations: DayAccommodation[],
): StartPoint {
  if (finalOfDay(day.places)) return { kind: "venue" };
  const dayAccom = dayAccommodations.find((a) => a.day === day.day);
  if (dayAccom?.name && !isCityCenterName(dayAccom.name))
    return { kind: "place", name: dayAccom.name };
  const general = day.accommodation;
  if (general?.name && !isCityCenterName(general.name))
    return { kind: "place", name: general.name };
  return { kind: "center" };
}

export function startLabel(
  day: DayPlan,
  dayAccommodations: DayAccommodation[],
  t: PlannerApi["t"],
): string {
  const p = startPoint(day, dayAccommodations);
  if (p.kind === "venue") return t("trip.departureFromVenue");
  if (p.kind === "place") return p.name;
  return t("trip.departureFromCenter");
}

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정 수정 출발 줄 = 숙소면 "{숙소 이름} 출발" · 도심이면 "{도시} 도심 출발" (정본 §)
export function editStartLabel(
  day: DayPlan,
  dayAccommodations: DayAccommodation[],
  city: string,
  t: PlannerApi["t"],
): string {
  const p = startPoint(day, dayAccommodations);
  if (p.kind === "venue") return t("trip.departureFromVenue");
  if (p.kind === "place") return t("trip.departureFromPlace", { name: p.name });
  return t("trip.departureFromCity", { city });
}
