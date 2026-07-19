// 여정 생성(위기경보 체크 → 생성 API → 결과 전환) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { useState, useCallback } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Itinerary, TripFormData, DayAccommodation } from "@/types/trip";
import { calculateVibeWeights } from "@/utils/vibeCalculator";
import { apiRequest } from "@/lib/query-client";
import { isAuthenticated, UserData } from "@/lib/auth";

export function useGenerateItinerary({
  formData,
  currentUser,
  navigation,
  setScreen,
  setLoadingStep,
  setItinerary,
  setAiOpinionData,
  setDayAccommodations,
  setCurrentItineraryId,
  t,
  i18n,
}: {
  formData: TripFormData;
  currentUser: UserData | null;
  navigation: { navigate: (screen: any) => void };
  setScreen: React.Dispatch<
    React.SetStateAction<"Input" | "Loading" | "Result">
  >;
  setLoadingStep: React.Dispatch<React.SetStateAction<number>>;
  setItinerary: React.Dispatch<React.SetStateAction<Itinerary | null>>;
  setAiOpinionData: React.Dispatch<React.SetStateAction<any>>;
  setDayAccommodations: React.Dispatch<
    React.SetStateAction<DayAccommodation[]>
  >;
  setCurrentItineraryId: React.Dispatch<React.SetStateAction<number | null>>;
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  const [pendingGenerate, setPendingGenerate] = useState(false);

  // 🚨 위기 정보 체크 및 팝업 표시
  const checkCrisisAlerts = async (): Promise<{
    hasAlerts: boolean;
    shouldProceed: boolean;
  }> => {
    try {
      const response = await apiRequest(
        "GET",
        `/api/trip-alerts?city=${encodeURIComponent(formData.destination)}&startDate=${formData.startDate}&endDate=${formData.endDate}`,
      );
      const data = await response.json();

      if (data.hasAlerts && data.alerts?.length > 0) {
        const highSeverityAlerts = data.alerts.filter(
          (a: any) => a.severity >= 7,
        );
        const alertMessages = data.alerts
          .slice(0, 3)
          .map((a: any) => `• ${a.titleKo || a.title} (${a.date})`)
          .join("\n");

        return new Promise((resolve) => {
          if (data.highSeverity) {
            // 심각한 위기 정보 - 경고 팝업
            Alert.alert(
              t("trip.crisisTitle"),
              `${formData.destination}에 ${data.alertCount}개의 주의사항이 있습니다:\n\n${alertMessages}\n\n${data.summary}\n\n일정을 계속 생성하시겠습니까?`,
              [
                {
                  text: t("common.cancel"),
                  style: "cancel",
                  onPress: () =>
                    resolve({ hasAlerts: true, shouldProceed: false }),
                },
                {
                  text: t("trip.crisisContinue"),
                  onPress: () =>
                    resolve({ hasAlerts: true, shouldProceed: true }),
                },
              ],
            );
          } else {
            // 일반 알림 정보 - 알림 팝업
            Alert.alert(
              t("trip.crisisReferenceTitle"),
              `${formData.destination}에 참고할 정보가 있습니다:\n\n${alertMessages}`,
              [
                {
                  text: t("trip.crisisConfirm"),
                  onPress: () =>
                    resolve({ hasAlerts: true, shouldProceed: true }),
                },
              ],
            );
          }
        });
      }

      return { hasAlerts: false, shouldProceed: true };
    } catch (error) {
      console.log(
        "[TripPlanner] Crisis check failed, proceeding anyway:",
        error,
      );
      return { hasAlerts: false, shouldProceed: true };
    }
  };

  const executeGenerate = async () => {
    // 🚨 1. 위기 정보 체크 (일정 생성 전)
    const crisisCheck = await checkCrisisAlerts();
    if (!crisisCheck.shouldProceed) {
      return; // 사용자가 취소함
    }

    // ⚠️ 2026-07-03 사장님 SSOT = 새로 생성하는 여정은 새 카드(POST). 복원 id 리셋 = 이전 복원 여정 덮어쓰기 방지.
    setCurrentItineraryId(null);
    setScreen("Loading");
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep((s) => (s < 3 ? s + 1 : s));
    }, 2000);

    try {
      // 🎯 사용자 ID + 언어 포함 → 백엔드에서 birthDate 조회, 일정 출력 언어 반영
      const requestData = {
        ...formData,
        userId: currentUser?.id, // DB에서 사용자 정보 조회용
        language: currentUser?.language || i18n.language || "ko", // 일정 생성 출력 언어
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

      clearInterval(interval);

      const vibeWeights = calculateVibeWeights(
        formData.vibes,
        formData.curationFocus,
      );

      // 🧠 2026-07-04 = 새 여정 생성 = 옛 여정 AI 의견 state 폐기(다른 여정에 오박제 방지 = 저장 시 [C]가 옛 결과를 새 여정에 싣는 사고 차단).
      setAiOpinionData(null);
      setItinerary({
        title: result.title || `${formData.destination} ${t("profile.trips")}`,
        destination: result.destination || formData.destination,
        startDate: result.startDate || formData.startDate,
        endDate: result.endDate || formData.endDate,
        vibeWeights: result.vibeWeights || vibeWeights,
        days: result.days || [],
        // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 응답의 교통·동행 확정값을 셀렉 없이 보존(§20).
        //   = 이걸 버리면 AI의견 서버가 값 없음→기본값 재계산→대중교통 여정이 전용차(guide)로 변질(투르 실증 결함).
        //   = metadata 는 통째 보존(부분 추출 금지) = transportCategory(1차 매트릭스 확정 교통수단)·curationFocus 등 후속 소비자가 그대로 읽음.
        companionType: result.companionType,
        companionCount: result.companionCount,
        travelStyle: result.travelStyle,
        mobilityStyle: result.mobilityStyle,
        metadata: result.metadata,
        // 🚨 위기 정보 포함
        crisisAlerts: crisisCheck.hasAlerts ? result.crisisAlerts : undefined,
      });

      // 🏨 2026-06-29 사용자 SSOT = A단계: 입력화면에서 정한 숙소 = 전체 Day의 출발·도착 기점으로 고정.
      //   formData.accommodationCoords(사용자 선택) 있으면 → 모든 Day의 dayAccommodations 초기 세팅
      //   → "숙소 설정" 버튼·출발바·지도 깃발이 그 주소로 고정 표시 (옛: 입력숙소가 여정에 전혀 연결 안 됨).
      //   미입력이면 안 넣음 = 백엔드가 도심 기점으로 동선 생성 + 출발바는 "도심 기준" 폴백 표시.
      if (formData.accommodationCoords?.lat && formData.accommodationName) {
        // 생성된 모든 Day에 입력 숙소를 그 Day 번호로 동일 적용 (= 출발·도착 기점 고정)
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
      setScreen("Result");
    } catch (error: any) {
      clearInterval(interval);
      console.error("Failed to generate itinerary:", error);

      const message = error?.message || "";
      Alert.alert(
        t("trip.generateFailed"),
        message.includes("일정 검증")
          ? t("trip.validationFailed")
          : t("trip.retryHint"),
        [{ text: t("common.confirm") }],
      );
      setScreen("Input");
    }
  };

  const handleGenerate = async () => {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      executeGenerate();
    } else {
      setPendingGenerate(true);
      navigation.navigate("Login");
    }
  };
  useFocusEffect(
    useCallback(() => {
      if (pendingGenerate) {
        setPendingGenerate(false);
        isAuthenticated().then((auth) => {
          if (auth) {
            executeGenerate();
          }
        });
      }
    }, [pendingGenerate]),
  );

  return { handleGenerate };
}
