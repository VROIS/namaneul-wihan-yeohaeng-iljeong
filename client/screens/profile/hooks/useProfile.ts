// 프로필 화면 핵심 훅 = 상태·효과·핸들러 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { useState, useCallback } from "react";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Colors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import {
  getUserData,
  isAuthenticated,
  clearAuth,
  saveAuth,
  type UserData,
} from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { SavedItinerary } from "../utils";

export function useProfile() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const [persona, setPersona] = useState<"luxury" | "comfort">("comfort");

  // 🗂️ 저장된 일정 목록
  const [savedTrips, setSavedTrips] = useState<SavedItinerary[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  // 👤 사용자 정보
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // ⚠️ 사장님 SSOT 2026-07-14 = 프로필 진입마다 저장여정 목록 refetch (useFocusEffect). 조회 user_id = 로그인 본인(userData.id) = 저장(POST가 본인ID로 저장)과 한 쌍(§19). 옛 'admin' 고정 폐기(§9 잔재).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const loadData = async () => {
        try {
          const authenticated = await isAuthenticated();
          if (cancelled) return;
          setIsAuth(authenticated);

          if (authenticated) {
            const userData = await getUserData();
            if (cancelled) return;
            setUser(userData);

            const response = await apiRequest(
              "GET",
              `/api/users/${encodeURIComponent(userData?.id || "admin")}/itineraries`,
            );
            const trips = await response.json();
            if (cancelled) return;
            setSavedTrips(trips || []);
          } else {
            setSavedTrips([]);
          }
        } catch (error) {
          console.error("[Profile] 로드 오류:", error);
        } finally {
          if (!cancelled) setIsLoadingTrips(false);
        }
      };
      loadData();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 확인 팝업 없이 즉시 삭제(범용 홈페이지 닫기 버튼처럼). 목록에서 바로 제거(낙관적) + 서버 DELETE. 실패 시 그 항목만 복원.
  const handleDeleteTrip = async (id: number) => {
    const removed = savedTrips.find((t) => t.id === id); // 실패 시 되살릴 항목만 보관
    setSavedTrips((list) => list.filter((t) => t.id !== id)); // 즉시 화면에서 제거
    try {
      await apiRequest("DELETE", `/api/itineraries/${id}`);
    } catch (e) {
      console.error("[Profile] 여정 삭제 실패:", e);
      // 함수형 롤백 = 그 항목만 복원(연속 삭제 시 다른 삭제분 안 건드림). 이미 있으면 무시.
      if (removed) setSavedTrips((list) => (list.some((t) => t.id === id) ? list : [...list, removed]));
    }
  };

  const handleLanguageChange = async (code: string) => {
    await changeLanguageAndPersist(code);
    setShowLanguageModal(false);
    if (user?.id && user.id !== "guest_browse") {
      try {
        await apiRequest("PATCH", `/api/users/${user.id}/preferred-language`, {
          preferredLanguage: code,
        });
        setUser((prev) => (prev ? { ...prev, language: code } : null));
        await saveAuth({ ...user!, language: code });
      } catch (e) {
        console.warn("[Profile] 언어 DB 업데이트 실패:", e);
      }
    }
  };

  const handleLogout = async () => {
    await clearAuth();
    setIsAuth(false);
    setUser(null);
    setSavedTrips([]);
    navigation.reset({
      index: 0,
      routes: [{ name: "Main" }],
    });
  };

  const currentLang = SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];

  const stats = [
    { label: t("profile.trips"), value: String(savedTrips.length), icon: "map" },
    {
      label: t("profile.visits"),
      value: String(
        savedTrips.reduce((sum, t) => sum + (t.companionCount || 0), 0),
      ),
      icon: "map-pin",
    },
    { label: t("common.save"), value: String(savedTrips.length), icon: "bookmark" },
  ];

  return {
    theme,
    insets,
    headerHeight,
    tabBarHeight,
    navigation,
    t,
    persona,
    setPersona,
    savedTrips,
    isLoadingTrips,
    user,
    isAuth,
    showLanguageModal,
    setShowLanguageModal,
    handleDeleteTrip,
    handleLanguageChange,
    handleLogout,
    currentLang,
    stats,
  };
}

export type ProfileApi = ReturnType<typeof useProfile>;
