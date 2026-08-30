import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { ScrollView, useColorScheme, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "@/constants/theme";
import { TripFormData, Vibe, DayAccommodation, Itinerary } from "@/types/trip";
import { apiRequest, itineraryUrl } from "@/lib/query-client";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { UserData } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { MainTabParamList } from "@/navigation/MainTabNavigator";
import { formatDate } from "../utils";
import { usePickers } from "./usePickers";
import { useAccommodations } from "./useAccommodations";
import { useAiOpinionOverlay } from "./useAiOpinionOverlay";
import { useSaveItinerary } from "./useSaveItinerary";
import { useShareCalendar } from "./useShareCalendar";
import { useGenerateItinerary } from "./useGenerateItinerary";
import { isCityCenterName } from "@/lib/display-city-name";

type ScreenState = "Input" | "Loading" | "Result";

// ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = initialRequest = BTS 가 조립한 폼(공연도시·핀·공연장 기점).
export function useTripPlanner(initialRequest?: Partial<TripFormData>) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // ⚠️ 수정금지(승인필요) 2026-07-31 = **화면 밖에서 열려도 안 터지게** 한 것.
  let restoreItineraryId: number | undefined;
  try {
    const route = useRoute<RouteProp<MainTabParamList, "Home">>();
    restoreItineraryId = route.params?.itineraryId;
  } catch {
    restoreItineraryId = undefined; // 창으로 열린 경우 = 복원할 여정이 없음
  }
  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  // ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 로딩화면 기능소개 캐러셀 오픈 게이트.
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const {
    setCurrentItinerary,
    currentItinerary: globalCurrentItinerary,
    aiOpinionRequestedAt,
    clearAiOpinionRequest,
    requestAiOpinion,
    requestExpert,
    authUser,
    isAuthed,
    // 🔒 2026-08-05 사장님 SSOT = 여정 슬롯 [해설 듣기] 관문용(PlaceSlotCard 로 내려보냄).
    requestLogin,
    homeRequestedAt,
    clearHomeRequest,
  } = useMapToggle();
  const { t, i18n } = useTranslation();

  const LOADING_MESSAGES = useMemo(
    () => [
      t("trip.loading1"),
      t("trip.loading2"),
      t("trip.loading3"),
      t("trip.loading4"),
    ],
    [t],
  );
  // ⚠️ 2026-07-03 사장님 SSOT = 재저장 판별용 여정 DB id. 복원(프로필 카드 탭)/저장 성공 시 세팅 = 이 화면 재저장 시 같은 행 덮어쓰기(PUT).
  const [currentItineraryId, setCurrentItineraryId] = useState<number | null>(
    null,
  );
  const [sharedEntry, setSharedEntry] = useState(false);
  // 🎬 2026-07-22 사장님 SSOT = 영상 버튼은 "프로필 카드로 복원한 저장 여정"에서만 저장버튼 자리에 노출.
  const [restoredTrip, setRestoredTrip] = useState(false);
  const resultScrollRef = useRef<ScrollView | null>(null);
  const slotLayoutsRef = useRef<Record<string, number>>({});
  const dayLayoutsRef = useRef<Record<number, number>>({});
  const placesListOffsetRef = useRef<Record<number, number>>({});
  const [currentMapDay, setCurrentMapDay] = useState(1);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const currentUser: UserData | null = authUser;

  const [formData, setFormData] = useState<TripFormData>({
    birthDate: "", // 🔧 필수 입력값으로 변경
    companionType: "Family",
    companionCount: 4,
    companionAges: "55, 59",
    curationFocus: "Everyone",
    destination: "Paris",
    startDate: formatDate(new Date()),
    startTime: "09:00",
    endDate: formatDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
    endTime: "21:00",
    // 🎯 2026-06-30 = 초기 기본값 Foodie→Shopping 대체(§19, 사장님 SSOT). Foodie=버튼 폐기됨→toggleVibe로 끌 방법 없음→유령값이 vibes배열에 영구잔존→헤더 "& 미식" 오염 버그. Healing은 원래값 유지, Foodie자리를 실재버튼 Shopping이 대체. (백엔드 폴백 5곳도 동일히 Foodie→Shopping, WORKLOG:96 정합)
    vibes: ["Healing", "Shopping"],
    travelStyle: "Reasonable", // 기본값
    travelPace: "Relaxed",
    mobilityStyle: "WalkMore",
    ...(initialRequest ?? {}),
  });

  const {
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    setAiOpinionData,
    aiOpinionError,
  } = useAiOpinionOverlay({
    itinerary,
    currentItineraryId,
    aiOpinionRequestedAt,
    clearAiOpinionRequest,
    globalCurrentItinerary,
    t,
    i18n,
  });

  const {
    dayAccommodations,
    setDayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    isReoptimizing,
    handleSetDayAccommodation,
  } = useAccommodations({ itinerary, setItinerary, formData, t });

  const { isSaving, justSaved, handleSaveItinerary } = useSaveItinerary({
    itinerary,
    dayAccommodations,
    aiOpinionData,
    formData,
    currentItineraryId,
    setCurrentItineraryId,
    t,
    i18n,
  });

  const { sharingAction, handleShareItinerary, handleSaveCalendar } =
    useShareCalendar({
      itinerary,
      currentItineraryId,
      handleSaveItinerary,
      t,
    });

  const { handleGenerate } = useGenerateItinerary({
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
  });

  const pickers = usePickers({ formData, setFormData });

  // ⚠️ 2026-07-31 사장님 지시(BTS 문제점1) = 결과화면 ← = BTS 로 열렸으면(폼 실림) **직전 카드 화면으로 복귀**.
  const handleExitResult = useCallback(() => {
    if (initialRequest && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = "출발지로 귀환" = 프로필 카드로 열람한 여정은
    if (restoredTrip) {
      (
        navigation as unknown as {
          navigate: (name: string, params?: unknown) => void;
        }
      ).navigate("Main", { screen: "Profile" });
      return;
    }
    // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = "1회 생성 = 미션 종료" 안전장치 ②(Input 재진입 시).
    setFormData((prev) => ({
      ...prev,
      accommodationCoords: undefined,
      accommodationName: undefined,
      accommodationAddress: undefined,
      accommodationPlaceId: undefined,
    }));
    setScreen("Input");
  }, [initialRequest, navigation, restoredTrip]);

  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 하단탭 "Plan" = 홈버튼 신호 수신.
  //   ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인(판단3종 회귀 지적 반영) = Loading 중엔 무시.
  useEffect(() => {
    if (!homeRequestedAt) return;
    if (screen === "Loading") {
      clearHomeRequest();
      return;
    }
    // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 홈(Input)은 항상 새 여정을 만들 수 있는 빈 상태가 기본.
    setRestoredTrip(false);
    setFormData((prev) => ({
      ...prev,
      accommodationCoords: undefined,
      accommodationName: undefined,
      accommodationAddress: undefined,
      accommodationPlaceId: undefined,
    }));
    setScreen("Input");
    clearHomeRequest();
  }, [homeRequestedAt, clearHomeRequest, screen]);

  // ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = 폼을 실어 열렸으면(같이 떠나요) 입력화면 건너뛰고 즉시 생성 1회.
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    if (!initialRequest || autoGeneratedRef.current || !isAuthed) return;
    autoGeneratedRef.current = true;
    handleGenerate();
  }, [initialRequest, isAuthed, handleGenerate]);

  // ⚠️ 2026-07-03 사장님 SSOT = "이 화면에 지도 섹션(필수 요소)이 있는가"로 판단 = screen==="Result"일 때만 활성.
  const globalItineraryRef = useRef(globalCurrentItinerary);
  useEffect(() => {
    globalItineraryRef.current = globalCurrentItinerary;
  });
  useEffect(() => {
    if (screen === "Result") {
      setCurrentItinerary(itinerary, currentItineraryId);
    } else if (
      globalItineraryRef.current &&
      globalItineraryRef.current === itinerary
    ) {
      setCurrentItinerary(null, null);
    }
  }, [screen, itinerary, currentItineraryId, setCurrentItinerary]);

  const unmountGuardRef = useRef({
    mine: null as Itinerary | null,
    global: null as Itinerary | null,
    clear: setCurrentItinerary,
  });
  useEffect(() => {
    unmountGuardRef.current.mine = screen === "Result" ? itinerary : null;
    unmountGuardRef.current.global = globalCurrentItinerary;
    unmountGuardRef.current.clear = setCurrentItinerary;
  });
  useEffect(() => {
    return () => {
      const g = unmountGuardRef.current;
      if (g.mine && g.mine === g.global) g.clear(null, null);
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setFormData((prev) => ({
      ...prev,
      birthDate: authUser.birthDate || prev.birthDate,
    }));
  }, [authUser]);

  const restoreItineraryById = useCallback(
    async (targetId: number, opts?: { shared?: boolean }) => {
      // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = GET 응답 오기 전 잠깐 Input 화면이 그대로 보이던 문제
      //   ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인(판단3종 지적) = loadingStep도 0으로 리셋.
      setLoadingStep(0);
      setScreen("Loading");
      try {
        // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 화면 언어를 넘겨 서버가 슬롯 해설을 (place_id, 언어) 캐시로 이어붙임(제미니 호출 0).
        // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = URL 생성 = itineraryUrl() 공용(§16, TripisModal.tsx 와 중복 제거).
        const res = await apiRequest(
          "GET",
          itineraryUrl(targetId, i18n.language),
        );
        const data = await res.json();
        const raw = data?.rawData;
        if (!raw || !raw.days) {
          console.warn(
            "[TripPlanner] 저장여정 복원 실패: rawData 없음",
            targetId,
          );
          setScreen("Input"); // Loading에 갇히지 않도록 복귀
          return;
        }
        setItinerary(raw as Itinerary);
        setAiOpinionData((raw as any).verification?.result ?? null);
        // ⚠️ 수정금지(승인필요) 2026-08-13 = 이름 없는 것(서버 깃발용 좌표)은 실제 숙소가 아니므로 제외.
        // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 서버가 저장해 둔 "{도시} 도심"·"도심 기준" 은
        const accoms: DayAccommodation[] = (raw.days || [])
          .filter(
            (d: any) =>
              d.accommodation?.coords?.lat &&
              d.accommodation?.name &&
              !isCityCenterName(d.accommodation.name),
          )
          .map((d: any) => ({
            day: d.day,
            name: d.accommodation.name,
            address: d.accommodation.address || "",
            coords: d.accommodation.coords,
            placeId: d.accommodation.placeId,
          }));
        setDayAccommodations(accoms);
        // ⚠️ 수정금지(승인필요) 2026-08-13 사장님 SSOT = 입력화면 = 앱의 홈 = 항상 디폴트 상태.
        setFormData((prev) => ({
          ...prev,
          destination: raw.destination || prev.destination,
          companionType: data.companionType || prev.companionType,
          companionCount: data.companionCount ?? prev.companionCount,
          curationFocus: data.curationFocus || prev.curationFocus,
          vibes:
            Array.isArray(data.vibes) && data.vibes.length
              ? data.vibes
              : prev.vibes,
        }));
        setCurrentItineraryId(opts?.shared ? null : targetId);
        setSharedEntry(!!opts?.shared);
        setRestoredTrip(!opts?.shared); // 프로필 카드 복원 = 헤더 저장버튼 → 영상 버튼 전환(공유 열람 제외)
        setScreen("Result");
      } catch (e) {
        console.warn("[TripPlanner] 저장여정 복원 오류:", e);
        setScreen("Input"); // Loading에 갇히지 않도록 복귀
      }
    },
    [],
  );

  // ⚠️ 2026-08-03 사장님 지적 실증 = **같은 여정을 다시 열면 먹통**(도시카드 [코스] 1회는 뜨고 2회째 무반응,
  useEffect(() => {
    if (!restoreItineraryId) return;
    restoreItineraryById(restoreItineraryId);
    try {
      navigation.setParams({ itineraryId: undefined } as never);
    } catch {}
  }, [restoreItineraryId, restoreItineraryById, navigation]);

  useEffect(() => {
    if (screen === "Loading") setRestoredTrip(false);
  }, [screen]);

  const sharedDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (sharedDeepLinkHandled.current) return;
    const m = window.location.pathname.match(/^\/shared\/itinerary\/(\d+)$/);
    if (!m) return;
    sharedDeepLinkHandled.current = true;
    restoreItineraryById(Number(m[1]), { shared: true });
  }, [restoreItineraryById]);

  const toggleVibe = (vibe: Vibe) => {
    setFormData((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter((v) => v !== vibe)
        : [...prev.vibes, vibe].slice(-3),
    }));
  };

  return {
    theme,
    insets,
    navigation,
    t,
    i18n,
    // 🔒 2026-08-05 사장님 SSOT = 슬롯 [해설 듣기] 관문에 필요(판정은 전역 1곳 MapToggleContext, 여기선 전달만).
    isAuthed,
    requestLogin,
    handleExitResult,
    // ⚠️ 2026-08-01 사장님 지시 = **마지막 슬롯이 고정된 여정**이면 [숙소 변경]을 숨긴다.
    hasFixedFinalPlace: !!formData.finalPlaceId,
    screen,
    setScreen,
    loadingStep,
    LOADING_MESSAGES,
    carouselOpen,
    itinerary,
    formData,
    setFormData,
    toggleVibe,
    restoreItineraryById,
    handleGenerate,
    isSaving,
    justSaved,
    handleSaveItinerary,
    currentItineraryId, // 🎬 영상 슬롯이 쓰는 여정 id
    restoredTrip, // 🎬 프로필 카드 복원 여정 = 헤더 저장버튼 → 영상 버튼 전환(2026-07-22 사장님 SSOT, 신규 여정은 저장버튼 유지)
    sharingAction, // "share" | "calendar" | null = 눌린 버튼만 선택색+스피너 (2026-07-22 사장님 실기기 피드백)
    handleShareItinerary,
    handleSaveCalendar,
    sharedEntry,
    dayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    isReoptimizing,
    handleSetDayAccommodation,
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    aiOpinionError,
    requestAiOpinion,
    requestExpert,
    resultScrollRef,
    slotLayoutsRef,
    dayLayoutsRef,
    placesListOffsetRef,
    currentMapDay,
    setCurrentMapDay,
    selectedSlotId,
    setSelectedSlotId,
    ...pickers,
  };
}

export type PlannerApi = ReturnType<typeof useTripPlanner>;
