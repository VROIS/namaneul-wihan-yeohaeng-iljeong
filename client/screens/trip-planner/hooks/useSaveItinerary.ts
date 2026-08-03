// 여정 저장(신규 POST/복원 PUT + 저장성공 녹색체크) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
  // ⚠️ 2026-07-25 = 로그인 게이트 = 별도 화면 아닌 인앱 팝업(requestLogin). navigation prop 제거(§0 결합 제거).
  const { requestLogin, isAuthed, authUser } = useMapToggle();
  // 💾 일정 저장 상태
  const [isSaving, setIsSaving] = useState(false);
  // ⚠️ 2026-07-03 사장님 UX SSOT = 저장버튼 = 누르면 영구 잠김(옛) 아님 = 저장 성공 시 녹색 체크(✓) 0.5초(초최단) 보여준 뒤 원래 💾로 복귀 = 다시 저장 가능.
  //   Alert '저장 완료' 팝업 = 과설계라 제거(사장님 SSOT) = 녹색체크 되었다가 원복 = 사용자 인지 충분.
  //   justSaved = 그 일시 피드백 플래그만. (복원된 여정도 그냥 💾 = 재저장 가능 = savedItineraryId 잠금 개념 폐기 §19.)
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 언마운트/재저장 시 타이머 정리용

  // ⚠️ 2026-07-03 = 저장 성공 녹색체크 타이머 언마운트 정리 = 언마운트 후 setState 방지.
  useEffect(() => {
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current);
    };
  }, []);

  // 💾 일정 저장 함수
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
      // ⚠️ 2026-07-27 = 저장 주인 = 전역 판정과 **같은 값**(authUser). 저장소를 따로 읽던 옛 방식 폐기 §19
      //   (게이트는 전역으로 판정하고 저장은 따로 읽으면 두 값이 갈려 남의 계정에 저장될 수 있었음).
      const userData = authUser;
      if (!userData) {
        setIsSaving(false);
        return;
      } // 게이트 통과 = 항상 존재. TS null 좁힘.

      // 🧠 2026-07-04 = 저장할 AI 의견 본문 = 화면 state에서 cached 플래그만 제외한 순수 결과(BE 직접캐시 저장분과 동일 모양 통일 §20).
      const { cached: _c, ...aiOpinionResult } = (aiOpinionData || {}) as any;

      // 🏨 2026-07-03 사용자 SSOT = 저장시점 숙소 보관. dayAccommodations를 raw_data.days[].accommodation에 병합
      //   → 복원 시 숙소 깃발·출발바 재현(DB 숙소전용 컬럼 없음 = raw_data JSON에만). 숙소 미설정 Day는 그대로.
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
        //   → 복원 후 첫 클릭도 캐시 히트($0). fp는 BE(buildItineraryData)가 이 rawData로 서버 SSOT 계산(FE는 fp 재발명 금지 §16).
        //   language는 응답 본문에 없으므로 지금 앱 언어를 함께 실음(BE fp의 :language 접미와 일치). AI 의견 안 봤으면(null) 미포함 = POST 종전 동작 동일.
        //   cached 플래그는 벗겨 순수 본문만 저장 = BE 직접캐시 경로(result.response)와 동일 모양 = 저장 형태 1벌 통일(§20).
        ...(aiOpinionData
          ? {
              verificationResult: {
                result: aiOpinionResult,
                language: i18n.language,
              },
            }
          : {}),
      };

      // 일정 데이터 구성
      // ⚠️ 2026-08-02 사장님 지시 = 도시 id 는 화면이 보내지 않는다(하드코딩 1 완전삭제 §19).
      //   서버가 저장 시점에 목적지 이름으로 도시를 찾아 채운다(server/city-match.ts 1벌 = §16).
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
        // 사용자가 저장 버튼으로 명시 저장 = true (2026-07-21 여정공유·캘린더저장 명세)
        isSavedByUser: true,
        // 🩹 [2026-01-26] 영상 생성을 위한 원본 데이터 전체 저장 + 🏨 2026-07-03 숙소 병합본
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
        // 저장한 여정 id 기억 = 이 화면서 또 저장하면 같은 행 덮어쓰기(중복 카드 방지).
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
