// 프로필 화면 핵심 훅 = 상태·효과·핸들러 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { useState, useCallback, useEffect, useRef } from "react";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Colors } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { apiRequest } from "@/lib/query-client";
import { clearAuth, saveAuth } from "@/lib/auth";
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

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  // 👤 사용자 정보 = 전역 1곳만 읽음(§0). 이 화면이 따로 들고 있던 user/isAuth 상태 완전삭제 §19.
  const { authUser, authReady, isAuthed } = useMapToggle();

  // 언마운트 후 setState 방지 = 두 트리거(focus·authChangedAt) 겹침·비동기 지연 대비 단일 가드(§16 = cancelled 플래그 2벌 대신 1벌).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ⚠️ 사장님 SSOT 2026-07-14 = 저장여정 목록 refetch. 조회 user_id = 로그인 본인(userData.id) = 저장(POST가 본인ID로 저장)과 한 쌍(§19). 옛 'admin' 고정 폐기(§9 잔재).
  //   ⚠️ 2026-07-25 = loadData를 useCallback으로 추출(§16 중복 제거) = useFocusEffect(탭 진입)와 authChangedAt(로그인 팝업 성공) 양쪽에서 재사용.
  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = 로그인 판정은 전역 1곳(MapToggleContext.authUser)만 읽음.
  //   이 화면이 직접 저장소를 읽던 옛 방식 완전삭제 §19 = 저장여정 조회(네트워크) 성공 뒤에야 로그인으로 표시해서,
  //   조회 한 번 실패하면 로그인돼 있는데 "로그인이 필요합니다"가 뜨던 원인. 여기선 목록만 받아온다.
  const loadTrips = useCallback(async () => {
    if (!authReady) return;
    if (!authUser?.id) {
      setSavedTrips([]);
      setIsLoadingTrips(false);
      return;
    }
    try {
      const response = await apiRequest(
        "GET",
        `/api/users/${encodeURIComponent(authUser.id)}/itineraries`,
      );
      const trips = await response.json();
      if (!mountedRef.current) return;
      setSavedTrips(trips || []);
    } catch (error) {
      // ⚠️ 실패해도 **직전 목록을 그대로 둔다**(§22 검증 지적). 비우면 사용자가 여정이 지워진 줄 알고 또 저장함.
      console.error(
        "[Profile] 저장여정 조회 실패(로그인·목록 모두 유지):",
        error,
      );
    } finally {
      if (mountedRef.current) setIsLoadingTrips(false);
    }
  }, [authReady, authUser?.id]);

  // 탭 진입마다 재조회(기존).
  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips]),
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
      if (removed)
        setSavedTrips((list) =>
          list.some((t) => t.id === id) ? list : [...list, removed],
        );
    }
  };

  const handleLanguageChange = async (code: string) => {
    await changeLanguageAndPersist(code);
    setShowLanguageModal(false);
    if (authUser?.id) {
      try {
        await apiRequest(
          "PATCH",
          `/api/users/${authUser.id}/preferred-language`,
          { preferredLanguage: code },
        );
        await saveAuth({ ...authUser, language: code }); // saveAuth 가 전역 판정에 자동 알림
      } catch (e) {
        console.warn("[Profile] 언어 DB 업데이트 실패:", e);
      }
    }
  };

  const handleLogout = async () => {
    await clearAuth(); // clearAuth 가 전역 판정에 자동 알림
    setSavedTrips([]);
    navigation.reset({
      index: 0,
      routes: [{ name: "Main" }],
    });
  };

  const currentLang =
    SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];

  const stats = [
    {
      label: t("profile.trips"),
      value: String(savedTrips.length),
      icon: "map",
    },
    {
      label: t("profile.visits"),
      value: String(
        savedTrips.reduce((sum, t) => sum + (t.companionCount || 0), 0),
      ),
      icon: "map-pin",
    },
    {
      label: t("common.save"),
      value: String(savedTrips.length),
      icon: "bookmark",
    },
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
    user: authUser,
    isAuth: isAuthed,
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
