// ⚠️ 2026-08-10 사장님 지시 = 위기경보(crisis alert) 완전삭제(§19) = 이 파일이 부르던 GET /api/trip-alerts 체크 삭제.
import { Alert } from "react-native";
import { Itinerary, TripFormData, DayAccommodation } from "@/types/trip";
import { calculateVibeWeights } from "@/utils/vibeCalculator";
import { apiRequest } from "@/lib/query-client";
import { UserData } from "@/lib/auth";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { parseCreditShortfall, useCreditShortfall } from "@/lib/creditError";

export function useGenerateItinerary({
  formData,
  currentUser,
  setScreen,
  setLoadingStep,
  setCarouselOpen,
  setItinerary,
  setAiOpinionData,
  setDayAccommodations,
  setCurrentItineraryId,
  setFormData,
  t,
  i18n,
}: {
  formData: TripFormData;
  currentUser: UserData | null;
  setScreen: React.Dispatch<
    React.SetStateAction<"Input" | "Loading" | "Result">
  >;
  setLoadingStep: React.Dispatch<React.SetStateAction<number>>;
  // ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 로딩화면 기능소개 캐러셀 오픈 게이트(§구현방식-2 참고).
  setCarouselOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setItinerary: React.Dispatch<React.SetStateAction<Itinerary | null>>;
  setAiOpinionData: React.Dispatch<React.SetStateAction<any>>;
  setDayAccommodations: React.Dispatch<
    React.SetStateAction<DayAccommodation[]>
  >;
  setCurrentItineraryId: React.Dispatch<React.SetStateAction<number | null>>;
  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 생성 성공 직후 숙소필드 리셋용(아래 executeGenerate 참고).
  setFormData: React.Dispatch<React.SetStateAction<TripFormData>>;
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  // ⚠️ 2026-07-25 사장님 SSOT = 여정생성 인증분기 = 로그인 인식되면 바로 생성 진행 / 비인증이면 로그인 팝업(requestLogin). 화면 이동·자동재개 폐기(§0·§19).
  const { requestLogin, isAuthed } = useMapToggle();
  const showCreditShortfall = useCreditShortfall();

  const executeGenerate = async () => {
    // ⚠️ 2026-07-03 사장님 SSOT = 새로 생성하는 여정은 새 카드(POST). 복원 id 리셋 = 이전 복원 여정 덮어쓰기 방지.
    setCurrentItineraryId(null);
    setScreen("Loading");
    setLoadingStep(0);
    setCarouselOpen(false); // 이전 실행 잔여 상태 리셋(연속 재시도 대비)

    const messageInterval = setInterval(() => {
      setLoadingStep((s) => (s < 3 ? s + 1 : s));
    }, 2000);
    // ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = MIX 게이트(3초). DB-only(2초 내)는 응답이 먼저 와서
    const carouselGateTimer = setTimeout(() => setCarouselOpen(true), 3000);
    const clearTimers = () => {
      clearInterval(messageInterval);
      clearTimeout(carouselGateTimer);
    };

    try {
      const requestData = {
        ...formData,
        userId: currentUser?.id, // DB에서 사용자 정보 조회용
        // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 여정 출력 언어 = 화면 언어(i18n) 1벌 = AI의견·Tripis·저장과 동일 기준(§16).
        language: i18n.language || "ko",
      };

      console.log(
        `[TripPlanner] 🎯 일정 생성 요청: userId=${currentUser?.id}, birthDate=${formData.birthDate}`,
      );

      const response = await apiRequest(
        "POST",
        "/api/routes/generate",
        requestData,
      );
      const result = await response.json();

      console.log(
        "[TripPlanner] API response days count:",
        result.days?.length,
      );
      console.log(
        "[TripPlanner] Days:",
        result.days?.map((d: any) => ({
          day: d.day,
          city: d.city,
          placesCount: d.places?.length,
        })),
      );

      clearTimers();
      setCarouselOpen(false); // 이미 열려 있었어도 응답 도착 즉시 강제로 닫는다(중간 프레임 없이 결과화면 전환)

      // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = 서버가 **만드는 순간 DB 에 여정 행을 만든다**.
      if (result.itineraryId) setCurrentItineraryId(result.itineraryId);

      const vibeWeights = calculateVibeWeights(
        formData.vibes,
        formData.curationFocus,
      );

      setAiOpinionData(null);
      setItinerary({
        title: result.title || `${formData.destination} ${t("profile.trips")}`,
        destination: result.destination || formData.destination,
        startDate: result.startDate || formData.startDate,
        endDate: result.endDate || formData.endDate,
        vibeWeights: result.vibeWeights || vibeWeights,
        days: result.days || [],
        // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 응답의 교통·동행 확정값을 셀렉 없이 보존(§20).
        companionType: result.companionType,
        companionCount: result.companionCount,
        travelStyle: result.travelStyle,
        mobilityStyle: result.mobilityStyle,
        metadata: result.metadata,
      });

      if (formData.accommodationCoords?.lat && formData.accommodationName) {
        const days = result.days || [];
        setDayAccommodations(
          days.map(
            (d: any): DayAccommodation => ({
              day: d.day,
              name: formData.accommodationName!,
              address: formData.accommodationAddress || "",
              coords: formData.accommodationCoords!,
              placeId: formData.accommodationPlaceId,
            }),
          ),
        );
      } else {
        setDayAccommodations([]);
      }

      // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "1회 생성 = 미션 종료" 안전장치 ①(생성 성공 직후).
      setFormData((prev) => ({
        ...prev,
        accommodationCoords: undefined,
        accommodationName: undefined,
        accommodationAddress: undefined,
        accommodationPlaceId: undefined,
      }));
      setScreen("Result");
    } catch (error: any) {
      clearTimers();
      setCarouselOpen(false);
      console.error("Failed to generate itinerary:", error);

      // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **왜 안 됐는지 화면에 그대로 보여준다.**
      // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 = 공용 헬퍼(충전화면 자동이동, §16 5곳 공용).
      const message = error?.message || "";
      const shortfall = parseCreditShortfall(message);
      if (shortfall) {
        showCreditShortfall(shortfall);
        setScreen("Input");
        return;
      }
      const detail = message.includes("일정 검증")
        ? t("trip.validationFailed")
        : t("trip.retryHint");
      Alert.alert(t("trip.generateFailed"), detail, [
        { text: t("common.confirm") },
      ]);
      setScreen("Input");
    }
  };

  const handleGenerate = async () => {
    if (isAuthed) executeGenerate();
    else requestLogin();
  };

  return { handleGenerate };
}
