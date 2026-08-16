// 여정 생성(생성 API → 결과 전환) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  // ⚠️ 2026-07-25 사장님 SSOT = 여정생성 인증분기 = 로그인 인식되면 바로 생성 진행 / 비인증이면 로그인 팝업(requestLogin). 화면 이동·자동재개 폐기(§0·§19).
  const { requestLogin, isAuthed } = useMapToggle();
  // 크레딧부족(402) 안내 + 충전화면 이동 = 앱 전체 공용 1벌(§16). 이동 방식(창 안/밖) 판단도 그 훅이 한다.
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
    //   이 타이머가 발화 전에 취소된다(§구현방식-2 "경주" 메커니즘) = 캐러셀이 아예 안 열림.
    const carouselGateTimer = setTimeout(() => setCarouselOpen(true), 3000);
    const clearTimers = () => {
      clearInterval(messageInterval);
      clearTimeout(carouselGateTimer);
    };

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

      clearTimers();
      setCarouselOpen(false); // 이미 열려 있었어도 응답 도착 즉시 강제로 닫는다(중간 프레임 없이 결과화면 전환)

      // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = 서버가 **만드는 순간 DB 에 여정 행을 만든다**.
      //   그 행 번호를 여기서 받아 둬야 [저장]이 **같은 행을 덮어쓴다**(PUT).
      //   안 받아 두면 저장할 때 새 행이 또 생겨 **같은 여정이 두 벌**이 된다(useSaveItinerary 의 POST/PUT 분기).
      //   비로그인은 서버가 행을 만들지 않으므로 번호가 안 온다 = null 그대로(종전과 같음).
      if (result.itineraryId) setCurrentItineraryId(result.itineraryId);

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
      clearTimers();
      setCarouselOpen(false);
      console.error("Failed to generate itinerary:", error);

      // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = **왜 안 됐는지 화면에 그대로 보여준다.**
      //   사고: 옛것은 어떤 이유든 전부 "다시 시도해 주세요" 한 줄로 뭉갰다.
      //   그래서 **크레딧이 없어서 막힌 것**을 아무도 알 수 없었고,
      //   사장님이 폰에서 실패를 겪고도 원인을 못 찾아 "배선을 건드렸나" 하고 한참 헤맸다(실측).
      //   서버는 이미 사실을 정확히 보내준다(credit-charge.ts = 남은 크레딧·필요 크레딧까지).
      //   화면이 그걸 버리고 있었을 뿐이다 = 이제 그대로 옮겨 보여준다(§11 = 사실을 보게).
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

  // 여정생성 버튼 = 인증분기(사장님 SSOT): 로그인 인식되면 팝업 없이 바로 생성 / 비인증이면 로그인 팝업만.
  //   비인증은 팝업만 띄우고, 로그인 후 사용자가 생성 버튼을 다시 누름(단순 = §0. 옛 pendingGenerate 화면복귀 자동재개는 팝업엔 불필요 = 폐기 §19).
  const handleGenerate = async () => {
    // ⚠️ 2026-07-27 = 전역 1곳(isAuthed)만 읽음(§0). 저장소 직접 조회 폐기 §19.
    if (isAuthed) executeGenerate();
    else requestLogin();
  };

  return { handleGenerate };
}
