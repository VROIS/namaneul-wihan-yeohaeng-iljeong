import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  useColorScheme,
  Animated,
  Easing,
  Dimensions,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
// ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT 완전 적용 (= 단순 expo-image 부족)
// = client/lib/wikimedia-image.ts = Wikimedia 버킷 변환 + User-Agent 헤더 + Platform 분기
// = AOS Samsung A36 5G Wikimedia 5/8 실패 → 8/8 3초 (= BTS 검증)
import { Image } from "expo-image";
import { resolveImageSource } from "@/lib/wikimedia-image";
// ⚠️ 수정금지(승인필요) 2026-05-19 = 이미지 NULL placeholder = BTS 맵 마커 동일 SVG (= 사용자 SSOT)
// = bts-marker-svg.ts 직접 import (= BTSPlaceMap 우회 = webview/Google Maps SDK 코드 번들 제외)
import { SvgXml } from "react-native-svg";
import { COLORS as BTS_MARKER_COLORS, LUCIDE as BTS_MARKER_LUCIDE } from "@/components/bts/bts-marker-svg";

// ⚠️ 수정금지(승인필요) 2026-05-19 = 7 카테고리 SVG 모듈 레벨 사전 빌드 (= rendering-hoist-jsx + js-cache-function-results)
// 매 슬롯 렌더마다 SVG 문자열 재생성 비용 0 = static lookup
const BTS_PLACEHOLDER_SVG_BY_CAT: Record<string, string> = Object.fromEntries(
  Object.keys(BTS_MARKER_LUCIDE).map((cat) => [
    cat,
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="${BTS_MARKER_COLORS[cat] || '#666'}" stroke="white" stroke-width="3"/><g transform="translate(10,10) scale(0.8333)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BTS_MARKER_LUCIDE[cat]}</g></svg>`,
  ])
);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Brand, Colors, Spacing, BorderRadius, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import {
  TripFormData,
  Vibe,
  TravelPace,
  MobilityStyle,
  TravelStyle,
  DayAccommodation,
  VIBE_OPTIONS,
  COMPANION_OPTIONS,
  CURATION_FOCUS_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  MOBILITY_STYLE_OPTIONS,
  Itinerary,
  CrisisAlert,
} from "@/types/trip";
import {
  calculateVibeWeights,
  formatVibeWeightsSummary,
  getVibeLabel,
} from "@/utils/vibeCalculator";
import { apiRequest } from "@/lib/query-client";
// ⚠️ 2026-06-28 사용자 SSOT = 토글 InteractiveMap → 고정 ItineraryMap(BTSPlaceMap 패턴: 웹/앱 동일·마커클릭·동선라인폐기·출발깃발) 교체(§19)
import ItineraryMap from "@/components/ItineraryMap";
// ⚠️ 2026-06-29 사용자 SSOT = 자체 PlaceAutocomplete(입력창+드롭다운+프록시 과설계) 폐기(§19) → 구글 공식 위젯(PlaceAutocompleteElement) WebView 100% 활용
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { openPlaceInMaps } from "@/lib/openPlaceInMaps";
import { isAuthenticated, getUserData, UserData } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

let DateTimePicker: any = null;
if (Platform.OS !== "web") {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}

type ScreenState = "Input" | "Loading" | "Result";
type PickerMode = "startDate" | "startTime" | "endDate" | "endTime" | null;

// LOADING_MESSAGES moved inside component for i18n

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// 🚨 위기 경보 깜박이는 배너 컴포넌트
function CrisisAlertBanner({
  alerts,
  onPress,
}: {
  alerts: CrisisAlert[];
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const highSeverity = alerts.some((a) => a.severity >= 7);
  const bgColor = highSeverity ? "#DC2626" : "#F59E0B";

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          crisisStyles.banner,
          { backgroundColor: bgColor, opacity: pulseAnim },
        ]}
      >
        <Icon name="alert-triangle" size={18} color="#FFFFFF" />
        <Text style={crisisStyles.bannerText}>
          {highSeverity ? t("trip.crisisAlert") : t("trip.crisisInfo")}{" "}
          {t("trip.crisisCount", { count: alerts.length })}
        </Text>
        <Icon name="chevron-right" size={18} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}

const crisisStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    gap: 8,
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bold,
    flex: 1,
    textAlign: "center",
  },
});

export default function TripPlannerScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeDay, setActiveDay] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  // ✅ 수정: spinValue를 useRef로 관리 (렌더링마다 재생성 방지)
  const spinValue = React.useRef(new Animated.Value(0)).current;
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const [showWebInput, setShowWebInput] = useState<PickerMode>(null);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  // ⚠️ 2026-06-28 = 지도 고정섹션化(토글 폐기) = 옛 useMapToggle/showMap 삭제(§19). 지도는 항상 표시.
  const { t, i18n } = useTranslation();

  const LOADING_MESSAGES = useMemo(
    () => [t("trip.loading1"), t("trip.loading2"), t("trip.loading3"), t("trip.loading4")],
    [t],
  );

  // 💾 일정 저장 상태
  const [isSaving, setIsSaving] = useState(false);
  const [savedItineraryId, setSavedItineraryId] = useState<number | null>(null);

  // 🏨 Day별 숙소 설정 상태
  const [dayAccommodations, setDayAccommodations] = useState<
    DayAccommodation[]
  >([]);
  const [hotelModalDay, setHotelModalDay] = useState<number | null>(null); // 🏨 숙소 설정 구글 위젯이 인라인으로 펼쳐진 Day (= 모달 폐기 §19, 토글 상태 재활용)
  const [isReoptimizing, setIsReoptimizing] = useState(false);
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

  // 🏨 Day별 숙소 설정 → 동선 재최적화
  const handleSetDayAccommodation = async (
    day: number,
    place: PlaceSelection,
  ) => {
    const newAccom: DayAccommodation = {
      day,
      name: place.name,
      address: place.address,
      coords: place.coords,
      placeId: place.placeId,
    };

    // Day별 숙소 배열 업데이트
    setDayAccommodations((prev) => {
      const filtered = prev.filter((a) => a.day !== day);
      return [...filtered, newAccom];
    });

    // 서버에 동선 재최적화 요청
    if (itinerary && place.coords.lat && place.coords.lng) {
      setIsReoptimizing(true);
      try {
        const currentDay = itinerary.days?.find((d) => d.day === day);
        if (currentDay) {
          const response = await apiRequest(
            "POST",
            "/api/routes/regenerate-day",
            {
              day,
              accommodationCoords: place.coords,
              places: currentDay.places,
              formData,
            },
          );
          const result = await response.json();

          // itinerary의 해당 Day 업데이트
          setItinerary((prev) => {
            if (!prev) return prev;
            const updatedDays = prev.days.map((d) => {
              if (d.day === day) {
                return {
                  ...d,
                  places: result.places || d.places,
                  accommodation: newAccom,
                  departureTransit: result.departureTransit,
                  returnTransit: result.returnTransit,
                  transit: (result as any).transit || (d as any).transit,
                };
              }
              return d;
            });
            return { ...prev, days: updatedDays };
          });
        }
      } catch (error) {
        console.error("[TripPlanner] Day 재최적화 실패:", error);
        Alert.alert(
          t("common.notice"),
          t("trip.reoptimizeFailed"),
        );
      } finally {
        setIsReoptimizing(false);
      }
    }

    setHotelModalDay(null);
  };

  const openPicker = (mode: PickerMode) => {
    if (!mode) return;
    if (Platform.OS === "web") {
      setShowWebInput(mode);
      return;
    }
    let initialDate = new Date();
    if (mode === "startDate") initialDate = parseDate(formData.startDate);
    else if (mode === "endDate") initialDate = parseDate(formData.endDate);
    else if (mode === "startTime") initialDate = parseTime(formData.startTime);
    else if (mode === "endTime") initialDate = parseTime(formData.endTime);
    setTempDate(initialDate);
    setPickerMode(mode);
  };

  const handlePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }
    if (selectedDate) {
      setTempDate(selectedDate);
      if (Platform.OS === "android") {
        confirmPicker(selectedDate);
      }
    }
  };

  const confirmPicker = (date?: Date) => {
    const finalDate = date || tempDate;
    if (pickerMode === "startDate") {
      setFormData((prev) => ({ ...prev, startDate: formatDate(finalDate) }));
    } else if (pickerMode === "endDate") {
      setFormData((prev) => ({ ...prev, endDate: formatDate(finalDate) }));
    } else if (pickerMode === "startTime") {
      setFormData((prev) => ({ ...prev, startTime: formatTime(finalDate) }));
    } else if (pickerMode === "endTime") {
      setFormData((prev) => ({ ...prev, endTime: formatTime(finalDate) }));
    }
    setPickerMode(null);
  };

  const handleWebInputChange = (value: string) => {
    if (showWebInput === "startDate") {
      setFormData((prev) => ({ ...prev, startDate: value }));
    } else if (showWebInput === "endDate") {
      setFormData((prev) => ({ ...prev, endDate: value }));
    } else if (showWebInput === "startTime") {
      setFormData((prev) => ({ ...prev, startTime: value }));
    } else if (showWebInput === "endTime") {
      setFormData((prev) => ({ ...prev, endTime: value }));
    }
  };

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

      setItinerary({
        title: result.title || `${formData.destination} ${t("profile.trips")}`,
        destination: result.destination || formData.destination,
        startDate: result.startDate || formData.startDate,
        endDate: result.endDate || formData.endDate,
        vibeWeights: result.vibeWeights || vibeWeights,
        days: result.days || [],
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
          days.map((d: any): DayAccommodation => ({
            day: d.day,
            name: formData.accommodationName!,
            address: formData.accommodationAddress || "",
            coords: formData.accommodationCoords!,
            placeId: formData.accommodationPlaceId,
          })),
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

  // 💾 일정 저장 함수
  const handleSaveItinerary = async () => {
    if (!itinerary) {
      Alert.alert(t("common.error"), t("trip.noItinerary"));
      return;
    }

    setIsSaving(true);
    try {
      const authenticated = await isAuthenticated();
      if (!authenticated) {
        Alert.alert(t("trip.loginRequired"), t("trip.saveLoginHint"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("trip.loginBtn"), onPress: () => navigation.navigate("Login") },
        ]);
        setIsSaving(false);
        return;
      }

      const userData = await getUserData();
      if (!userData) return;

      // 일정 데이터 구성
      const saveData = {
        userId: userData.id,
        cityId: 1, // TODO: 도시 ID 동적 매핑
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
        // 🩹 [2026-01-26] 영상 생성을 위한 원본 데이터 전체 저장
        rawData: itinerary,
      };

      const response = await apiRequest("POST", "/api/itineraries", saveData);
      const saved = await response.json();

      if (saved.id) {
        setSavedItineraryId(saved.id);
        Alert.alert(
          t("trip.saveComplete"),
          t("trip.saveCompleteMsg"),
          [{ text: t("common.confirm"), style: "default" }],
        );
        console.log(`[TripPlanner] 💾 일정 저장 완료: id=${saved.id}`);
      }
    } catch (error) {
      console.error("[TripPlanner] 저장 오류:", error);
      Alert.alert(t("trip.saveFailed"), t("trip.saveFailedMsg"));
    } finally {
      setIsSaving(false);
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

  const generateDateOptions = () => {
    const options: string[] = [];
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      options.push(formatDate(d));
    }
    return options;
  };

  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        options.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }
    return options;
  };

  const renderWebInputModal = () => {
    if (!showWebInput) return null;
    const isDate = showWebInput === "startDate" || showWebInput === "endDate";
    const title =
      showWebInput === "startDate"
        ? t("trip.startDate")
        : showWebInput === "endDate"
          ? t("trip.endDate")
          : showWebInput === "startTime"
            ? t("trip.startTime")
            : t("trip.endTime");
    const currentValue =
      showWebInput === "startDate"
        ? formData.startDate
        : showWebInput === "endDate"
          ? formData.endDate
          : showWebInput === "startTime"
            ? formData.startTime
            : formData.endTime;
    const options = isDate ? generateDateOptions() : generateTimeOptions();

    return (
      <Modal visible transparent animationType="fade">
        <Pressable
          style={styles.pickerModalOverlay}
          onPress={() => setShowWebInput(null)}
        >
          <View
            style={[
              styles.webPickerModal,
              { backgroundColor: theme.backgroundRoot },
            ]}
          >
            <View style={styles.webPickerHeader}>
              <Pressable onPress={() => setShowWebInput(null)}>
                <Text
                  style={[styles.pickerCancel, { color: theme.textSecondary }]}
                >
                  {t("common.cancel")}
                </Text>
              </Pressable>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>
                {title}
              </Text>
              <Pressable onPress={() => setShowWebInput(null)}>
                <Text style={[styles.pickerConfirm, { color: Brand.primary }]}>
                  {t("common.confirm")}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.webPickerScroll}
              showsVerticalScrollIndicator={false}
            >
              {options.map((option) => {
                const isSelected = option === currentValue;
                return (
                  <Pressable
                    key={option}
                    style={[
                      styles.webPickerOption,
                      isSelected ? { backgroundColor: `${Brand.primary}15` } : undefined,
                    ]}
                    onPress={() => {
                      handleWebInputChange(option);
                      setShowWebInput(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.webPickerOptionText,
                        { color: isSelected ? Brand.primary : theme.text },
                        isSelected ? { fontFamily: Fonts.bold } : undefined,
                      ]}
                    >
                      {option}
                    </Text>
                    {isSelected ? (
                      <Icon name="check" size={20} color={Brand.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    );
  };

  const renderPicker = () => {
    if (!pickerMode || Platform.OS === "web" || !DateTimePicker) return null;
    const isDate = pickerMode === "startDate" || pickerMode === "endDate";
    const mode = isDate ? "date" : "time";
    const title =
      pickerMode === "startDate"
        ? t("trip.startDate")
        : pickerMode === "endDate"
          ? t("trip.endDate")
          : pickerMode === "startTime"
            ? t("trip.startTime")
            : t("trip.endTime");

    if (Platform.OS === "ios") {
      return (
        <Modal visible transparent animationType="slide">
          <View style={styles.pickerModalOverlay}>
            <View
              style={[
                styles.pickerModalContent,
                { backgroundColor: theme.backgroundRoot },
              ]}
            >
              <View style={styles.pickerHeader}>
                <Pressable onPress={() => setPickerMode(null)}>
                  <Text
                    style={[
                      styles.pickerCancel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {t("common.cancel")}
                  </Text>
                </Pressable>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                  {title}
                </Text>
                <Pressable onPress={() => confirmPicker()}>
                  <Text
                    style={[styles.pickerConfirm, { color: Brand.primary }]}
                  >
                    {t("common.confirm")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                onChange={handlePickerChange}
                locale="ko-KR"
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      );
    }

    return (
      <DateTimePicker
        value={tempDate}
        mode={mode}
        display="default"
        onChange={handlePickerChange}
      />
    );
  };

  const renderSectionHeader = (title: string, subtitle: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );

  const renderInput = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.inputContainer,
        {
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
      // 🏨 2026-06-29 사용자 SSOT = iOS 키보드 떠 있어도 숙소 자동완성 드롭다운 선택 가능 (= RN 기본 'never' → 첫탭이 키보드닫기에 소비되어 선택 불가 버그). 웹과 동일 동작(입력→드롭다운→선택).
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Icon name="x" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>TRIPIS</Text>
      </View>

      {/* 🎵 BTS 콘서트 투어 배너 */}
      <Pressable
        testID="bts-concert-planner-banner"
        accessibilityRole="button"
        accessibilityLabel="BTS 콘서트 투어 플래너"
        style={{
          marginHorizontal: 16,
          marginBottom: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: "#1a1025",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(139,92,246,0.3)",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
        onPress={() => (navigation as any).navigate("BTSLanding")} // ⚠️ 수정금지(승인필요) — 배너→BTS 랜딩(18KB) 연결
      >
        {/* ⚠️ 2026-06-24 = 💜 이모지 제거 → Lucide heart (= 디자인 SSOT §1-3 이모지금지 / §8 Lucide만, ICON_MAP 기존 Heart 사용 = 보호파일 미변경). 보라색 = BTS 보라해 유지 */}
        <Icon name="heart" size={24} color="#A78BFA" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#A78BFA", fontFamily: "Pretendard-Bold", fontSize: 14 }}>
            {t("trip.btsBanner")}
          </Text>
          <Text style={{ color: "#6B7280", fontFamily: "Pretendard-Medium", fontSize: 11, marginTop: 2 }}>
            {t("trip.btsBannerSub")}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color="#8B5CF6" />
      </Pressable>

      {/* 🗺️ 목적지 (자유 입력 — 한글/영어 OK, DB city-resolver가 매칭) */}
      <View style={[styles.section, { zIndex: 20 }]}>
        <View style={[styles.inputBox, { backgroundColor: theme.backgroundDefault }]}>
          <Icon name="map-pin" size={20} color={Brand.primary} />
          <TextInput
            style={[styles.textInput, { color: theme.text }]}
            value={formData.destination}
            onChangeText={(text) =>
              setFormData((prev) => ({
                ...prev,
                destination: text,
                destinationCoords: undefined,
                ...(text ? {} : {
                  accommodationName: undefined,
                  accommodationAddress: undefined,
                  accommodationCoords: undefined,
                  accommodationPlaceId: undefined,
                }),
              }))
            }
            placeholder={t("trip.destinationPlaceholder")}
            placeholderTextColor={theme.textTertiary}
          />
        </View>
        <Text style={[styles.sectionSubtitle, { color: theme.textTertiary, marginTop: 4, marginLeft: 4 }]}>
          {t("trip.destinationHint")}
        </Text>
      </View>

      {/* 🏨 숙소 (선택적) = 구글 공식 위젯(PlaceAutocompleteElement) WebView. 자체 입력창+드롭다운 폐기(§19). */}
      <View style={[styles.section, { zIndex: 15 }]}>
        {/* 🏨 2026-06-29 = includedPrimaryTypes 미지정 = 호텔+주소+에어비앤비 주소 전부 검색(옛 lodging단독=호텔만 나오던 버그 폐기). */}
        <PlaceAutocompleteWidget
          placeholder={t("trip.accommodation")}
          language={i18n.language || "ko"}
          // 🏨 2026-06-29 = 도시명 prefill(구글맵 방식) = 입력 도시 "Paris " → 사용자가 뒤에 숙소명 = 그 도시만.
          cityPrefix={formData.destination ? `${formData.destination} ` : undefined}
          onSelect={(place: PlaceSelection) => {
            setFormData((prev) => ({
              ...prev,
              accommodationName: place.name,
              accommodationAddress: place.address,
              accommodationCoords: place.coords,
              accommodationPlaceId: place.placeId,
            }));
          }}
        />
        <Text style={[styles.sectionSubtitle, { color: theme.textTertiary, marginTop: 4, marginLeft: 4 }]}>
          {t("trip.accommodationHint")}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("startDate")}
          >
            <Icon name="calendar" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.startDate}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("endDate")}
          >
            <Icon name="calendar" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.endDate}
            </Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("startTime")}
          >
            <Icon name="clock" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.startTime}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.dateBox,
              styles.flex1,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => openPicker("endTime")}
          >
            <Icon name="clock" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>
              {formData.endTime}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.companion"), t("trip.companionHint"))}
        <View style={styles.iconGrid}>
          {COMPANION_OPTIONS.map((option) => {
            const isSelected = formData.companionType === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({
                    ...prev,
                    companionType: option.id,
                    companionCount: option.defaultCount,
                    transportType: option.transportType,
                  }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.curationFocus"), t("trip.curationFocusHint"))}
        <View style={styles.iconGrid}>
          {CURATION_FOCUS_OPTIONS.map((option) => {
            const isSelected = formData.curationFocus === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, curationFocus: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.vibes"), t("trip.vibesHint"))}
        <View style={styles.vibeGrid}>
          {VIBE_OPTIONS.map((vibe) => {
            const isSelected = formData.vibes.includes(vibe.id);
            const selectionIndex = formData.vibes.indexOf(vibe.id);
            const priorityLabels = [t("trip.priorityHighest"), t("trip.priorityHigh"), t("trip.priorityNormal")];
            const priorityLabel =
              selectionIndex >= 0 ? priorityLabels[selectionIndex] : "";
            return (
              <Pressable
                key={vibe.id}
                style={[
                  styles.vibeButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() => toggleVibe(vibe.id)}
              >
                <Icon
                  name={vibe.icon as any}
                  size={22}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.vibeText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(vibe.labelKey)}
                  {priorityLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.travelPace"), t("trip.travelPaceHint"))}
        <View style={styles.toggleRow}>
          {TRAVEL_PACE_OPTIONS.map((option) => {
            const isSelected = formData.travelPace === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, travelPace: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.budget"), t("trip.budgetHint"))}
        <View style={styles.iconGrid}>
          {TRAVEL_STYLE_OPTIONS.map((option) => {
            const isSelected = formData.travelStyle === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, travelStyle: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader(t("trip.mobilityStyle"), t("trip.mobilityStyleHint"))}
        <View style={styles.toggleRow}>
          {MOBILITY_STYLE_OPTIONS.map((option) => {
            const isSelected = formData.mobilityStyle === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: isSelected
                      ? Brand.primary
                      : theme.backgroundDefault,
                  },
                ]}
                onPress={() =>
                  setFormData((prev) => ({ ...prev, mobilityStyle: option.id }))
                }
              >
                <Icon
                  name={option.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleText,
                    { color: isSelected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={handleGenerate} style={styles.generateButton}>
        <LinearGradient
          colors={Brand.gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.generateGradient}
        >
          <Icon name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.generateText}>{t("trip.generate")}</Text>
        </LinearGradient>
      </Pressable>
      {renderPicker()}
      {renderWebInputModal()}
    </ScrollView>
  );

  const renderLoading = () => (
    <View
      style={[
        styles.loadingContainer,
        { backgroundColor: theme.backgroundRoot },
      ]}
    >
      <View
        style={[
          styles.loadingIconBox,
          { backgroundColor: `${Brand.primary}15` },
        ]}
      >
        <Animated.View
          style={
            Platform.OS === "web"
              ? styles.webSpinner
              : { transform: [{ rotate: spin }] }
          }
        >
          <View style={[styles.spinnerRing, { borderColor: Brand.primary }]} />
        </Animated.View>
        <Icon
          name="navigation"
          size={32}
          color={Brand.primary}
          style={styles.loadingIcon}
        />
      </View>
      <Text style={[styles.loadingTitle, { color: theme.text }]}>TRIPIS</Text>
      <Text style={[styles.loadingMessage, { color: theme.textSecondary }]}>
        {LOADING_MESSAGES[loadingStep]}
      </Text>
    </View>
  );

  const renderResult = () => {
    if (!itinerary) return null;

    return (
      <View
        style={[
          styles.resultContainer,
          { backgroundColor: theme.backgroundRoot },
        ]}
      >
        <View
          style={[styles.resultHeader, { paddingTop: insets.top + Spacing.sm }]}
        >
          <Pressable
            onPress={() => setScreen("Input")}
            style={styles.headerButton}
          >
            <Icon name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.resultTitle, { color: theme.text }]}>
            {itinerary.destination}
          </Text>
          <Pressable
            style={[
              styles.headerButton,
              savedItineraryId && { backgroundColor: "#22c55e" },
            ]}
            onPress={handleSaveItinerary}
            disabled={isSaving || !!savedItineraryId}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Icon
                name={savedItineraryId ? "check" : "save"}
                size={22}
                color={savedItineraryId ? "#FFFFFF" : theme.text}
              />
            )}
          </Pressable>
        </View>

        {/* 🚨 위기 경보 배너 - 깜박이는 표시 */}
        {itinerary.crisisAlerts && itinerary.crisisAlerts.length > 0 && (
          <CrisisAlertBanner
            alerts={itinerary.crisisAlerts}
            onPress={() => {
              const alertMessages = itinerary
                .crisisAlerts!.slice(0, 5)
                .map(
                  (a) =>
                    `• ${a.titleKo || a.title}\n  ${a.date}${a.endDate ? ` ~ ${a.endDate}` : ""}\n  ${a.recommendationKo || a.recommendation}`,
                )
                .join("\n\n");
              Alert.alert(
                `${itinerary.destination} ${t("trip.crisisTitle")}`,
                `${itinerary.crisisAlerts!.length}개의 주의사항:\n\n${alertMessages}`,
                [{ text: t("common.confirm"), style: "default" }],
              );
            }}
          />
        )}

        {/* 📊 요약 섹션 1: 날짜 + 장소수 + 총예산 */}
        <View
          style={[
            styles.tripSummaryRow,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <View style={styles.tripSummaryItem}>
            <Icon name="calendar" size={14} color={theme.textSecondary} />
            <Text style={[styles.tripSummaryText, { color: theme.text }]}>
              {itinerary.startDate} ~ {itinerary.endDate}
            </Text>
          </View>
          <View style={styles.tripSummaryItem}>
            <Icon name="map-pin" size={14} color={theme.textSecondary} />
            <Text style={[styles.tripSummaryText, { color: theme.text }]}>
              {t("common.places", { count: (itinerary.days || []).reduce(
                (sum, d) => sum + (d.places?.length || 0),
                0,
              ) })}
            </Text>
          </View>
          {(() => {
            // 일별 dailyCost 합산으로 총 비용 계산
            const totalPerPerson = (itinerary.days || []).reduce(
              (sum: number, d: any) => sum + (d.dailyCost?.perPersonEur || 0),
              0,
            );
            if (totalPerPerson > 0) {
              return (
                <View style={styles.tripSummaryItem}>
                  <Icon name="credit-card" size={14} color={Brand.primary} />
                  <Text
                    style={[
                      styles.tripSummaryText,
                      { color: Brand.primary, fontFamily: Fonts.bold },
                    ]}
                  >
                    {t("common.perPerson")} €{totalPerPerson.toFixed(0)}
                  </Text>
                </View>
              );
            }
            return null;
          })()}
        </View>

        {/* 📊 요약 섹션 2: "누구를 위한 X 여행" + 예상 비용 */}
        <View
          style={[
            styles.tripOptionsRow,
            { backgroundColor: `${Brand.primary}08` },
          ]}
        >
          <View style={styles.tripDescriptionContainer}>
            <Text style={[styles.tripDescriptionText, { color: theme.text }]}>
              {(() => {
                // 🎯 누구를 위한 (curationFocus 기반)
                const focusLabels: Record<string, string> = {
                  Kids: t("labels.curationKids"),
                  Parents: t("labels.curationParents"),
                  Everyone: t("labels.curationEveryone"),
                  Self: t("labels.curationSelf"),
                };
                const curationFocus =
                  (itinerary as any).metadata?.curationFocus ||
                  formData.curationFocus ||
                  "Everyone";
                const focusLabel = focusLabels[curationFocus] || t("labels.curationEveryone");

                const companionLabels: Record<string, string> = {
                  Single: t("labels.companionSingle"),
                  Couple: t("labels.companionCouple"),
                  Family: t("labels.companionFamily"),
                  ExtendedFamily: t("labels.companionExtended"),
                  Group: t("labels.companionGroup"),
                };
                const companionType =
                  itinerary.companionType || formData.companionType || "Couple";
                const companionLabel = companionLabels[companionType] || t("labels.companionFamily");

                // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = 선택한 vibe 전부 표시(최대 3개). 옛 slice(0,2)(상위 2개만) 폐기(§19) = 3번째 선호도 누락 버그 수정.
                const vibes =
                  itinerary.vibeWeights
                    ?.slice(0, 3)
                    .map((v) => getVibeLabel(v.vibe))
                    .join(" & ") || "힐링";

                // 예: "가족(4명)의 부모님을 위한 힐링 & 미식 여행" (이모지 금지 = 디자인 SSOT §1-3)
                const count =
                  itinerary.companionCount || formData.companionCount || 2;
                // ⚠️ 수정금지(승인필요) 2026-06-24 = 한국어 조사(을/를) 받침 판정 = focusLabel 마지막 글자 받침 유무
                //   = "나을"(X) 버그 수정 → 받침 없으면 "를", 있으면 "을" (= 한국어 언어에서만 적용, 타 언어는 조사 없음)
                const lastChar = focusLabel.charCodeAt(focusLabel.length - 1);
                const hasFinalConsonant =
                  lastChar >= 0xac00 && lastChar <= 0xd7a3 && (lastChar - 0xac00) % 28 !== 0;
                const objParticle = hasFinalConsonant ? "을" : "를";
                return `${companionLabel}(${count}명)의 ${focusLabel}${objParticle} 위한 ${vibes} 여행`;
              })()}
            </Text>
            {/* ⚠️ 2026-06-24 사용자 SSOT = 1인 가격 배지 삭제 (요약섹션1 "1인 €N"과 중복, §19 완전삭제) */}
          </View>
        </View>

        {/* ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = 지도 고정섹션(항상표시, 토글폐기 §19) = BTS 패턴.
            전 슬롯 마커 + 마커클릭→슬롯 스크롤 + 출발 깃발(숙소 미설정=도심중심 / 설정=숙소). 동선 polyline 폐기. */}
        <View style={styles.mapSection}>
          <ItineraryMap
            places={(() => {
              // 🗺️ 지도 = 스크롤로 보이는 현재 Day(currentMapDay)의 슬롯만 표시
              const day = (itinerary.days || []).find((d) => d.day === currentMapDay) || itinerary.days?.[0];
              // ⚠️ slot 번호 = 카드 번호(index+1)와 일치 = 좌표결손 거르기 전에 index 매김 (마커배지≠카드번호 버그 방지)
              return (day?.places || [])
                .map((p, i) => ({
                  id: String(p.id),
                  name: (p as any).nameLocal || p.name,
                  seedCategory: (p as any).seedCategory || null,
                  lat: p.lat,
                  lng: p.lng,
                  slot: i + 1,
                }))
                .filter((p) => p.lat != null && p.lng != null);
            })()}
            start={(() => {
              // 출발 깃발 = 현재 Day(currentMapDay) 숙소 ?? 도시중심(destinationCoords)
              const dayAccom =
                dayAccommodations.find((a) => a.day === currentMapDay) ||
                ((itinerary.days || []).find((d) => d.day === currentMapDay) as any)?.accommodation;
              if (dayAccom?.coords?.lat) {
                return { lat: dayAccom.coords.lat, lng: dayAccom.coords.lng, label: `${t("trip.departure")}: ${dayAccom.name}` };
              }
              const c = formData.destinationCoords;
              if (c?.lat) return { lat: c.lat, lng: c.lng, label: `${t("trip.departure")}: ${t("trip.departureCityCenter", { destination: itinerary.destination })}` };
              return null;
            })()}
            onMarkerPress={(id) => {
              // 마커 클릭 → 그 슬롯으로 스크롤 + 선택 강조(양방향)
              setSelectedSlotId(id);
              const y = slotLayoutsRef.current[id];
              if (y != null) resultScrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
            }}
            selectedSlotId={selectedSlotId}
            height={Math.min(260, Dimensions.get("window").height * 0.3)}
          />
        </View>

        <ScrollView
          ref={resultScrollRef}
          style={styles.resultScrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={100}
          onScroll={(e) => {
            // 🗺️ 스크롤 위치 기준 = 화면 상단에 보이는 Day 감지 → 지도 그 Day로 자동 전환
            const y = e.nativeEvent.contentOffset.y + 100; // 지도 높이만큼 보정
            let day = 1;
            for (const [d, top] of Object.entries(dayLayoutsRef.current)) {
              if (y >= top) day = Number(d);
            }
            if (day !== currentMapDay) setCurrentMapDay(day);
          }}
        >
          {/* 재최적화 중 로딩 */}
          {isReoptimizing && (
            <View
              style={[
                styles.reoptimizeBar,
                { backgroundColor: `${Brand.primary}10` },
              ]}
            >
              <ActivityIndicator size="small" color={Brand.primary} />
              <Text style={[styles.reoptimizeText, { color: Brand.primary }]}>
                {t("trip.reoptimizing")}
              </Text>
            </View>
          )}

          {/* 🗓️ 전체 날짜 세로 나열 (한 페이지 스크롤) */}
          {(itinerary.days || []).map((currentDay, dayIdx) => {
            const places = currentDay?.places || [];
            return (
              <View
                key={dayIdx}
                // 🗺️ 2026-06-28 = Day별 시작 y 기록 (= 스크롤 감지로 지도 Day 자동 전환)
                onLayout={(e) => {
                  dayLayoutsRef.current[currentDay.day] = e.nativeEvent.layout.y;
                }}
              >
                {/* Day 구분 헤더 */}
                <View
                  style={[
                    styles.dayHeaderBanner,
                    { backgroundColor: `${Brand.primary}12` },
                  ]}
                >
                  <View
                    style={[
                      styles.dayHeaderBadge,
                      { backgroundColor: Brand.primary },
                    ]}
                  >
                    <Text style={styles.dayHeaderBadgeText}>
                      Day {currentDay.day}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.dayHeaderTheme, { color: theme.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {(currentDay as any).theme || ""}
                    </Text>
                    {currentDay.city && (
                      <Text
                        style={[
                          styles.dayHeaderCity,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {currentDay.city}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={[
                      styles.accommodationButton,
                      { backgroundColor: Brand.primary },
                    ]}
                    onPress={() => setHotelModalDay(currentDay?.day || 1)}
                  >
                    <Icon name="home" size={12} color="#FFFFFF" />
                    <Text style={styles.accommodationButtonText}>
                      {dayAccommodations.find(
                        (a) => a.day === currentDay?.day,
                      ) || currentDay?.accommodation
                        ? t("trip.accommodationSet")
                        : t("trip.accommodationSetup")}
                    </Text>
                  </Pressable>
                </View>

                {/* 출발 정보 */}
                <View
                  style={[
                    styles.accommodationBar,
                    {
                      backgroundColor: `${Brand.primary}06`,
                      borderColor: `${Brand.primary}15`,
                      marginHorizontal: 12,
                      marginBottom: 4,
                      borderRadius: 8,
                    },
                  ]}
                >
                  <View style={styles.accommodationInfo}>
                    <Icon name="home" size={14} color={Brand.primary} />
                    <Text
                      style={[
                        styles.accommodationText,
                        { color: theme.textSecondary, fontSize: 12 },
                      ]}
                      numberOfLines={1}
                    >
                      {(() => {
                        const dayAccom = dayAccommodations.find(
                          (a) => a.day === currentDay?.day,
                        );
                        const generalAccom = currentDay?.accommodation;
                        if (dayAccom) return `${t("trip.departure")}: ${dayAccom.name}`;
                        if (generalAccom?.name)
                          return `${t("trip.departure")}: ${generalAccom.name}`;
                        return `${t("trip.departure")}: ${t("trip.departureCityCenter", { destination: itinerary.destination })}`;
                      })()}
                    </Text>
                    {currentDay?.departureTransit && (
                      <Text
                        style={[
                          styles.accommodationTransit,
                          { color: theme.textSecondary },
                        ]}
                      >
                        → {currentDay.departureTransit.durationText}
                      </Text>
                    )}
                  </View>
                </View>

                {/* 🏨 2026-06-29 사용자 SSOT = 인앱 모달 폐기(§19) → "숙소 설정" 버튼 누르면 그 자리에 구글 공식 위젯 인라인 표시.
                    선택 → handleSetDayAccommodation(동선 재최적화 + dayAccommodations) → 출발바에 숙소명 + 지도 깃발 자동. */}
                {hotelModalDay === currentDay?.day && (
                  <View style={{ marginHorizontal: 12, marginBottom: 8, zIndex: 50 }}>
                    {/* 🏨 2026-06-29 = includedPrimaryTypes 미지정 = 호텔+주소 전부 검색 (옛 lodging단독=호텔만 버그 폐기). */}
                    <PlaceAutocompleteWidget
                      placeholder={t("trip.hotelSearchPlaceholder")}
                      language={i18n.language || "ko"}
                      // 🏨 2026-06-29 = 도시명 prefill(구글맵 방식) = 그 도시 "Paris " → 사용자가 뒤에 숙소명 = 그 도시만.
                      cityPrefix={itinerary?.destination ? `${itinerary.destination} ` : undefined}
                      onSelect={(place: PlaceSelection) => {
                        handleSetDayAccommodation(currentDay.day, place);
                        setHotelModalDay(null);
                      }}
                    />
                  </View>
                )}

                <View
                  style={styles.placesList}
                  onLayout={(e) => {
                    placesListOffsetRef.current[currentDay.day] = e.nativeEvent.layout.y;
                  }}
                >
                  {places.map((place, index) => {
                    // ⚠️ 수정금지(승인필요) 2026-05-09 = 별점(vibeScore) 폐기 = userRatingCount(rc) 만 사용 (= 사용자 SSOT)

                    // 🍽️ 식사 슬롯 여부 (백엔드에서 isMealSlot 제공 - 1순위)
                    const isMealSlot = place.isMealSlot === true;
                    const mealType = place.mealType; // 'lunch' | 'dinner'

                    // 식사 여부 (isMealSlot 또는 이름으로 판단)
                    const isMeal =
                      isMealSlot ||
                      place.isMeal ||
                      place.name?.includes("점심") ||
                      place.name?.includes("저녁") ||
                      place.name?.includes("아침") ||
                      place.name?.includes("식사") ||
                      place.name?.includes("카페") ||
                      place.name?.includes("레스토랑");

                    // 이동 구간 정보 (백엔드에서 제공)
                    const dayTransits = currentDay?.transit?.transits || [];
                    const transitInfo = dayTransits[index]; // index번째 장소에서 다음 장소로의 이동
                    const hasTransit = index < places.length - 1;

                    // 인원수 (itinerary에서 가져오기)
                    const companionCount = itinerary.companionCount || 1;

                    // 가격 정보
                    const entranceFee = place.entranceFee || 0;
                    const entranceFeeTotal =
                      place.entranceFeeTotal || entranceFee * companionCount;

                    return (
                      <View
                        key={place.id}
                        // 🗺️ 2026-06-28 = 지도 마커 클릭 → 이 슬롯으로 스크롤 (= ScrollView 기준 절대 y 기록)
                        onLayout={(e) => {
                          const dayY = dayLayoutsRef.current[currentDay.day] ?? 0;
                          const listY = placesListOffsetRef.current[currentDay.day] ?? 0;
                          slotLayoutsRef.current[String(place.id)] = dayY + listY + e.nativeEvent.layout.y;
                        }}
                      >
                        {/* 장소 카드 */}
                        <View style={styles.placeItem}>
                          {/* 타임라인 좌측 - 🍽️ 식사 슬롯은 주황색 강조 */}
                          <View style={styles.timelineLeft}>
                            <View
                              style={[
                                styles.placeNumber,
                                {
                                  backgroundColor: isMealSlot
                                    ? "#FF6B35"
                                    : isMeal
                                      ? "#FFA500"
                                      : Brand.primary,
                                },
                              ]}
                            >
                              <Text style={styles.placeNumberText}>
                                {index + 1}
                              </Text>
                            </View>
                            {hasTransit && (
                              <View
                                style={[
                                  styles.timelineLine,
                                  { backgroundColor: theme.border },
                                ]}
                              />
                            )}
                          </View>

                          {/* 🗺️ 2026-06-28 사용자 SSOT = 카드 탭 분리(충돌해소): 썸네일 터치=외부 구글맵 / 슬롯 본문 터치=지도 그 마커 포커스. 카드 전체 Pressable 폐기(§19). */}
                          <View
                            style={[
                              styles.placeCard,
                              {
                                backgroundColor: theme.backgroundDefault,
                                borderLeftWidth: isMealSlot ? 3 : 0,
                                borderLeftColor: "#FF6B35",
                              },
                            ]}
                          >
                            <View style={styles.placeCardContent}>
                              {/* 썸네일 이미지 = 터치 시 외부 Google Maps 앱 호출 (= openPlaceInMaps) */}
                              {/* ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 SSOT = resolveImageSource (= UA + bucket + Platform 분기) */}
                              <Pressable
                                style={styles.placeThumbnail}
                                onPress={() => openPlaceInMaps(place)}
                              >
                                {place.image ? (
                                  <Image
                                    source={resolveImageSource(place.image, "card")}
                                    style={styles.placeThumbnailImage}
                                    contentFit="cover"
                                    priority="normal"
                                    cachePolicy="memory-disk"
                                    transition={150}
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.placeThumbnailPlaceholder,
                                      {
                                        backgroundColor: isMealSlot
                                          ? "#FFF5F0"
                                          : theme.backgroundSecondary,
                                      },
                                    ]}
                                  >
                                    {/* ⚠️ 수정금지(승인필요) 2026-05-19 = BTS 맵 마커 SVG 동일 사용 (= 사전 빌드 lookup) */}
                                    {(() => {
                                      const cat = (place as any).seedCategory || (isMealSlot || isMeal ? 'restaurant' : null);
                                      const svg = cat ? BTS_PLACEHOLDER_SVG_BY_CAT[cat] : null;
                                      return svg ? (
                                        <SvgXml xml={svg} width={40} height={40} />
                                      ) : (
                                        <Icon
                                          name={isMealSlot || isMeal ? "coffee" : "map-pin"}
                                          size={20}
                                          color={isMealSlot ? "#FF6B35" : theme.textTertiary}
                                        />
                                      );
                                    })()}
                                  </View>
                                )}
                              </Pressable>

                              {/* ⚠️ 수정금지(승인필요) 2026-06-24 사용자 SSOT = 슬롯 6요소 + 순서 고정 = ①로컬네임(메인) ②한국이름(보조) ③시간 ④구글리뷰 ⑤한줄요약(editorial_summary, 차별화) ⑥가격(필수). 그외 노출·구글맵힌트줄 완전삭제(§19). */}
                              {/* 🗺️ 2026-06-28 = 슬롯 본문 터치 = 지도 그 마커 포커스(선택) = 양방향 연동. (썸네일 터치만 외부 구글맵) */}
                              <Pressable
                                style={styles.placeInfo}
                                onPress={() => setSelectedSlotId(String(place.id))}
                              >
                                {/* ① 로컬네임 (메인 = 크게) + 식사 프리픽스 */}
                                <View style={styles.placeHeader}>
                                  <Text
                                    style={[
                                      styles.placeName,
                                      { color: theme.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {isMealSlot
                                      ? mealType === "lunch"
                                        ? `[${t("trip.lunch")}] `
                                        : `[${t("trip.dinner")}] `
                                      : ""}
                                    {(place as any).nameLocal || place.name}
                                  </Text>
                                </View>
                                {/* ② 한국이름 (보조 = 작게) */}
                                {(() => {
                                  const localName = (place as any).nameLocal || place.name;
                                  const koName = (place as any).nameKo;
                                  return koName && koName !== localName ? (
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        color: theme.textTertiary,
                                        marginBottom: 2,
                                      }}
                                    >
                                      {koName}
                                    </Text>
                                  ) : null;
                                })()}

                                {/* ③ 시간 */}
                                <View style={styles.placeTimeRow}>
                                  <Icon
                                    name="clock"
                                    size={12}
                                    color={theme.textSecondary}
                                  />
                                  <Text
                                    style={[
                                      styles.placeTimeText,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {place.startTime} - {place.endTime}
                                  </Text>
                                </View>

                                {/* ④ 구글리뷰 (별점 폐기 = RC만, 사용자 SSOT) */}
                                {(place as any).userRatingCount > 0 ? (
                                  <View style={styles.placeStars}>
                                    <Icon name="star" size={12} color={theme.textSecondary} />
                                    <Text style={styles.placeStarsText}>
                                      {t("trip.googleReviews")} {(place as any).userRatingCount.toLocaleString()}
                                    </Text>
                                  </View>
                                ) : null}

                                {/* ⑤ 한줄요약 = editorial_summary 단일 (차별화 포인트). 옛 description·geminiReason·personaFitReason·summaryKo 노출 완전삭제(§19). summary_ko = 숏폼 재료 = 별도 보전. */}
                                {!!(place as any).editorialSummary && (
                                  <Text
                                    style={[
                                      styles.placeReason,
                                      { color: theme.textSecondary },
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {(place as any).editorialSummary}
                                  </Text>
                                )}

                                {/* ⑥ 가격 (슬롯마다 필수 = 맨 아래) = 식사비 또는 입장료 */}
                                <View style={styles.placePriceRow}>
                                  <Icon
                                    name={isMeal ? "credit-card" : "tag"}
                                    size={12}
                                    color={Brand.primary}
                                  />
                                  <Text
                                    style={[
                                      styles.placePriceText,
                                      { color: Brand.primary },
                                    ]}
                                  >
                                    {isMeal
                                      ? `식사: €${place.mealPrice || "??"}`
                                      : (place as any).estimatedPriceEur > 0 &&
                                        (place as any).estimatedPriceEur < 500
                                        ? `€${(place as any).estimatedPriceEur}`
                                        : entranceFee > 0 && entranceFee < 500
                                          ? `€${entranceFee}`
                                          : `${place.priceEstimate || t("common.free")}`}
                                  </Text>
                                </View>
                              </Pressable>
                            </View>
                          </View>
                        </View>

                        {/* 🚇 이동 구간 표시 */}
                        {hasTransit && transitInfo && (
                          <View style={styles.transitSection}>
                            <View
                              style={[
                                styles.transitLine,
                                { backgroundColor: theme.border },
                              ]}
                            />
                            <View
                              style={[
                                styles.transitCard,
                                { backgroundColor: theme.backgroundSecondary },
                              ]}
                            >
                              <Icon
                                name="navigation"
                                size={14}
                                color={theme.textSecondary}
                              />
                              <Text
                                style={[
                                  styles.transitText,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {(() => {
                                  // ⚠️ 2026-06-06 = mode 정규화 + 라벨 mode 파생 (= "항상 도보" 버그 수정)
                                  const rawMode =
                                    transitInfo.mode ||
                                    transitInfo.modeLabel ||
                                    "walk";
                                  const isGuide =
                                    rawMode === "guide" ||
                                    rawMode === "private_guide"; // 전용차 정규화
                                  const mode = isGuide ? "guide" : rawMode;
                                  // ⚠️ 2026-06-24 = 🚗🚇🚌🚶 이모지 제거 (= 디자인 SSOT §1-3 이모지금지). 앞의 navigation Lucide 아이콘 + label 텍스트로 수단 구분.
                                  const label = isGuide
                                    ? t("trip.guideVehicle")
                                    : mode === "metro"
                                      ? t("trip.metro")
                                      : transitInfo.modeLabel || t("trip.walking");
                                  const dur =
                                    transitInfo.durationText ||
                                    `${transitInfo.duration || 0}분`;
                                  const dist = transitInfo.distance
                                    ? `${(transitInfo.distance / 1000).toFixed(1)}km`
                                    : "";
                                  // A타입(전용차): 구간 비용 안 보여줌(= 일 총합에 ÷인원) / B타입: 구간별 1인 비용
                                  if (isGuide) {
                                    return `${label} ${dur}${dist ? ` · ${dist}` : ""}`;
                                  }
                                  const cost = transitInfo.cost || 0;
                                  return `${label} ${dur}${dist ? ` · ${dist}` : ""}${cost > 0 ? ` · €${cost.toFixed(2)}` : ""}`;
                                })()}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.transitLine,
                                { backgroundColor: theme.border },
                              ]}
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* 🏨 숙소 복귀 정보 */}
                {currentDay?.returnTransit && (
                  <View
                    style={[
                      styles.accommodationBar,
                      {
                        backgroundColor: `${Brand.primary}05`,
                        borderColor: `${Brand.primary}15`,
                        marginTop: 8,
                        marginHorizontal: 12,
                        borderRadius: 8,
                      },
                    ]}
                  >
                    <View style={styles.accommodationInfo}>
                      <Icon
                        name="arrow-left"
                        size={14}
                        color={theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.accommodationTransit,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {currentDay.returnTransit.from} → {t("trip.returnToHotel")} (
                        {currentDay.returnTransit.durationText})
                      </Text>
                    </View>
                  </View>
                )}

                {/* 📊 일별 합계 섹션 + 교통비 카테고리 표시 */}
                {(() => {
                  // 백엔드 dailyCost에서 직접 읽기
                  const dc = (currentDay as any)?.dailyCost;
                  const td = (currentDay as any)?.transportDisplay;
                  const entranceEur = dc?.breakdown?.entranceEur || 0;
                  const mealEur = dc?.breakdown?.mealEur || 0;
                  const transportEur = dc?.breakdown?.transportEur || 0;
                  const totalEur =
                    dc?.perPersonEur || entranceEur + mealEur + transportEur;
                  return (
                    <View
                      style={[
                        styles.dailyTotalSection,
                        { backgroundColor: theme.backgroundSecondary },
                      ]}
                    >
                      {/* 교통비 카테고리 표시 (A/B 분기) */}
                      {td && (
                        <View
                          style={{
                            backgroundColor:
                              td.category === "guide" ? "#E3F2FD" : "#E8F5E9",
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontFamily: Fonts.bold,
                              color:
                                td.category === "guide" ? "#1565C0" : "#2E7D32",
                              marginBottom: 4,
                            }}
                          >
                            {td.category === "guide"
                              ? t("trip.guideTransport")
                              : t("trip.publicTransport")}{" "}
                            · 1인 €{td.perPersonPerDay}/일
                          </Text>
                          {td.category === "guide" &&
                            td.uberBlackComparison && (
                              <Text style={{ fontSize: 11, color: "#666" }}>
                                vs 우버블랙 시간제 1인 €
                                {td.uberBlackComparison.perPersonPerDay}/일
                              </Text>
                            )}
                          {td.category === "transit" && td.guideUpsell && (
                            <Text style={{ fontSize: 11, color: "#666" }}>
                              드라이빙 가이드 이용시 1인 €
                              {td.guideUpsell.perPersonPerDay}/일
                            </Text>
                          )}
                        </View>
                      )}

                      <Text
                        style={[styles.dailyTotalTitle, { color: theme.text }]}
                      >
                        {t("trip.dailySummary", { day: currentDay.day })}
                      </Text>
                      <View style={styles.dailyTotalRow}>
                        <View style={styles.dailyTotalItem}>
                          <Text
                            style={[
                              styles.dailyTotalLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {t("trip.entranceFee")}
                          </Text>
                          <Text
                            style={[
                              styles.dailyTotalValue,
                              { color: theme.text },
                            ]}
                          >
                            €{entranceEur.toFixed(1)}
                          </Text>
                        </View>
                        <View style={styles.dailyTotalItem}>
                          <Text
                            style={[
                              styles.dailyTotalLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {t("trip.mealCost")}
                          </Text>
                          <Text
                            style={[
                              styles.dailyTotalValue,
                              { color: theme.text },
                            ]}
                          >
                            €{mealEur.toFixed(1)}
                          </Text>
                        </View>
                        <View style={styles.dailyTotalItem}>
                          <Text
                            style={[
                              styles.dailyTotalLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {t("trip.transportCost")}
                          </Text>
                          <Text
                            style={[
                              styles.dailyTotalValue,
                              { color: theme.text },
                            ]}
                          >
                            €{transportEur.toFixed(1)}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.dailyTotalGrand,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dailyTotalGrandLabel,
                            { color: theme.text },
                          ]}
                        >
                          {t("trip.dailyTotal")}
                        </Text>
                        <Text
                          style={[
                            styles.dailyTotalGrandValue,
                            { color: Brand.primary },
                          ]}
                        >
                          €{totalEur.toFixed(1)}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Day 구분선 */}
                {dayIdx < (itinerary.days?.length || 1) - 1 && (
                  <View
                    style={{
                      height: 12,
                      backgroundColor: theme.backgroundRoot,
                    }}
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
        {/* 🏨 2026-06-29 = 인앱 숙소 모달 완전삭제(§19) → Day헤더 "숙소 설정" 버튼이 출발바 아래 구글 위젯 인라인 토글로 대체 */}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {screen === "Input" && renderInput()}
      {screen === "Loading" && renderLoading()}
      {screen === "Result" && renderResult()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  inputContainer: { paddingHorizontal: Spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  title: { fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  section: { marginBottom: Spacing.lg },
  sectionHeader: { marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, fontFamily: Fonts.medium },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  textInput: { flex: 1, fontSize: 16, fontFamily: Fonts.semiBold, padding: 0 },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  dateText: { fontSize: 15, fontFamily: Fonts.semiBold },
  row: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  flex1: { flex: 1 },
  iconGrid: { flexDirection: "row", gap: Spacing.sm },
  iconButton: {
    flex: 1,
    minHeight: 70,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
  },
  iconLabel: { fontSize: 11, fontFamily: Fonts.bold, textAlign: "center" },
  vibeGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  vibeButton: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 3,
    minHeight: 70,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
  },
  vibeText: { fontSize: 12, fontFamily: Fonts.semiBold, textAlign: "center" },
  toggleRow: { flexDirection: "row", gap: Spacing.sm },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  toggleText: { fontSize: 13, fontFamily: Fonts.bold, textAlign: "center", flexShrink: 1 },
  generateButton: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginTop: Spacing.lg,
  },
  generateGradient: {
    flexDirection: "row",
    paddingVertical: Spacing.lg,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  generateText: { color: "#FFFFFF", fontSize: 18, fontFamily: Fonts.bold },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerModalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 40,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pickerCancel: { fontSize: 16, fontFamily: Fonts.semiBold },
  pickerTitle: { fontSize: 16, fontFamily: Fonts.bold },
  pickerConfirm: { fontSize: 16, fontFamily: Fonts.bold },
  webPickerModal: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "70%",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  webPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  webPickerScroll: { maxHeight: 350 },
  webPickerOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  webPickerOptionText: { fontSize: 16, fontFamily: Fonts.medium },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  loadingIconBox: {
    width: 96,
    height: 96,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  spinnerRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 32,
    borderWidth: 4,
    borderTopColor: "transparent",
  },
  webSpinner: {},
  loadingIcon: { position: "absolute" },
  loadingTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.xs,
  },
  loadingMessage: { fontSize: 14, fontFamily: Fonts.semiBold },
  // ═══════════════════════════════════════════════════════════════════════════
  // 📱 여정표 출력 화면 스타일 (모바일 최적화)
  // ═══════════════════════════════════════════════════════════════════════════
  resultContainer: { flex: 1 },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    minHeight: 56, // 모바일 터치 영역 확보
  },
  headerButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  resultTitle: { fontSize: 20, fontFamily: Fonts.bold },

  // 📊 요약 섹션 1: 날짜 + 장소수 + 총예산
  tripSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  tripSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tripSummaryText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },

  // 📊 요약 섹션 2: 누구를 위한 X 여행
  tripOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: 4,
  },
  tripOptionBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  tripOptionText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
  },
  tripDescriptionText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    textAlign: "center",
  },
  tripDescriptionContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  // 🗺️ 지도 섹션
  mapSection: {
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },

  // 🎯 Vibe 가중치 요약 (삭제 - tripOptionsRow로 통합)
  vibeWeightsSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: Spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  vibeWeightsSummaryText: { fontSize: 12, fontFamily: Fonts.semiBold },

  // 📅 일자 헤더 (한 페이지 세로 나열 방식)
  dayHeaderBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    gap: 10,
  },
  dayHeaderBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dayHeaderBadgeText: { fontSize: 13, fontFamily: Fonts.bold, color: "#fff" },
  dayHeaderTheme: { fontSize: 14, fontFamily: Fonts.bold },
  dayHeaderCity: { fontSize: 11, marginTop: 1 },
  // (레거시 탭 스타일 보존 - 혹시 다른 곳에서 참조할 경우)
  dayTabsContainer: { paddingVertical: 4 },
  dayTabs: { paddingHorizontal: Spacing.sm, gap: 4 },
  dayTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    minWidth: 70,
    alignItems: "center",
  },
  dayTabText: { fontSize: 14, fontFamily: Fonts.bold },
  dayTabCity: { fontSize: 11, marginTop: 2 },

  // 📜 스크롤 영역
  resultScrollView: { flex: 1 },

  // ✅ CTA 버튼
  summaryBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  summaryText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    lineHeight: 22,
  },

  // 📍 장소 목록
  placesList: { paddingHorizontal: Spacing.sm },
  placeItem: { flexDirection: "row", marginBottom: Spacing.sm }, // 간격 최소화

  // 🔢 타임라인 (좌측 번호)
  timelineLeft: { width: 44, alignItems: "center" },
  placeNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  placeNumberText: { color: "#FFFFFF", fontSize: 15, fontFamily: Fonts.bold },
  timelineLine: { flex: 1, width: 2, marginVertical: Spacing.xs },

  // 🏷️ 장소 카드
  placeCard: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginLeft: 4,
  },
  placeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  placeName: { fontSize: 18, fontFamily: Fonts.bold, flex: 1 },
  scoreBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  scoreText: { fontSize: 14, fontFamily: Fonts.bold },

  // 🕐 시간
  placeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  placeTimeText: { fontSize: 14, fontFamily: Fonts.semiBold },

  // RC(리뷰수) 행 = Lucide star + 텍스트 (= 이모지 제거, 시간행과 동일 패턴)
  placeStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  placeStarsText: { fontSize: 12 },

  // 💰 가격
  placePriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  placePriceText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },

  // 🏷️ Vibe 태그
  vibeTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  vibeTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  vibeTagText: { fontSize: 12, fontFamily: Fonts.bold },

  // 📝 장소 설명
  placeReason: { fontSize: 14, lineHeight: 20 },

  // 🖼️ 장소 카드 내부 레이아웃
  placeCardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  placeThumbnail: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginRight: Spacing.sm,
  },
  placeThumbnailImage: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
  },
  placeThumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  placeInfo: {
    flex: 1,
  },

  // 🚇 이동 구간
  transitSection: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 20,
    marginBottom: Spacing.md,
  },
  transitLine: {
    width: 2,
    height: 20,
  },
  transitCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.sm,
  },
  transitText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
  },

  // 📊 일별 합계
  dailyTotalSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  dailyTotalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.md,
  },
  dailyTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  dailyTotalItem: {
    alignItems: "center",
    flex: 1,
  },
  dailyTotalLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dailyTotalValue: {
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  dailyTotalGrand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  dailyTotalGrandLabel: {
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  dailyTotalGrandValue: {
    fontSize: 20,
    fontFamily: Fonts.bold,
  },
  dailyTotalPerPerson: {
    fontSize: 13,
  },
  // 💾 저장 버튼 스타일
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  saveButtonSaved: {
    backgroundColor: "#22c55e",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  saveHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  // 🏨 숙소 바
  accommodationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  accommodationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  accommodationText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    flex: 1,
  },
  accommodationTransit: {
    fontSize: 12,
  },
  accommodationButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    gap: 4,
    // ⚠️ 수정금지(승인필요) 2026-05-19 = 사용자 사고 (= dd99018 Icon 교체 시 누락) = 버튼 축소 X = 중앙 텍스트 짤림 방지
    flexShrink: 0,
  },
  accommodationButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  // 재최적화 로딩
  reoptimizeBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: BorderRadius.sm,
    gap: 8,
  },
  reoptimizeText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
  // 🏨 숙소 모달 스타일 5종 삭제 = 인앱 모달 폐기로 미사용(§19, 2026-06-29). 구글 위젯 인라인으로 대체.
});
