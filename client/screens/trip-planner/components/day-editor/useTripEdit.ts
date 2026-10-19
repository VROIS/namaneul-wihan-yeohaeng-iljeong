import { useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { apiRequest } from "@/lib/query-client";
import type { DayPlan } from "@/types/trip";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import {
  MAX_END_MIN,
  MIN_STAY_MIN,
  layoutDay,
  placesForServer,
  finalOfDay,
  slotsOfDay,
  type EditSlot,
} from "./edit-layout";
import { moveMult, toHm, toMin } from "@shared/day-retime";

const anchorOf = (d: DayPlan, accs: PlannerApi["dayAccommodations"]) => {
  const f = finalOfDay(d.places);
  if (f) return { lat: f.lat, lng: f.lng };
  const picked = accs.find((a) => a.day === d.day)?.coords;
  const c = picked ?? d.accommodation?.coords;
  return c ?? { lat: d.places[0]?.lat ?? 0, lng: d.places[0]?.lng ?? 0 };
};

type FinalItem = { id: string; stay: number } | { meal: number };

type DayDraft = { slots: EditSlot[]; startMin: number; endMin: number };

const draftOf = (day: DayPlan): DayDraft => {
  const final = finalOfDay(day.places);
  return {
    slots: slotsOfDay(day.places),
    startMin: toMin(day.startTime || "09:00"),
    endMin: toMin(final ? final.startTime : day.endTime || "21:00"),
  };
};

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정 수정 = 여러 날을 오가며 한 벌로 수정(날을 바꿔도 변경 유지) · 임시 보관함 = 모든 날 공용(지운 장소가 남아 있다가 다른 날 맨 위에 끼워 넣음) · 완료 = 같은 여정 아이디에 최종본 덮어쓰기(DB 여정 = 엔진을 한 번 더 = 활동·식사 칸 배치 그대로 식당만 새로 · MIX = 바뀐 날만 순서·시간 다시) · 보관함에 남은 장소는 여정에서 빠짐 (정본 §)
export function useTripEdit(planner: PlannerApi, day: DayPlan) {
  const {
    itinerary,
    setItinerary,
    dayAccommodations,
    setEditingDay,
    currentItineraryId,
    setCurrentItineraryId,
    t,
    i18n,
  } = planner;
  const [drafts, setDrafts] = useState<Record<number, DayDraft>>({});
  const [bucket, setBucket] = useState<EditSlot[]>([]);
  const [saving, setSaving] = useState(false);

  const baseDrafts = useMemo(
    () =>
      Object.fromEntries(
        (itinerary?.days ?? []).map((d) => [d.day, draftOf(d)]),
      ) as Record<number, DayDraft>,
    [itinerary],
  );
  const draft = drafts[day.day] ?? baseDrafts[day.day] ?? draftOf(day);
  const { slots, startMin, endMin } = draft;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const patchDraft = (fn: (d: DayDraft) => DayDraft) =>
    setDrafts((prev) => ({
      ...prev,
      [day.day]: fn(prev[day.day] ?? baseDrafts[day.day] ?? draftOf(day)),
    }));
  const setSlots = (fn: (s: EditSlot[]) => EditSlot[]) =>
    patchDraft((d) => ({ ...d, slots: fn(d.slots) }));

  const final = useMemo(() => finalOfDay(day.places), [day.places]);
  const anchor = useMemo(
    () => anchorOf(day, dayAccommodations),
    [day, dayAccommodations],
  );

  const mult = moveMult(itinerary?.metadata?.transportCategory === "guide");
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
    setBucket((prev) => [...prev, item]);
  };
  const restoreAt = (j: number) => {
    const item = bucket[j];
    if (!item) return;
    setBucket((prev) => prev.filter((_, k) => k !== j));
    setSlots((prev) => [item, ...prev]);
  };
  const moveSlot = (from: number, to: number) =>
    setSlots((prev) => {
      const a = [...prev];
      const [s] = a.splice(from, 1);
      a.splice(to, 0, s);
      return a;
    });
  const finalLen = final ? toMin(final.endTime) - toMin(final.startTime) : 0;
  const shiftWindow = (base: { start: number; end: number }, delta: number) => {
    const latest = Math.max(0, MAX_END_MIN - finalLen - base.end);
    const d = Math.min(Math.max(delta, -base.start), latest);
    patchDraft((x) => ({
      ...x,
      startMin: base.start + d,
      endMin: base.end + d,
    }));
    return d;
  };

  const saveDay = async (d: DayPlan, x: DayDraft) => {
    const f = finalOfDay(d.places);
    const time = { startTime: toHm(x.startMin), endTime: toHm(x.endMin) };
    if (!x.slots.length && !f)
      return {
        places: [],
        transit: undefined,
        departureTransit: undefined,
        returnTransit: undefined,
        dailyCost: undefined,
        transportDisplay: undefined,
        ...time,
      };
    const at = anchorOf(d, dayAccommodations);
    const lay = layoutDay(x.slots, at, x.startMin, x.endMin, mult, f);
    const res = await apiRequest("POST", "/api/routes/regenerate-day", {
      day: d.day,
      accommodationCoords: at,
      places: placesForServer(
        x.slots,
        lay.starts,
        f ? { ...f, startTime: toHm(x.endMin) } : null,
      ),
      formData: {
        travelStyle: itinerary!.travelStyle,
        mobilityStyle: itinerary!.mobilityStyle,
        companionType: itinerary!.companionType,
        startDate: itinerary!.startDate,
        endDate: itinerary!.endDate,
        ...time,
      },
      keepOrder: true,
    });
    const r = await res.json();
    return {
      places: r.places,
      departureTransit: r.departureTransit,
      returnTransit: r.returnTransit,
      transit: r.transit,
      dailyCost: r.dailyCost,
      transportDisplay: r.transportDisplay,
      ...time,
    };
  };

  const finalize = async () => {
    if (!itinerary) return;
    setSaving(true);
    try {
      const finalDays = itinerary.days.map((d) => {
        const x = drafts[d.day] ?? baseDrafts[d.day];
        return {
          items: x.slots.map(
            (s): FinalItem =>
              s.place.isMealSlot
                ? { meal: s.stay }
                : { id: String(s.place.id), stay: s.stay },
          ),
          startTime: toHm(x.startMin),
          endTime: toHm(x.endMin),
          anchor: anchorOf(d, dayAccommodations),
        };
      });
      const res = await apiRequest("POST", "/api/routes/generate", {
        destination: itinerary.destination,
        startDate: itinerary.startDate,
        endDate: itinerary.endDate,
        travelStyle: itinerary.travelStyle,
        mobilityStyle: itinerary.mobilityStyle,
        companionType: itinerary.companionType,
        companionCount: itinerary.companionCount,
        travelPace: itinerary.metadata?.travelPace,
        language: i18n.language || "ko",
        itineraryId: currentItineraryId,
        finalDays,
        ...(currentItineraryId
          ? {}
          : { baseItinerary: { ...itinerary, days: undefined } }),
      });
      const r = await res.json();
      setItinerary((prev) =>
        prev ? { ...prev, days: r.days, metadata: r.metadata } : prev,
      );
      if (r.itineraryId) setCurrentItineraryId(r.itineraryId);
      setEditingDay(null);
    } catch (e) {
      console.error("[TripPlanner] 여정 수정 완료 실패:", e);
      Alert.alert(t("common.notice"), t("trip.editFailed"));
    } finally {
      setSaving(false);
    }
  };

  const commit = async () => {
    if (saving || !itinerary) return;
    const source = itinerary.metadata?._sourceMode;
    const fromDb =
      (source === "db-only" || source === "best") &&
      itinerary.days.every((d) => !finalOfDay(d.places));
    if (fromDb) return finalize();
    setSaving(true);
    try {
      const patches: Record<number, Record<string, unknown>> = {};
      await Promise.all(
        itinerary.days.map(async (d) => {
          const x = drafts[d.day];
          if (x) patches[d.day] = await saveDay(d, x);
        }),
      );
      setItinerary((prev) =>
        prev
          ? {
              ...prev,
              days: prev.days.map((d) =>
                patches[d.day] ? { ...d, ...patches[d.day] } : d,
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

  const ready = !!itinerary?.days.every((d) =>
    (drafts[d.day] ?? baseDrafts[d.day]).slots.some((s) => !s.place.isMealSlot),
  );

  return {
    ready,
    slots,
    final,
    finalLen,
    slotsRef,
    removed: bucket,
    startMin,
    endMin,
    layout,
    saving,
    setStay,
    removeAt,
    restoreAt,
    moveSlot,
    shiftWindow,
    commit,
    cancel: () => setEditingDay(null),
  };
}

export type TripEditApi = ReturnType<typeof useTripEdit>;
