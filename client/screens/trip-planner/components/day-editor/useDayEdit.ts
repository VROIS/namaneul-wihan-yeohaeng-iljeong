import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { apiRequest } from "@/lib/query-client";
import type { DayPlan } from "@/types/trip";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import {
  MAX_END_MIN,
  MIN_START_MIN,
  MIN_STAY_MIN,
  MIN_WINDOW_MIN,
  layoutDay,
  placesForServer,
  finalOfDay,
  slotsOfDay,
  toHm,
  toMin,
  type EditSlot,
} from "./edit-layout";

// ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 여정 수정 = 길이 · 삭제 · 순서 · 출발/끝 시각만, 날마다 따로 (정본 §)
export function useDayEdit(planner: PlannerApi, day: DayPlan) {
  const { itinerary, setItinerary, dayAccommodations, setEditingDay, t } =
    planner;
  const [slots, setSlots] = useState<EditSlot[]>(() => slotsOfDay(day.places));
  const [removed, setRemoved] = useState<EditSlot[]>([]);
  const [startMin, setStartMinRaw] = useState(toMin(day.startTime || "09:00"));
  const final = useMemo(() => finalOfDay(day.places), [day.places]);
  const [endMin, setEndMinRaw] = useState(
    toMin(final ? final.startTime : day.endTime || "21:00"),
  );
  const [saving, setSaving] = useState(false);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // 숙소를 바꾸면(기존 흐름이 이 날 슬롯을 새로 돌려준다) 그 날 값으로 다시 시작한다.
  useEffect(() => {
    setSlots(slotsOfDay(day.places));
    setRemoved([]);
  }, [day.places]);

  const anchor = useMemo(() => {
    if (final) return { lat: final.lat, lng: final.lng };
    const picked = dayAccommodations.find((a) => a.day === day.day)?.coords;
    const c = picked ?? day.accommodation?.coords;
    return c ?? { lat: day.places[0]?.lat ?? 0, lng: day.places[0]?.lng ?? 0 };
  }, [dayAccommodations, day, final]);

  const mult = itinerary?.metadata?.transportCategory === "guide" ? 1.5 : 2;
  const layout = useMemo(
    () => layoutDay(slots, anchor, startMin, endMin, mult, final),
    [slots, anchor, startMin, endMin, mult, final],
  );

  const setStay = (i: number, stay: number) =>
    setSlots((prev) =>
      prev.map((s, k) =>
        k === i ? { ...s, stay: Math.max(MIN_STAY_MIN, stay) } : s,
      ),
    );
  const removeAt = (i: number) => {
    const item = slotsRef.current[i];
    if (!item) return;
    setSlots((prev) => prev.filter((_, k) => k !== i));
    setRemoved((prev) => [...prev, item]);
  };
  const restoreAt = (j: number) => {
    const item = removed[j];
    if (!item) return;
    setRemoved((prev) => prev.filter((_, k) => k !== j));
    setSlots((prev) => [...prev, item]);
  };
  const moveSlot = (from: number, to: number) =>
    setSlots((prev) => {
      const a = [...prev];
      const [s] = a.splice(from, 1);
      a.splice(to, 0, s);
      return a;
    });
  const setStartMin = (m: number) =>
    setStartMinRaw(
      Math.min(Math.max(m, MIN_START_MIN), endMin - MIN_WINDOW_MIN),
    );
  const setEndMin = (m: number) =>
    setEndMinRaw(Math.min(Math.max(m, startMin + MIN_WINDOW_MIN), MAX_END_MIN));

  const commit = async () => {
    if (saving || !itinerary) return;
    setSaving(true);
    try {
      const time = { startTime: toHm(startMin), endTime: toHm(endMin) };
      let patch: Record<string, unknown> = {
        places: [],
        transit: undefined,
        departureTransit: undefined,
        returnTransit: undefined,
        dailyCost: undefined,
        transportDisplay: undefined,
      };
      if (slots.length || final) {
        const res = await apiRequest("POST", "/api/routes/regenerate-day", {
          day: day.day,
          accommodationCoords: anchor,
          places: placesForServer(
            slots,
            layout.starts,
            final ? { ...final, startTime: toHm(endMin) } : null,
          ),
          formData: {
            travelStyle: itinerary.travelStyle,
            mobilityStyle: itinerary.mobilityStyle,
            companionType: itinerary.companionType,
            startDate: itinerary.startDate,
            endDate: itinerary.endDate,
            ...time,
          },
          keepOrder: true,
        });
        const r = await res.json();
        patch = {
          places: r.places,
          departureTransit: r.departureTransit,
          returnTransit: r.returnTransit,
          transit: r.transit,
          dailyCost: r.dailyCost,
          transportDisplay: r.transportDisplay,
        };
      }
      setItinerary((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((d) =>
                d.day === day.day ? { ...d, ...patch, ...time } : d,
              ),
            }
          : prev,
      );
      setEditingDay(null);
    } catch (e) {
      console.error("[TripPlanner] 여정 수정 저장 실패:", e);
      Alert.alert(t("common.notice"), t("trip.editFailed"));
    } finally {
      setSaving(false);
    }
  };

  return {
    slots,
    final,
    slotsRef,
    removed,
    startMin,
    endMin,
    layout,
    saving,
    setStay,
    removeAt,
    restoreAt,
    moveSlot,
    setStartMin,
    setEndMin,
    commit,
    cancel: () => setEditingDay(null),
  };
}
