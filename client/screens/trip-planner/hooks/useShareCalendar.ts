import { useState } from "react";
import { Itinerary } from "@/types/trip";
import { getApiUrl } from "@/lib/query-client";
import { shareLink } from "@/lib/shareLink";
import { openCalendar } from "@/lib/itinerary-calendar";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { ensureLoggedIn } from "./login-gate";

export function useShareCalendar({
  itinerary,
  currentItineraryId,
  handleSaveItinerary,
  t,
}: {
  itinerary: Itinerary | null;
  currentItineraryId: number | null;
  handleSaveItinerary: () => Promise<number | null | undefined>;
  t: (key: string, opts?: any) => string;
}) {
  const { requestLogin, isAuthed } = useMapToggle();
  // 어떤 동작이 진행 중인지 구분(2026-07-22 사장님 실기기 피드백 = 눌린 버튼만 선택색+스피너). null = 대기.
  const [sharingAction, setSharingAction] = useState<
    "share" | "calendar" | null
  >(null);

  const ensureItineraryId = async (): Promise<number | null> => {
    if (currentItineraryId) return currentItineraryId;
    return (await handleSaveItinerary()) ?? null;
  };

  const handleShareItinerary = async () => {
    if (!itinerary) return;
    if (!ensureLoggedIn(isAuthed, t, requestLogin)) return;

    setSharingAction("share");
    try {
      const id = await ensureItineraryId();
      if (!id) return; // 저장 실패 = 공유 중단.

      await shareLink(
        `${getApiUrl()}/shared/itinerary/${id}`,
        itinerary.title,
        t("trip.shareLinkCopied"),
      );
    } catch (error) {
      console.error("[TripPlanner] 공유 오류:", error);
    } finally {
      setSharingAction(null);
    }
  };

  const handleSaveCalendar = async () => {
    if (!itinerary) return;
    if (!ensureLoggedIn(isAuthed, t, requestLogin)) return;
    setSharingAction("calendar");
    try {
      const id = await ensureItineraryId();
      if (!id) return; // 저장 실패 = 캘린더 중단.
      const icsUrl = `${getApiUrl()}/api/itineraries/${id}/calendar.ics`;
      await openCalendar(itinerary, icsUrl);
    } catch (error) {
      console.error("[TripPlanner] 캘린더 저장 오류:", error);
    } finally {
      setSharingAction(null);
    }
  };

  return { sharingAction, handleShareItinerary, handleSaveCalendar };
}
