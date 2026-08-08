// 프로필 화면 핵심 훅 = 상태·효과·핸들러 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { useState, useCallback, useEffect, useRef } from "react";
import { useColorScheme, Platform, Alert } from "react-native";
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
// ⚠️ 결제하고 막 돌아온 부팅인지 = 판별 1벌(§16). 잔액 재확인 시점을 정하는 데 쓴다.
import { readPaymentReturn } from "@/lib/paymentReturn";
import type { SavedItinerary } from "../utils";
// 숨김(X) = 여정·영상·해설 공용 1벌. 이 훅에서 **딱 1번** 부른다(2026-08-08 §22).
import { useHiddenCards } from "./useHiddenCards";
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
  // ⚠️ 수정금지(승인필요) 2026-07-31 = **화면 밖에서 열려도 안 터지게** 한 것.
  //   사고: 이 화면을 BTS 위에 창(모달)으로 띄우면 위쪽 제목줄·아래쪽 탭이 아예 없어서
  //   "그 높이가 얼마냐"고 물어보는 순간 앱이 죽었다
  //   ("Couldn't find the header height", 사장님 실증 2026-07-31).
  //   이 값들은 **여백을 얼마나 줄지 계산하는 데만** 쓰인다. 없으면 0 = 여백 없음 = 화면은 정상.
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

  // ⚠️ 수정금지(승인필요) 2026-08-06 = **결제하고 막 돌아왔으면 잔액을 잠깐 더 지켜본다.**
  //   왜: 충전을 확정하는 것은 스트라이프의 **통보**인데(§9), 그 통보가 화면 복귀보다 늦게 올 수 있다.
  //   그러면 프로필이 **충전 전 잔액**을 그대로 보여주고, 탭을 나갔다 들어오기 전까지 안 바뀐다
  //   → 방금 €10 을 낸 사람이 "충전이 안 됐다"고 여겨 **또 결제**할 수 있다(§22 판단검증 지적).
  //   그래서 복귀 직후 몇 초만 다시 확인한다(2초 간격 5회 = 10초). 잔액이 오르면 화면이 스스로 바뀐다.
  //   폰은 이 자리가 필요 없다 = 앱 안 브라우저를 닫는 순간 위 handleRecharge 가 이미 확인한다.
  useEffect(() => {
    if (readPaymentReturn() !== "success") return;
    let left = 5;
    const id = setInterval(() => {
      refetchCredits();
      if (--left <= 0) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [refetchCredits]);

  // ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 확인 팝업 없이 즉시 삭제(범용 홈페이지 닫기 버튼처럼). 목록에서 바로 제거(낙관적) + 서버 DELETE. 실패 시 그 항목만 복원.
  // ⚠️ 2026-08-08 사장님 SSOT = 옛 handleDeleteTrip(DELETE /api/itineraries/:id) 완전삭제 §19.
  //   X 는 화면에서만 감춘다 = DB 는 무조건 남긴다.
  //   ⚠️ 훅은 **여기서 딱 1번만** 부른다(§22 판단검증 지적). 섹션마다 부르면 같은 저장소 열쇠를
  //     서로 다른 목록으로 덮어써, 여정 X → 영상 X 순서로 누르면 앞의 숨김이 사라진다.
  const { hiddenKeys, hiddenReady, hideCard } = useHiddenCards(
    authUser?.id,
    authReady,
  );

  // 🏆 대표 올리기(관리자 전용) = 2026-08-02 사장님 지시로 여정 결과화면에서 **이 화면으로 이관**(§19 = 저쪽은 완전삭제).
  //   관리자 판정 = 전역 계정 1벌의 role 만 본다(§9 표7 = 아이디 문자열·is_admin 으로 판단 금지).
  const isAdmin = authUser?.role === "admin";
  // 지금 대표로 올리는 중인 여정 번호 = 그 카드의 별만 스피너가 된다. null = 없음.
  const [promotingTripId, setPromotingTripId] = useState<number | null>(null);

  // 🏆 POST /api/itineraries/:id/representative 1벌 호출(2026-08-01 만든 라우트 그대로 = §16 재발명 0).
  //   같은 도시의 옛 대표를 내리는 일은 **서버 트랜잭션이 이미 한다** = 화면에서 따로 내리지 않는다(§0 = 로직 1벌).
  //   성공하면 목록만 다시 읽는다 = 어느 카드가 대표인지는 서버가 준 status 가 정한다(화면이 지어내지 않음).
  //   ⚠️ 실패하면 **서버가 준 사유를 그대로** 보여준다(뭉개서 "다시 시도" 금지 = 2026-07-31 사장님 지시).
  //     apiRequest 는 실패를 `"<상태코드>: <응답본문>"` 문자열로 던지므로 본문의 error 값을 꺼낸다.
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
    //   사고: 이 화면이 BTS 위에 창으로 떠 있을 때 로그아웃을 누르면
    //   `reset` 이 **뒤의 BTS 까지 통째로 날려** 메인앱만 남겼다
    //   = "BTS 를 떠나지 않는다"는 이번 작업의 대전제가 깨진다.
    //   창으로 열린 경우 = 화면 소속이 없다(위 headerHeight 가 0) → 그때는 그냥 로그아웃만 한다.
    //   (탭에서 평소처럼 열었을 때는 옛날 그대로 메인으로 리셋 = 기능 손상 0)
    const openedAsSheet = headerHeight === 0 && tabBarHeight === 0;
    if (!openedAsSheet) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Main" }],
      });
    }
  };

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = 회원 탈퇴.
  //   설계 = 우리 재료(장소 id)로 만든 것(여정·영상·창고 해설)은 회사 자산이라 남기고,
  //          개인이 찍은 사진만 6개월 뒤 자동 삭제. 서버가 그 판단을 한다(여기는 부르기만).
  //   확인 2단계 = 되돌릴 수 없는 조작이라 한 번 더 묻는다(여정 카드 X 와 성격이 다름 = 그건 화면 정리, 이건 계정).
  //   ⚠️ 웹(react-native-web)은 Alert.alert 이 안 뜬다 = window.confirm 으로 갈라야 한다
  //      (ExpertSheet.tsx:206 에서 2026-07-14 사장님이 겪은 그 함정 = 같은 규칙 1벌).
  const [deletingAccount, setDeletingAccount] = useState(false);

  const runDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await apiRequest("DELETE", "/api/auth/account");
      await clearAuth(); // clearAuth 가 전역 판정에 자동 알림
      setSavedTrips([]);
    } catch (e: any) {
      // 서버가 준 사유를 뭉개지 않는다(2026-07-31 사장님 지시)
      const msg = e?.message || "탈퇴 처리에 실패했습니다.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("탈퇴 실패", msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    const t1 = "정말 탈퇴하시겠습니까?";
    // ⚠️ 2026-08-08 §22 판단검증 = 실제 동작과 문구를 맞춘다. 옛 "바로 로그인할 수 없게 됩니다" 폐기 §19
    //   (재로그인하면 applyLogin 이 되살리므로 그 문장은 사실이 아니었다).
    const m1 =
      "탈퇴하면 로그아웃되고 목록에서 사라집니다.\n6개월 안에 다시 로그인하시면 그대로 복구됩니다.";
    const t2 = "마지막 확인";
    const m2 =
      "6개월이 지나면 회원 정보와 직접 찍으신 사진이 완전히 삭제됩니다.\n계속하시겠습니까?";

    if (Platform.OS === "web") {
      if (!window.confirm(`${t1}\n\n${m1}`)) return;
      if (!window.confirm(`${t2}\n\n${m2}`)) return;
      void runDeleteAccount();
      return;
    }
    Alert.alert(t1, m1, [
      { text: "취소", style: "cancel" },
      {
        text: "계속",
        style: "destructive",
        onPress: () =>
          Alert.alert(t2, m2, [
            { text: "취소", style: "cancel" },
            {
              text: "탈퇴",
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
    // 계정 확정 여부 = 저장소 첫 조회가 끝났는지. 계정별로 기기에 기억해 둔 값을 읽는 화면이
    // 확정 전에 '비로그인'으로 착각해 엉뚱한 목록을 읽지 않도록 그대로 넘겨준다(2026-08-02).
    authReady,
    showLanguageModal,
    setShowLanguageModal,
    // 🏆 대표 올리기(관리자 전용) = '나의 여정' 카드가 쓴다
    isAdmin,
    promotingTripId,
    handleSetRepresentative,
    handleLanguageChange,
    handleLogout,
    // 숨김(X) 공용 1벌 = TripsSection·VideosSection 이 이것을 받아 쓴다(각자 호출 금지)
    hiddenKeys,
    hiddenReady,
    hideCard,
    // 회원 탈퇴 (2026-08-08) = 개인정보 보호 아코디언 안 [탈퇴] 한 줄이 쓴다
    handleDeleteAccount,
    deletingAccount,
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
