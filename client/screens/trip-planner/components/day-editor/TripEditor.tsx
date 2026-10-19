import React from "react";
import type { DayPlan } from "@/types/trip";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import DayEditor from "./DayEditor";
import { useTripEdit } from "./useTripEdit";

export default function TripEditor({
  planner,
  day,
}: {
  planner: PlannerApi;
  day: DayPlan;
}) {
  const ed = useTripEdit(planner, day);
  return <DayEditor key={day.day} planner={planner} day={day} ed={ed} />;
}
