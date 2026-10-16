import { useState } from "react";
import { Platform, Share } from "react-native";
import { Itinerary } from "@/types/trip";
import { getApiUrl } from "@/lib/query-client";
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

      const url = `${getApiUrl()}/shared/itinerary/${id}`;

      if (Platform.OS === "web") {
        const isMobileWeb =
          typeof navigator !== "undefined" &&
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
        if (isMobileWeb && (navigator as any).share) {
          try {
            await (navigator as any).share({ title: itinerary.title, url });
          } catch {}
        } else if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(url);
          if (typeof window !== "undefined") {
            window.alert(t("trip.shareLinkCopied"));
          }
        }
      } else {
        await Share.share(
          Platform.OS === "ios"
            ? { url, message: itinerary.title }
            : { message: `${itinerary.title}\n${url}` },
        );
      }
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
