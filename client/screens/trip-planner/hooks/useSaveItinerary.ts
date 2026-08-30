import { useState, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { Itinerary, TripFormData, DayAccommodation } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { ensureLoggedIn } from "./login-gate";

export function useSaveItinerary({
  itinerary,
  dayAccommodations,
  aiOpinionData,
  formData,
  currentItineraryId,
  setCurrentItineraryId,
  t,
  i18n,
}: {
  itinerary: Itinerary | null;
  dayAccommodations: DayAccommodation[];
  aiOpinionData: any;
  formData: TripFormData;
  currentItineraryId: number | null;
  setCurrentItineraryId: React.Dispatch<React.SetStateAction<number | null>>;
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  const { requestLogin, isAuthed, authUser } = useMapToggle();
  const [isSaving, setIsSaving] = useState(false);
  // ⚠️ 2026-07-03 사장님 UX SSOT = 저장버튼 = 누르면 영구 잠김(옛) 아님 = 저장 성공 시 녹색 체크(✓) 0.5초(초최단) 보여준 뒤 원래 💾로 복귀 = 다시 저장 가능.
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 언마운트/재저장 시 타이머 정리용

  useEffect(() => {
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  const handleSaveItinerary = async () => {
    if (!itinerary) {
      Alert.alert(t("common.error"), t("trip.noItinerary"));
      return;
    }

    setIsSaving(true);
    try {
      // ⚠️ 사장님 SSOT 2026-07-15 = 저장 판정 = 실계정 1벌(§0.3). 게스트·비로그인 모두 로그인 안내(ensureLoggedIn = login-gate 공용, §0.3 1벌화 2026-07-21).
      if (!ensureLoggedIn(isAuthed, t, requestLogin)) {
        setIsSaving(false);
        return;
      }
      const userData = authUser;
      if (!userData) {
        setIsSaving(false);
        return;
      } // 게이트 통과 = 항상 존재. TS null 좁힘.

      const { cached: _c, ...aiOpinionResult } = (aiOpinionData || {}) as any;

      const rawWithAccom = {
        ...itinerary,
        days: (itinerary.days || []).map((d) => {
          const acc = dayAccommodations.find((a) => a.day === d.day);
          return acc
            ? {
                ...d,
                accommodation: {
                  name: acc.name,
                  address: acc.address,
                  coords: acc.coords,
                  placeId: acc.placeId,
                },
              }
            : d;
        }),
        // 🧠 2026-07-04 사장님 SSOT = 화면에 뜬 AI 의견 결과(유료 Gemini)를 여정 저장에 함께 박제(구글이미지 스토리지 박제와 동일 원리).
        ...(aiOpinionData
          ? {
              verificationResult: {
                result: aiOpinionResult,
                language: i18n.language,
              },
            }
          : {}),
      };

      // ⚠️ 2026-08-02 사장님 지시 = 도시 id 는 화면이 보내지 않는다(하드코딩 1 완전삭제 §19).
      const saveData = {
        userId: userData.id,
        title: `${itinerary.destination} ${t("profile.trips")}`,
        startDate: itinerary.startDate,
        endDate: itinerary.endDate,
        travelStyle: (formData.travelStyle || "comfort").toLowerCase(), // DB enum: luxury, comfort
        curationFocus: formData.curationFocus,
        companionType: formData.companionType,
        companionCount: formData.companionCount,
        companionAges: formData.companionAges,
        vibes: formData.vibes,
        travelPace: formData.travelPace,
        mobilityStyle: formData.mobilityStyle,
        status: "saved",
        isSavedByUser: true,
        rawData: rawWithAccom,
      };

      // ⚠️ 2026-07-03 사장님 SSOT = 복원 여정(currentItineraryId 있음) 재저장 = 같은 행 덮어쓰기(PUT=여정1→여정1.1). 신규 = 새 행(POST).
      const response = currentItineraryId
        ? await apiRequest(
            "PUT",
            `/api/itineraries/${currentItineraryId}`,
            saveData,
          )
        : await apiRequest("POST", "/api/itineraries", saveData);
      const saved = await response.json();

      if (saved.id) {
        const wasOverwrite = !!currentItineraryId;
        setCurrentItineraryId(saved.id);
        // ⚠️ 2026-07-03 사장님 UX = 저장 성공 → 녹색 체크(✓) 0.5초 노출 후 원래 💾로 자동 복귀(Alert 팝업 없음). 이전 타이머 있으면 정리(재저장 연타).
        if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
        setJustSaved(true);
        justSavedTimer.current = setTimeout(() => setJustSaved(false), 500);
        console.log(
          `[TripPlanner] 💾 일정 저장 완료: id=${saved.id} (${wasOverwrite ? "덮어쓰기" : "신규"})`,
        );
        // ⚠️ 사장님 SSOT 2026-07-14 = 전문가 문의 footer 가 저장 성공 여부로 이동 판단(비로그인=미저장이면 문의탭으로 안 넘김). 저장 id 반환.
        return saved.id as number;
      }
    } catch (error) {
      console.error("[TripPlanner] 저장 오류:", error);
      Alert.alert(t("trip.saveFailed"), t("trip.saveFailedMsg"));
    } finally {
      setIsSaving(false);
    }
    return null; // 미저장(비로그인·오류·응답에 id 없음) = 문의탭 이동 안 함.
  };

  return { isSaving, justSaved, handleSaveItinerary };
}
