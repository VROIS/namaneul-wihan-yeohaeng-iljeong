// 여정 플래너 핵심 훅 = 상태·효과·복원 + 서브훅 조립 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
// (옛 미사용 state activeDay = 사용처 0 = §19 완전삭제)
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ScrollView,
  useColorScheme,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "@/constants/theme";
import { TripFormData, Vibe, DayAccommodation, Itinerary } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { getUserData, UserData } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { MainTabParamList } from "@/navigation/MainTabNavigator";
import { formatDate } from "../utils";
import { usePickers } from "./usePickers";
import { useAccommodations } from "./useAccommodations";
import { useAiOpinionOverlay } from "./useAiOpinionOverlay";
import { useSaveItinerary } from "./useSaveItinerary";
import { useGenerateItinerary } from "./useGenerateItinerary";

type ScreenState = "Input" | "Loading" | "Result";

export function useTripPlanner() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // 🗂️ 2026-07-03 = 저장여정 복원용 route param(itineraryId). 프로필 나의여정 카드 탭 시 전달됨.
  const route = useRoute<RouteProp<MainTabParamList, "Home">>();
  const restoreItineraryId = route.params?.itineraryId;
  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  // ✅ 수정: spinValue를 useRef로 관리 (렌더링마다 재생성 방지)
  const spinValue = React.useRef(new Animated.Value(0)).current;
  // ⚠️ 2026-07-03 = 지도는 항상 고정 표시(showMap 미사용). setCurrentItinerary만 사용 = 하단탭 "AI 의견" 버튼 활성화·검증대상 전달.
  const {
    setCurrentItinerary,
    aiOpinionRequestedAt,
    clearAiOpinionRequest,
    requestAiOpinion,
    expertRequestedAt,
    clearExpertRequest,
    requestExpert,
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
  //   null = 신규 여정 = 저장 시 새 행(POST). (버튼 잠금 아님 = justSaved 와 별개.)
  const [currentItineraryId, setCurrentItineraryId] = useState<number | null>(
    null,
  );
  // 🗺️ 2026-06-28 = 지도 마커 클릭 → 해당 슬롯 스크롤 (= ScrollView ref + 슬롯별 y좌표 기록)
  const resultScrollRef = useRef<ScrollView | null>(null);
  const slotLayoutsRef = useRef<Record<string, number>>({});
  // 🗺️ 2026-06-28 = 지도 = 스크롤 따라 보이는 Day 자동 전환 (= Day별 시작 y 기록 + onScroll 감지 → 그 Day 슬롯+숙소깃발)
  const dayLayoutsRef = useRef<Record<number, number>>({});
  const placesListOffsetRef = useRef<Record<number, number>>({});
  const [currentMapDay, setCurrentMapDay] = useState(1);
  // 🗺️ 2026-06-28 사용자 SSOT = 슬롯(이미지外) 터치 → 지도 그 마커 포커스 (= 양방향 연동, 썸네일터치=외부구글맵 분리)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // 🎯 로그인된 사용자 정보 (birthDate 포함)
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

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
  });

  // ── 서브훅 조립(분리 전과 동일 상태·핸들러, 파일만 분리 §0) ──
  const {
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    setAiOpinionData,
    aiOpinionError,
    expertVisible,
    setExpertVisible,
  } = useAiOpinionOverlay({
    itinerary,
    currentItineraryId,
    aiOpinionRequestedAt,
    clearAiOpinionRequest,
    expertRequestedAt,
    clearExpertRequest,
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
    navigation,
    t,
    i18n,
  });

  const { handleGenerate } = useGenerateItinerary({
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
  });

  const pickers = usePickers({ formData, setFormData });

  // ⚠️ 2026-07-03 사장님 SSOT = "이 화면에 지도 섹션(필수 요소)이 있는가"로 판단 = screen==="Result"일 때만 활성.
  //   지도(ItineraryMap)도 ResultStep 안에서 screen==="Result"일 때만 그려짐 = 동일 조건 재사용.
  //   itinerary 유무만으로는 안 됨(결과화면 뒤로가기 후 Input에서도 itinerary가 남아있어 오작동).
  useEffect(() => {
    setCurrentItinerary(
      screen === "Result" ? itinerary : null,
      screen === "Result" ? currentItineraryId : null,
    );
  }, [screen, itinerary, currentItineraryId, setCurrentItinerary]);

  // 🎯 로그인된 사용자 정보 로드 → formData.birthDate 자동 설정
  // 🔧 테스트용: 로그인 없이도 기본값 설정
  useEffect(() => {
    const loadUserData = async () => {
      const userData = await getUserData();
      if (userData) {
        setCurrentUser(userData);
        // birthDate를 사용자 정보에서 가져와 formData에 반영
        setFormData((prev) => ({
          ...prev,
          birthDate: userData.birthDate || prev.birthDate,
        }));
        console.log(
          `[TripPlanner] 🎯 사용자 정보 로드: ${userData.name}, birthDate=${userData.birthDate}`,
        );
      } else {
        console.log(`[TripPlanner] 🎯 로그인 정보 없음`);
      }
    };
    loadUserData();
  }, []);

  // 🗂️ 2026-07-03 사용자 SSOT = 저장여정 복원 = 단일 함수(§16). 프로필 "나의 여정" 카드 탭·전문가 답변함 문의 탭 공용.
  //   itineraryId → GET raw_data → 여정 결과화면(ResultStep) 재현. setItinerary + 숙소깃발 + 요약헤더 formData 스칼라 + Result 전환.
  const restoreItineraryById = useCallback(async (targetId: number) => {
    try {
      const res = await apiRequest("GET", `/api/itineraries/${targetId}`);
      const data = await res.json();
      const raw = data?.rawData;
      if (!raw || !raw.days) {
        console.warn(
          "[TripPlanner] 저장여정 복원 실패: rawData 없음",
          targetId,
        );
        return;
      }
      setItinerary(raw as Itinerary);
      setAiOpinionData((raw as any).verification?.result ?? null);
      const accoms: DayAccommodation[] = (raw.days || [])
        .filter((d: any) => d.accommodation?.coords?.lat)
        .map((d: any) => ({
          day: d.day,
          name: d.accommodation.name,
          address: d.accommodation.address || "",
          coords: d.accommodation.coords,
          placeId: d.accommodation.placeId,
        }));
      setDayAccommodations(accoms);
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
        travelStyle: data.travelStyle || prev.travelStyle,
        travelPace: data.travelPace || prev.travelPace,
        mobilityStyle: data.mobilityStyle || prev.mobilityStyle,
      }));
      setCurrentItineraryId(targetId);
      setScreen("Result");
    } catch (e) {
      console.warn("[TripPlanner] 저장여정 복원 오류:", e);
    }
  }, []);

  useEffect(() => {
    if (!restoreItineraryId) return;
    restoreItineraryById(restoreItineraryId);
  }, [restoreItineraryId, restoreItineraryById]);

  useEffect(() => {
    if (screen === "Loading") {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        }),
      ).start();
    }
  }, [screen]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const toggleVibe = (vibe: Vibe) => {
    setFormData((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter((v) => v !== vibe)
        : [...prev.vibes, vibe].slice(-3),
    }));
  };

  return {
    // 컨텍스트·테마
    theme,
    insets,
    navigation,
    t,
    i18n,
    // 화면 상태
    screen,
    setScreen,
    loadingStep,
    LOADING_MESSAGES,
    spin,
    // 여정·폼
    itinerary,
    formData,
    setFormData,
    toggleVibe,
    restoreItineraryById,
    // 생성·저장
    handleGenerate,
    isSaving,
    justSaved,
    handleSaveItinerary,
    // 숙소
    dayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    isReoptimizing,
    handleSetDayAccommodation,
    // AI 의견·전문가 오버레이
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    aiOpinionError,
    expertVisible,
    setExpertVisible,
    requestAiOpinion,
    requestExpert,
    // 지도·스크롤 연동
    resultScrollRef,
    slotLayoutsRef,
    dayLayoutsRef,
    placesListOffsetRef,
    currentMapDay,
    setCurrentMapDay,
    selectedSlotId,
    setSelectedSlotId,
    // 픽커
    ...pickers,
  };
}

export type PlannerApi = ReturnType<typeof useTripPlanner>;
