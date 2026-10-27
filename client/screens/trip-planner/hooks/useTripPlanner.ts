import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Alert, ScrollView, useColorScheme, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
import { useBestList } from "./useBestList";
import { isCityCenterName } from "@/lib/display-city-name";
import {
  peekItineraryFromUrl,
  clearItineraryFromUrl,
} from "@/lib/openItineraryFromUrl";

export type ScreenState = "Input" | "BestList" | "Loading" | "Result";

// ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = initialRequest = BTS 가 조립한 폼(공연도시·핀·공연장 기점).
export function useTripPlanner(initialRequest?: Partial<TripFormData>) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  let tabBarHeight = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0; // 창으로 열린 경우 = 아래 탭이 없음
  }
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
  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 관리자 대시보드가 새 탭으로 부르는 `?itineraryId=` = 카드 터치와 같은 복원 경로로 합류(§16 = 복원 로직 1벌).
  if (restoreItineraryId == null)
    restoreItineraryId = peekItineraryFromUrl() ?? undefined;
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
  const [restoredTrip, setRestoredTrip] = useState(false);
  // ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 헤더 버튼 2단 = 저장(💾→✓) 성공하면 영상(🎞) · 프로필에서 열면 영상 · 여정 수정에 들어가면 다시 저장(💾) (정본 §)
  const [videoBtn, setVideoBtn] = useState(false);
  const resultScrollRef = useRef<ScrollView | null>(null);
  const slotLayoutsRef = useRef<Record<string, number>>({});
  const dayLayoutsRef = useRef<Record<number, number>>({});
  const placesListOffsetRef = useRef<Record<number, number>>({});
  const [currentMapDay, setCurrentMapDay] = useState(1);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정 수정은 로그인한 사람만(공유 링크로 연 여정도 = 로그인 창) (정본 §)
  const startDayEdit = (day: number) => {
    if (!isAuthed) {
      requestLogin();
      return;
    }
    setVideoBtn(false);
    setEditingDay(day);
  };
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
    currentItineraryId,
    setCurrentItineraryId,
    onSaved: () => setVideoBtn(true),
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

  const { bestList, bestForm, openBestList, bestPicked, setBestPicked } =
    useBestList({
      formData,
      isAuthed,
      requestLogin,
      setScreen,
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
      destinationPlace: undefined,
      accommodationName: undefined,
      accommodationAddress: undefined,
      accommodationPlaceId: undefined,
    }));
    setScreen("Input");
  }, [initialRequest, navigation, restoredTrip]);

  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 하단탭 "Plan" = 홈버튼 신호 수신.
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
      destinationPlace: undefined,
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
      setLoadingStep(0);
      setScreen("Loading");
      try {
        // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = URL 생성 = itineraryUrl() 공용(§16, TripisModal.tsx 와 중복 제거).
        const res = await apiRequest(
          "GET",
          itineraryUrl(targetId, i18n.language),
        );
        const data = await res.json();
        const raw = data?.rawData;
        if (!raw || !raw.days) {
          // ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 날 목록 없는 실패 여정(관리자만 보는 카드) = 조용히 입력 화면으로 보내지 않고 실패 사유·목적지·날짜를 띄운다 (정본 §2026-10-27)
          if (data?.status === "failed") {
            const title = t("trip.failedTripTitle");
            const msg = [
              raw?.error,
              raw?.destination || data.title,
              `${String(data.startDate || "").slice(0, 10)} ~ ${String(data.endDate || "").slice(0, 10)}`,
            ]
              .filter(Boolean)
              .join("\n");
            if (Platform.OS === "web") window.alert(`${title}\n\n${msg}`);
            else Alert.alert(title, msg);
          }
          console.warn(
            "[TripPlanner] 저장여정 복원 실패: rawData 없음",
            targetId,
          );
          setScreen("Input"); // Loading에 갇히지 않도록 복귀
          return;
        }
        setItinerary(raw as Itinerary);
        setAiOpinionData((raw as any).verification?.result ?? null);
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
        setRestoredTrip(!opts?.shared);
        setVideoBtn(!opts?.shared);
        setEditingDay(null);
        setScreen("Result");
      } catch (e) {
        console.warn("[TripPlanner] 저장여정 복원 오류:", e);
        setScreen("Input"); // Loading에 갇히지 않도록 복귀
      }
    },
    [t],
  );

  // ⚠️ 2026-08-03 사장님 지적 실증 = **같은 여정을 다시 열면 먹통**(도시카드 [코스] 1회는 뜨고 2회째 무반응,
  useEffect(() => {
    if (!restoreItineraryId) return;
    restoreItineraryById(restoreItineraryId);
    clearItineraryFromUrl();
    try {
      navigation.setParams({ itineraryId: undefined } as never);
    } catch {}
  }, [restoreItineraryId, restoreItineraryById, navigation]);

  useEffect(() => {
    if (screen === "Loading") {
      setRestoredTrip(false);
      setVideoBtn(false);
    }
  }, [screen]);

  // ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 여정 수정 화면은 결과 화면을 벗어나거나 다른 여정을 열면 꺼진다 (정본 §)
  useEffect(() => {
    if (screen !== "Result") setEditingDay(null);
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
    tabBarHeight,
    navigation,
    t,
    i18n,
    // 🔒 2026-08-05 사장님 SSOT = 슬롯 [해설 듣기] 관문에 필요(판정은 전역 1곳 MapToggleContext, 여기선 전달만).
    isAuthed,
    requestLogin,
    handleExitResult,
    screen,
    setScreen,
    loadingStep,
    LOADING_MESSAGES,
    carouselOpen,
    itinerary,
    setItinerary,
    editingDay,
    setEditingDay,
    startDayEdit,
    formData,
    setFormData,
    toggleVibe,
    restoreItineraryById,
    handleGenerate,
    bestList,
    bestForm,
    openBestList,
    bestPicked,
    setBestPicked,
    isSaving,
    justSaved,
    handleSaveItinerary,
    currentItineraryId, // 🎬 영상 슬롯이 쓰는 여정 id
    setCurrentItineraryId,
    videoBtn,
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
