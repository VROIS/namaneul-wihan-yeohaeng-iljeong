import { useState, useRef, useMemo, useEffect } from "react";
import {
  TextInput,
  useColorScheme,
  Platform,
  Alert,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import {
  calculateAge,
  getAgeGroup,
  socialLoginWithGoogle,
  socialLoginWithKakao,
  emailLogin,
} from "@/lib/auth";
import { getIdTokenFromGoogleResponse } from "@/lib/auth-oauth";
import { useGoogleAuthRequest } from "@/lib/auth-google";
import {
  startKakaoLoginWeb,
  exchangeKakaoCodeForToken,
  getKakaoCallbackData,
  isKakaoOAuthConfigured,
} from "@/lib/auth-kakao";
import { isAppleAuthAvailable } from "@/lib/auth-apple";
import {
  runNativeSocial,
  isSocialConfigured,
  type SocialProvider,
} from "@/lib/auth-social";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";
import { BIRTHDATE_REQUIRED } from "@shared/birthdate-policy";

// ⚠️ 사장님 SSOT 2026-07-25 = 로그인 성공 시 "다음 동작"을 호출자가 결정(§0 단일경로·분기금지). onDone:
export function useLogin({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  const currentLang =
    SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const [, googleResponse, googlePromptAsync] = useGoogleAuthRequest();
  const processedGoogleRef = useRef<typeof googleResponse>(null);
  const birthDate = useMemo(() => {
    if (day.length === 2 && month.length === 2 && year.length === 4) {
      const d = parseInt(day, 10);
      const m = parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      const date = new Date(y, m, d);
      if (
        date.getDate() === d &&
        date.getMonth() === m &&
        date.getFullYear() === y
      ) {
        return date;
      }
    }
    return null;
  }, [day, month, year]);

  const age = useMemo(
    () => (birthDate ? calculateAge(birthDate) : null),
    [birthDate],
  );
  const ageGroup = useMemo(
    () => (age !== null ? getAgeGroup(age) : null),
    [age],
  );
  const isAdult = age !== null && age >= 18;
  const isDateComplete =
    day.length === 2 && month.length === 2 && year.length === 4;
  // ⚠️ 수정금지(승인필요) — 생년월일 = 사용자가 친 년·월·일 칸을 그대로 조립 = 시간대 변환 0 = 어느 나라에서든 입력값 = 저장값.
  const birthDateStr = birthDate ? `${year}-${month}-${day}` : null;

  //   ⚠️ 2026-07-27 사장님 SSOT = 알림은 **한 줄**만(제목·본문 2칸 쓰던 상세문구 기능 완전삭제 §19).
  const notify = (msg: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
    } else Alert.alert(msg);
  };

  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success" || !birthDateStr)
      return;
    if (processedGoogleRef.current === googleResponse) return;
    processedGoogleRef.current = googleResponse;
    const idToken = getIdTokenFromGoogleResponse(googleResponse);
    if (!idToken) return;
    setOauthLoading(true);
    socialLoginWithGoogle({
      idToken,
      birthDate: birthDateStr,
      language: i18n.language,
      deviceType: Platform.OS === "web" ? "web" : "mobile",
    })
      .then((result) => {
        if (result.success) {
          onDone(); // 성공 = 호출자 결정(화면 리셋 or 팝업 닫기). §0 단일경로.
        } else {
          notify(result.error || t("login.loginFailed"));
        }
      })
      .catch((err) => {
        console.error("[Auth] 웹 구글 로그인 실패:", err);
        notify(t("login.loginFailed"));
      })
      .finally(() => setOauthLoading(false));
  }, [googleResponse, birthDateStr, i18n.language, onDone]);

  useEffect(() => {
    if (Platform.OS !== "web" || !isKakaoOAuthConfigured()) return;
    const url = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(url);
    const code = params.get("code");
    if (!code) return;

    const callbackData = getKakaoCallbackData();
    const birthDate = callbackData?.birthDate;
    const language = callbackData?.language || i18n.language;
    if (!birthDate) {
      notify(t("login.loginFailed"));
      if (typeof window !== "undefined" && window.history) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      return;
    }

    setOauthLoading(true);
    exchangeKakaoCodeForToken(code)
      .then((accessToken) =>
        socialLoginWithKakao({
          accessToken,
          birthDate,
          language,
          deviceType: "web",
        }),
      )
      .then((result) => {
        if (typeof window !== "undefined" && window.history) {
          window.history.replaceState({}, "", window.location.pathname);
        }
        if (result.success) {
          onDone(); // 성공 = 호출자 결정. §0 단일경로.
        } else {
          notify(result.error || t("login.loginFailed"));
        }
      })
      .catch((err) => {
        console.error("[Auth] 웹 카카오 로그인 실패:", err);
        if (typeof window !== "undefined" && window.history) {
          window.history.replaceState({}, "", window.location.pathname);
        }
        notify(t("login.loginFailed"));
      })
      .finally(() => setOauthLoading(false));
  }, [i18n.language, onDone]);

  const validateAndSetDay = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDay(num);
    setDateError(null);
    if (num.length === 2) {
      const d = parseInt(num, 10);
      if (d < 1 || d > 31) {
        setDateError(t("login.dateInvalid"));
      } else {
        monthRef.current?.focus();
      }
    }
  };

  const validateAndSetMonth = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 2);
    setMonth(num);
    setDateError(null);
    if (num.length === 2) {
      const m = parseInt(num, 10);
      if (m < 1 || m > 12) {
        setDateError(t("login.monthInvalid"));
      } else {
        yearRef.current?.focus();
      }
    }
  };

  const validateAndSetYear = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 4);
    setYear(num);
    setDateError(null);
    if (num.length === 4) {
      const y = parseInt(num, 10);
      const currentYear = new Date().getFullYear();
      if (y < 1920 || y > currentYear - 10) {
        setDateError(t("login.yearInvalid"));
      } else {
        // ⚠️ 2026-07-25(세션2) = 생년월일 마지막 칸(연도) 완료 = 키보드 자동 내림. number-pad엔 return 키가 없어 코드 dismiss가 표준(사장님 실기기: 키보드 갇힘 해소).
        Keyboard.dismiss();
      }
    }
  };

  const requireBirthDateAndAdult = (): boolean => {
    // ⚠️ 수정금지(승인필요) 2026-08-24 사장님 승인 = 생년월일 입력부 필수↔선택 전환 1줄
    if (!BIRTHDATE_REQUIRED) return true;
    if (!isDateComplete) {
      setDateError(t("login.birthRequired"));
      Alert.alert(t("login.alert"), t("login.birthRequiredAlert"));
      dayRef.current?.focus();
      return false;
    }
    if (!birthDate || !isAdult) {
      setDateError(t("login.adultOnly"));
      Alert.alert(t("login.alert"), t("login.adultOnly"));
      return false;
    }
    return true;
  };

  // ⚠️ 사장님 SSOT 2026-07-26 = 앱(iOS·Android) 소셜 로그인 공통 마무리(§16 1벌).
  const runNativeSocialLogin = async (
    run: () => Promise<{ success: boolean; error?: string } | null>,
  ) => {
    setOauthLoading(true);
    try {
      const result = await run();
      if (!result) return; // 취소
      if (result.success)
        onDone(); // 성공 = 호출자 결정. §0 단일경로.
      else notify(result.error || t("login.loginFailed"));
    } catch (err) {
      console.error("[Auth] 앱 소셜 로그인 실패:", err);
      const code = (err as { code?: string | number } | null)?.code;
      notify(
        code ? `${t("login.loginFailed")} (${code})` : t("login.loginFailed"),
      );
    } finally {
      setOauthLoading(false);
    }
  };

  // ⚠️ 수정금지(승인필요) 2026-07-31 = 앱 소셜 3종 = **공용 1벌**(auth-social.ts)로 통일 §16.
  const startNativeSocial = (provider: SocialProvider) =>
    runNativeSocialLogin(() =>
      runNativeSocial(provider, {
        birthDate: birthDateStr!,
        language: i18n.language,
      }),
    );

  const handleGooglePress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (!isSocialConfigured("google")) {
      console.error("[Auth] 구글 클라이언트 ID 미주입 = 로그인 불가");
      notify(t("login.loginFailed"));
      return;
    }
    if (Platform.OS === "web") {
      await googlePromptAsync(); // 리다이렉트 → 복귀 시 위 useEffect 가 처리
      return;
    }
    await startNativeSocial("google");
  };

  const handleKakaoPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (!isSocialConfigured("kakao")) {
      console.error("[Auth] 카카오 앱 키 미주입 = 로그인 불가");
      notify(t("login.loginFailed"));
      return;
    }
    if (Platform.OS === "web") {
      setOauthLoading(true);
      try {
        await startKakaoLoginWeb(birthDateStr!, i18n.language); // 리다이렉트
      } catch (err) {
        console.error("[Auth] 카카오 웹 로그인 시작 실패:", err);
        notify(t("login.loginFailed"));
        setOauthLoading(false);
      }
      return;
    }
    await startNativeSocial("kakao");
  };

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = 애플 로그인(아이폰 전용).
  const handleApplePress = async () => {
    if (!requireBirthDateAndAdult()) return;
    await startNativeSocial("apple");
  };

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **이메일창은 가입이 아니라 "이미 있는 내 계정 찾기"**.
  const [emailInput, setEmailInput] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const handleEmailLogin = async () => {
    const email = emailInput.trim();
    if (!email || !email.includes("@")) {
      notify(t("login.emailInvalid"));
      return;
    }
    if (!requireBirthDateAndAdult()) return;
    setEmailLoading(true);
    try {
      const r = await emailLogin({
        email,
        birthDate: birthDateStr ?? undefined,
        language: i18n.language,
        deviceType: Platform.OS === "web" ? "web" : "mobile",
      });
      if (r.success) {
        onDone(); // 성공 = 팝업 닫기 및 로그인 상태 반영
        return;
      }
      // 서버가 준 사유를 뭉개지 않는다(2026-07-31 사장님 지시). 사용자가 다음에 뭘 할지 알 수 있게.
      if (r.error === "account_not_found")
        notify(t("login.emailAccountNotFound"));
      else if (r.error === "birthdate_mismatch")
        notify(t("login.emailBirthMismatch"));
      else notify(t("login.emailLoginFailed"));
    } catch (e) {
      notify(t("login.emailLoginFailed"));
    } finally {
      setEmailLoading(false);
    }
  };

  // ⚠️ 게스트("로그인 없이 둘러보기") 완전삭제 = 2026-07-27 사장님 = 기능 폐지 §19.

  return {
    t,
    i18n,
    theme,
    insets,
    currentLang,
    showLanguageModal,
    setShowLanguageModal,
    day,
    month,
    year,
    dateError,
    oauthLoading,
    dayRef,
    monthRef,
    yearRef,
    age,
    ageGroup,
    isAdult,
    isDateComplete,
    validateAndSetDay,
    validateAndSetMonth,
    validateAndSetYear,
    handleGooglePress,
    handleKakaoPress,
    handleApplePress,
    isAppleAvailable: isAppleAuthAvailable(),
    emailInput,
    setEmailInput,
    emailLoading,
    handleEmailLogin,
  };
}

export type LoginApi = ReturnType<typeof useLogin>;
