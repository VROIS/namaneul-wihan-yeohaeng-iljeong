import { useState, useCallback, useEffect, useRef } from "react";
import { useColorScheme, Platform, Alert } from "react-native";
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
import { readPaymentReturn } from "@/lib/paymentReturn";
import type { SavedItinerary } from "../utils";
import { useHiddenCards } from "./useHiddenCards";
import {
  getBalance,
  getTransactions,
  getPricing,
  createCheckout,
  createSheetIntent,
  confirmTopup,
  type CreditTransaction,
  type CreditPricing,
} from "../creditsApi";
// 폰 결제 시트 1벌(웹은 스텁) = 2026-08-12 사장님 승인. 열고 → 결제 → 자동 닫힘.
import { paySheet } from "../paymentSheet";

export function useProfile() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  // ⚠️ 수정금지(승인필요) 2026-07-31 = **화면 밖에서 열려도 안 터지게** 한 것.
  //   ("Couldn't find the header height", 사장님 실증 2026-07-31).
  let headerHeight = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    headerHeight = useHeaderHeight();
  } catch {
    headerHeight = 0; // 창으로 열린 경우 = 제목줄이 없음
  }
  let tabBarHeight = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0; // 창으로 열린 경우 = 아래 탭이 없음
  }
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const [persona, setPersona] = useState<"luxury" | "comfort">("comfort");

  const [savedTrips, setSavedTrips] = useState<SavedItinerary[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const { authUser, authReady, isAuthed, requestLogin } = useMapToggle();

  const [credits, setCredits] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [pricing, setPricing] = useState<CreditPricing | null>(null);
  const [recharging, setRecharging] = useState(false);
  const rechargingRef = useRef(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = 로그인 판정은 전역 1곳(MapToggleContext.authUser)만 읽음.
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
      console.error(
        "[Profile] 저장여정 조회 실패(로그인·목록 모두 유지):",
        error,
      );
    } finally {
      if (mountedRef.current) setIsLoadingTrips(false);
    }
  }, [authReady, authUser?.id]);

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

  useEffect(() => {
    getPricing().then((p) => {
      if (mountedRef.current) setPricing(p);
    });
  }, []);

  // ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = 충전 2갈래(화면·클릭 최소 SSOT).
  const handleRecharge = useCallback(async () => {
    if (!isAuthed) {
      requestLogin();
      return;
    }
    if (rechargingRef.current) return;
    rechargingRef.current = true;
    setRecharging(true);
    try {
      if (Platform.OS === "web") {
        const session = await createCheckout();
        if (!session) {
          alert(t("credit.checkoutOpenFailed"));
          return;
        }
        window.location.href = session.url;
        return;
      }

      const key = pricing?.stripePublishableKey;
      if (!key) {
        alert(t("credit.sheetPrepareFailed"));
        return;
      }
      const intent = await createSheetIntent();
      if (!intent) {
        alert(t("credit.sheetStartFailed"));
        return;
      }

      const result = await paySheet(key, intent.clientSecret);
      if (!mountedRef.current) return;
      if (result.status === "failed") {
        // Stripe 가 준 실패 사유 그대로(뭉개기 금지 = 2026-07-31 사장님 지시).
        alert(result.message);
        return;
      }
      if (result.status === "done") {
        // ⚠️ 2026-08-12 사장님 승인 = **즉시 반영**(내손앱과 같은 즉시성) — 시트가 닫히는 순간
        const confirmed = await confirmTopup(intent.intentId);
        if (!mountedRef.current) return;
        refetchCredits();
        if (confirmed.ok) {
          alert(t("credit.topupDone"));
        } else {
          let left = 5;
          const id = setInterval(() => {
            if (!mountedRef.current) return clearInterval(id);
            refetchCredits();
            if (--left <= 0) clearInterval(id);
          }, 2000);
        }
      }
    } catch (e) {
      console.error("[Profile] 충전 실패:", e);
      alert(t("credit.topupError"));
    } finally {
      rechargingRef.current = false;
      if (mountedRef.current) setRecharging(false);
    }
  }, [isAuthed, requestLogin, refetchCredits, pricing]);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
      refetchCredits();
    }, [loadTrips, refetchCredits]),
  );

  // ⚠️ 수정금지(승인필요) 2026-08-06 = **결제하고 막 돌아왔으면 잔액을 잠깐 더 지켜본다.**
  useEffect(() => {
    if (readPaymentReturn() !== "success") return;
    let left = 5;
    const id = setInterval(() => {
      refetchCredits();
      if (--left <= 0) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [refetchCredits]);

  // ⚠️ 2026-08-08 사장님 SSOT = 옛 handleDeleteTrip(DELETE /api/itineraries/:id) 완전삭제 §19.
  const { hiddenKeys, hiddenReady, hideCard } = useHiddenCards(
    authUser?.id,
    authReady,
  );

  // 🏆 대표 올리기(관리자 전용) = 2026-08-02 사장님 지시로 여정 결과화면에서 **이 화면으로 이관**(§19 = 저쪽은 완전삭제).
  const isAdmin = authUser?.role === "admin";
  const [promotingTripId, setPromotingTripId] = useState<number | null>(null);

  //   ⚠️ 실패하면 **서버가 준 사유를 그대로** 보여준다(뭉개서 "다시 시도" 금지 = 2026-07-31 사장님 지시).
  const handleSetRepresentative = async (id: number) => {
    setPromotingTripId(id);
    try {
      await apiRequest("POST", `/api/itineraries/${id}/representative`);
      await loadTrips();
    } catch (e: any) {
      const message = String(e?.message || "");
      const reason = message.match(/"error"\s*:\s*"([^"]*)"/)?.[1] || message;
      Alert.alert("대표 올리기 실패", reason);
    } finally {
      if (mountedRef.current) setPromotingTripId(null);
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
    // ⚠️ 수정금지(승인필요) 2026-07-31 = **창으로 열렸을 때는 화면을 갈아엎지 않는다**(§22 검증 지적).
    const openedAsSheet = headerHeight === 0 && tabBarHeight === 0;
    if (!openedAsSheet) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Main" }],
      });
    }
  };

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 회원 탈퇴.
  const [deletingAccount, setDeletingAccount] = useState(false);

  const runDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await apiRequest("DELETE", "/api/auth/account");
      await clearAuth(); // clearAuth 가 전역 판정에 자동 알림
      setSavedTrips([]);
    } catch (e: any) {
      // 서버가 준 사유를 뭉개지 않는다(2026-07-31 사장님 지시)
      const msg = e?.message || t("profile.deleteFailedGeneric");
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t("profile.deleteFailedTitle"), msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    const dt1 = t("profile.deleteConfirmTitle1");
    const dm1 = t("profile.deleteConfirmMsg1");
    const dt2 = t("profile.deleteConfirmTitle2");
    const dm2 = t("profile.deleteConfirmMsg2");

    if (Platform.OS === "web") {
      if (!window.confirm(`${dt1}\n\n${dm1}`)) return;
      if (!window.confirm(`${dt2}\n\n${dm2}`)) return;
      void runDeleteAccount();
      return;
    }
    Alert.alert(dt1, dm1, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.continue"),
        style: "destructive",
        onPress: () =>
          Alert.alert(dt2, dm2, [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("profile.withdraw"),
              style: "destructive",
              onPress: () => void runDeleteAccount(),
            },
          ]),
      },
    ]);
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
    authReady,
    showLanguageModal,
    setShowLanguageModal,
    isAdmin,
    promotingTripId,
    handleSetRepresentative,
    handleLanguageChange,
    handleLogout,
    hiddenKeys,
    hiddenReady,
    hideCard,
    handleDeleteAccount,
    deletingAccount,
    currentLang,
    stats,
    credits,
    transactions,
    pricing,
    recharging,
    handleRecharge,
  };
}

export type ProfileApi = ReturnType<typeof useProfile>;
