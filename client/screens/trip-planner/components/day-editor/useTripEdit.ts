import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  PICKED_LUNCH_SKIP_STAY,
  PICKED_MEAL_MIN,
  planPickedDay,
  type PickedLayoutItem,
} from "@shared/day-fill";
import type { BestListPlace } from "../../hooks/useBestList";
import { addDays } from "../../utils";

const anchorOf = (d: DayPlan, accs: PlannerApi["dayAccommodations"]) => {
  const f = finalOfDay(d.places);
  if (f) return { lat: f.lat, lng: f.lng };
  const picked = accs.find((a) => a.day === d.day)?.coords;
  const c = picked ?? d.accommodation?.coords;
  return c ?? { lat: d.places[0]?.lat ?? 0, lng: d.places[0]?.lng ?? 0 };
};

// 인기 명소 여정 = slots 에 활동 + 점심 칸(자리 고정) · 저녁 칸은 늘 마지막이라 따로
type DayDraft = {
  slots: EditSlot[];
  startMin: number;
  endMin: number;
  dinner?: EditSlot | null;
};
type DayView = {
  slots: EditSlot[];
  starts: number[];
  moves: number[];
  lastEnd: number;
  finalMove: number;
  arrival: number;
};

const idOf = (s: EditSlot) => String(s.place.id);
const isMeal = (s: EditSlot) => s.place.isMealSlot === true;
const mealSlot = (kind: "lunch" | "dinner", stay: number): EditSlot => ({
  place: {
    id: `meal-${kind}`,
    name: "",
    isMealSlot: true,
    mealType: kind,
    seedCategory: "restaurant",
  },
  stay,
});

// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 여정 수정 = 여러 날을 오가며 한 벌로 수정 · 인기 명소 여정 = 점심·저녁 칸은 자리 고정(shared/day-fill) · 길이만 30분 단위로 늘리고 줄임 · 위 보관함 = 그 여정 도시 목록 전체 중 여정에 안 든 것(순위순) 앞에 뺀 것(맨 앞) = 삭제 없음(옮길 뿐) · 끌어 넣기 = 어느 슬롯 사이든 그 자리 · 완료 = 같은 여정 아이디에 최종본 덮어쓰기(들어온 버튼 그대로 = 인기 명소 / 내 취향 = 배치 그대로 식당만 새로 · MIX = 바뀐 날만) (정본 §)
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
  const autoMeals = itinerary?.metadata?._sourceMode === "best";
  const mult = moveMult(itinerary?.metadata?.transportCategory === "guide");
  const draftOf = (d: DayPlan): DayDraft => {
    const final = finalOfDay(d.places);
    const all = slotsOfDay(d.places);
    const startMin = toMin(d.startTime || "09:00");
    const endMin = toMin(final ? final.startTime : d.endTime || "21:00");
    if (!autoMeals) return { slots: all, startMin, endMin };
    const acts = all.filter((s) => !isMeal(s));
    const lastAct = all.reduce((k, s, i) => (isMeal(s) ? k : i), -1);
    const lunchAt = all.findIndex((s, i) => isMeal(s) && i < lastAct);
    const dinner = all.find((s, i) => isMeal(s) && i > lastAct) ?? null;
    if (lunchAt >= 0)
      return {
        slots: all.filter((s, i) => !isMeal(s) || i === lunchAt),
        startMin,
        endMin,
        dinner,
      };
    return {
      slots: withLunch(acts, startMin, endMin, anchorOf(d, dayAccommodations)),
      startMin,
      endMin,
      dinner,
    };
  };
  // 인기 명소 여정의 점심 칸은 늘 편집 순서 안에 하나 = 없던 날도 계산이 정하는 자리에 두고 그 뒤로는 고정(긴 장소 때문에 빠진 날도 자리는 지킨다)
  const withLunch = (
    slots: EditSlot[],
    startMin: number,
    endMin: number,
    center: { lat: number; lng: number },
  ): EditSlot[] => {
    if (!autoMeals || slots.some(isMeal) || !slots.length) return slots;
    const plan = planPickedDay(
      slots.map((s) => ({
        lat: s.place.lat,
        lng: s.place.lng,
        stay: Math.min(s.stay, PICKED_LUNCH_SKIP_STAY - 1),
      })),
      { startMin, endMin },
      { center, mult },
    );
    const out = [...slots];
    out.splice(plan.lunchAfter ?? 1, 0, mealSlot("lunch", PICKED_MEAL_MIN));
    return out;
  };
  const [drafts, setDrafts] = useState<Record<number, DayDraft>>({});
  const [bucket, setBucket] = useState<EditSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState(true);

  const baseDrafts = useMemo(
    () =>
      Object.fromEntries(
        (itinerary?.days ?? []).map((d) => [d.day, draftOf(d)]),
      ) as Record<number, DayDraft>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itinerary],
  );
  const draftFor = (d: DayPlan) =>
    drafts[d.day] ?? baseDrafts[d.day] ?? draftOf(d);
  const draft = draftFor(day);
  const { slots: acts, startMin, endMin } = draft;
  const actsRef = useRef(acts);
  actsRef.current = acts;
  const patchDraft = (fn: (d: DayDraft) => DayDraft) =>
    setDrafts((prev) => ({
      ...prev,
      [day.day]: fn(prev[day.day] ?? baseDrafts[day.day] ?? draftOf(day)),
    }));
  const setActs = (fn: (s: EditSlot[]) => EditSlot[]) =>
    patchDraft((d) => ({
      ...d,
      slots: withLunch(
        fn(d.slots),
        d.startMin,
        d.endMin,
        anchorOf(day, dayAccommodations),
      ),
    }));

  const final = useMemo(() => finalOfDay(day.places), [day.places]);

  const inTrip = useMemo(() => {
    const s = new Set<string>();
    for (const d of itinerary?.days ?? [])
      (drafts[d.day] ?? baseDrafts[d.day])?.slots.forEach((x) =>
        s.add(idOf(x)),
      );
    return s;
  }, [itinerary, drafts, baseDrafts]);
  // ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 보관함 후보 = 그 여정 도시의 인기 명소 목록 전체(목록 화면과 같은 3일치 = 여정 시작일부터 3일 · 여정 날 수와 상관없음) − 여정에 든 것 · 수정 화면을 열 때마다 그 여정 거점 번호로 받는다 · 무료 (정본 §2026-10-26)
  const [listed, setListed] = useState<BestListPlace[]>([]);
  useEffect(() => {
    if (!autoMeals || !itinerary) return;
    let alive = true;
    apiRequest("POST", "/api/best/list", {
      cityId: (itinerary as any).cityId,
      destination: itinerary.destination,
      startDate: itinerary.startDate,
      endDate: addDays(itinerary.startDate, 2),
      travelStyle: itinerary.travelStyle,
      mobilityStyle: itinerary.mobilityStyle,
      language: i18n.language || "ko",
    })
      .then((r) => r.json())
      .then((j) => alive && setListed(j.places ?? []))
      .catch((e) => console.error("[TripPlanner] 보관함 후보 실패:", e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMeals, currentItineraryId]);
  const candidates = useMemo((): EditSlot[] => {
    const inBucket = new Set(bucket.map(idOf));
    return listed
      .filter((p) => !inTrip.has(`db-${p.id}`) && !inBucket.has(`db-${p.id}`))
      .map((p) => ({
        place: {
          id: `db-${p.id}`,
          name: p.nameEn,
          nameEn: p.nameEn,
          nameLocal: p.nameLocal,
          image: p.image,
          lat: p.lat,
          lng: p.lng,
          seedCategory: p.seedCategory,
          userRatingCount: p.userRatingCount,
        },
        stay: p.stayMin,
      }));
  }, [listed, inTrip, bucket]);
  const tray = useMemo(() => [...bucket, ...candidates], [bucket, candidates]);

  const viewOf = (x: DayDraft, d: DayPlan): DayView => {
    const at = anchorOf(d, dayAccommodations);
    const f = finalOfDay(d.places);
    if (!autoMeals) {
      const lay = layoutDay(x.slots, at, x.startMin, x.endMin, mult, f);
      return { slots: x.slots, ...lay };
    }
    const acts = x.slots.filter((s) => !isMeal(s));
    const li = x.slots.findIndex(isMeal);
    const lunch = li >= 0 ? x.slots[li] : null;
    const plan = planPickedDay(
      acts.map((s) => ({
        lat: s.place.lat,
        lng: s.place.lng,
        stay: s.stay,
        slot: s,
      })),
      { startMin: x.startMin, endMin: x.endMin },
      { center: at, mult },
      {
        lunchAfter: lunch ? li : null,
        mealMin: { lunch: lunch?.stay, dinner: x.dinner?.stay },
      },
    );
    // ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 식사 칸 종류 = 시간표 자리대로(맨 마지막 = 저녁) · 서버 칸이 들고 온 종류로 글자를 찍지 않는다 (정본 §2026-10-26)
    const meal = (kind: "lunch" | "dinner", stay: number): EditSlot => {
      const own = kind === "lunch" ? lunch : x.dinner;
      return own
        ? { ...own, place: { ...own.place, mealType: kind }, stay }
        : mealSlot(kind, stay);
    };
    const slots = plan.items.map(
      (it): EditSlot =>
        it.kind === "act" ? it.place.slot : meal(it.kind, it.stay),
    );
    const last = plan.items[plan.items.length - 1];
    const lastEnd = last ? last.start + last.stay : x.startMin;
    return {
      slots,
      starts: plan.items.map((it) => it.start),
      moves: plan.items.map((it) => it.move),
      lastEnd,
      finalMove: plan.end - lastEnd,
      arrival: 0,
    };
  };
  const view = useMemo(
    () => viewOf(draft, day),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, day, dayAccommodations, mult, autoMeals],
  );

  const setStay = (id: string, stay: number) => {
    const v = Math.max(MIN_STAY_MIN, stay);
    const dinner = view.slots.find((s) => idOf(s) === id && isMeal(s));
    if (autoMeals && dinner?.place.mealType === "dinner") {
      patchDraft((d) => ({ ...d, dinner: { ...dinner, stay: v } }));
      return;
    }
    setActs((prev) =>
      prev.map((s) => (idOf(s) === id ? { ...s, stay: v } : s)),
    );
  };
  const removeById = (id: string) => {
    const item = actsRef.current.find((s) => idOf(s) === id);
    if (!item || isMeal(item)) return;
    setActs((prev) => prev.filter((s) => idOf(s) !== id));
    setBucket((prev) => [item, ...prev.filter((b) => idOf(b) !== id)]);
  };
  const moveSlot = (from: number, to: number) =>
    setActs((prev) => {
      const a = [...prev];
      const [s] = a.splice(from, 1);
      a.splice(to, 0, s);
      return a;
    });
  const placeAt = (index: number, slot: EditSlot) =>
    setActs((prev) => {
      const a = prev.filter((s) => idOf(s) !== idOf(slot));
      a.splice(Math.max(0, Math.min(index, a.length)), 0, slot);
      return a;
    });
  const takeOut = (id: string) =>
    setActs((prev) => prev.filter((s) => idOf(s) !== id));
  const dropIn = (id: string) =>
    setBucket((prev) => prev.filter((b) => idOf(b) !== id));

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
        const x = draftFor(d);
        return {
          items: viewOf(x, d).slots.map(
            (s): PickedLayoutItem =>
              s.place.isMealSlot
                ? { meal: s.stay, kind: s.place.mealType }
                : { id: idOf(s), stay: s.stay },
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
        sourceMode: itinerary.metadata?._sourceMode,
        vibes: (itinerary.vibeWeights ?? []).map((v) => v.vibe),
        curationFocus: itinerary.metadata?.curationFocus,
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
    draftFor(d).slots.some((s) => !isMeal(s)),
  );

  return {
    ready,
    autoMeals,
    slots: view.slots,
    acts,
    actsRef,
    tray,
    final,
    finalLen,
    startMin,
    endMin,
    layout: view,
    saving,
    hint,
    hideHint: () => setHint(false),
    setStay,
    removeById,
    moveSlot,
    placeAt,
    takeOut,
    dropIn,
    shiftWindow,
    commit,
    cancel: () => setEditingDay(null),
  };
}

export type TripEditApi = ReturnType<typeof useTripEdit>;
