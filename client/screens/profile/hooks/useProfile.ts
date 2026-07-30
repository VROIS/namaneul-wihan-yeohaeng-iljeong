// 프로필 화면 핵심 훅 = 상태·효과·핸들러 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { useState, useCallback, useEffect, useRef } from "react";
import { useColorScheme, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
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
// 크레딧·결제 = 자기 폴더 API 헬퍼(2026-07-29 §9, docs/2026-07-29 결제·크레딧 구현.md)
import {
  getBalance,
  getTransactions,
  getPricing,
  createCheckout,
  getSessionStatus,
  type CreditTransaction,
  type CreditPricing,
} from "../creditsApi";

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
  const { authUser, authReady, isAuthed, requestLogin } = useMapToggle();

  // 🪙 크레딧 = 서버가 정본. 화면은 조회만 한다(가짜 기본값 금지 = 옛 `?? 150` 폐기 2026-07-29 §9).
  //   null = 아직 못 받음 or 미로그인 → 화면이 "-" 로 표시.
  const [credits, setCredits] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [pricing, setPricing] = useState<CreditPricing | null>(null);
  const [recharging, setRecharging] = useState(false);
  // 충전 중복 실행 즉시 차단용(상태값은 리렌더 뒤에나 반영되므로 잠금에 못 씀)
  const rechargingRef = useRef(false);

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

  // 🪙 잔액·거래내역 재조회 = 로그인 사용자만.
  //   ⚠️ 조회 실패(null/빈배열)면 **직전 값을 그대로 둔다** = 위 loadTrips(:85-90)와 같은 정책 1벌.
  //   비우면 통신이 한 번 끊길 때 잔액이 "-" 로 보여 사용자가 크레딧이 사라진 줄 안다(§22 지적 2026-07-29).
  //   미로그인일 때만 비운다(가짜 숫자 표시 금지).
  const refetchCredits = useCallback(async () => {
    if (!authReady) return;
    if (!authUser?.id) {
      setCredits(null);
      setTransactions([]);
      return;
    }
    const [bal, txs] = await Promise.all([getBalance(), getTransactions(20)]);
    if (!mountedRef.current) return;
    if (bal !== null) setCredits(bal);
    if (txs.length) setTransactions(txs);
  }, [authReady, authUser?.id]);

  // 요금·단가표 = 서버 정본(GET /api/credits/pricing) 1회 조회. 결제 관리 아코디언이 이 값을 표시(하드코딩 금지).
  useEffect(() => {
    getPricing().then((p) => {
      if (mountedRef.current) setPricing(p);
    });
  }, []);

  // ⚠️ 충전 = 스트라이프 결제창을 브라우저로 열기만 한다. 크레딧을 넣는 것은 **서버가 받는 직접 통보(웹훅) 1벌**이라
  //   사용자가 창을 닫아도·폰이 꺼져도 충전은 진행된다 → 딥링크·커스텀 스킴 불필요(2026-07-27 안드로이드 창닫기 함정 회피).
  //
  //   ⚠️⚠️ 결제 완료를 promise 로 기다리지 않는다 = 2026-07-29 §22 발견.
  //     expo-web-browser 타입(WebBrowser.types.d.ts) 실측: `OPENED`=@platform android / `CANCEL`·`DISMISS`=@platform ios.
  //     즉 **안드로이드는 창이 열리는 순간 resolve** 한다 → 그 뒤에 결제 상태를 물으면 당연히 미결제 =
  //     사용자가 카드번호 입력 중인데 "결제가 완료되지 않았습니다" 가 뜨는 오탐이 났다(사장님 삼성폰 = 주 타깃).
  //     그래서 상태는 **한 번만** 보고, 확정(fulfilled)일 때만 알린다. 확정 아니면 아무 단정도 하지 않는다
  //     (웹훅이 정본 = 잠시 뒤 탭 진입 시 useFocusEffect 의 refetchCredits 가 반영).
  const handleRecharge = useCallback(async () => {
    if (!isAuthed) {
      requestLogin();
      return;
    }
    // ⚠️ 즉시 잠금 = ref. 상태값(recharging)으로 막으면 리렌더 전에 두 번 눌려 결제 세션이 2개 만들어진다
    //   (충전 버튼이 크레딧 바·결제 아코디언 두 곳에 있어 실제로 가능, §22 지적).
    if (rechargingRef.current) return;
    rechargingRef.current = true;
    setRecharging(true);
    try {
      const session = await createCheckout();
      if (!session) {
        alert("결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      if (Platform.OS === "web") {
        // 웹 = 같은 창에서 이동. 결제 후 success_url 로 앱 오리진에 복귀 → 화면이 다시 마운트되며 잔액 조회.
        window.location.href = session.url;
        return;
      }

      await WebBrowser.openBrowserAsync(session.url);
      if (!mountedRef.current) return;

      const status = await getSessionStatus(session.sessionId);
      if (!mountedRef.current) return;
      await refetchCredits();

      // 확정된 사실만 말한다. 아직이면 침묵(잔액이 곧 올라간다) = 확인 안 한 것을 확인했다고 말하지 않기.
      if (status?.fulfilled === true) alert("충전이 완료되었습니다.");
    } catch (e) {
      console.error("[Profile] 충전 실패:", e);
      alert("충전 중 오류가 발생했습니다.");
    } finally {
      rechargingRef.current = false;
      if (mountedRef.current) setRecharging(false);
    }
  }, [isAuthed, requestLogin, refetchCredits]);

  // 탭 진입마다 재조회(기존). 크레딧도 같은 트리거로 함께 갱신(§16 = 트리거 1벌 재사용).
  useFocusEffect(
    useCallback(() => {
      loadTrips();
      refetchCredits();
    }, [loadTrips, refetchCredits]),
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
    // 🪙 크레딧·결제 (2026-07-29 §9). refetchCredits 는 이 훅 안에서만 쓰므로 내보내지 않는다(쓰는 데 없는 표면 금지 §0).
    credits,
    transactions,
    pricing,
    recharging,
    handleRecharge,
  };
}

export type ProfileApi = ReturnType<typeof useProfile>;
