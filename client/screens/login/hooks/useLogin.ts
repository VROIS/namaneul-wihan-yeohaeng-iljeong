// 로그인 화면 상태·핸들러 = LoginScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { useState, useRef, useMemo, useEffect } from "react";
import { TextInput, useColorScheme, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Colors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import {
  UserData,
  calculateAge,
  getAgeGroup,
  saveAuth,
  socialLogin,
  socialLoginWithGoogle,
  socialLoginWithKakao,
  whatsappOtpSend,
  whatsappOtpVerify,
  emailLogin,
} from "@/lib/auth";
import {
  useGoogleAuthRequest,
  isGoogleOAuthConfigured,
  isWhatsAppOtpConfigured,
  getIdTokenFromGoogleResponse,
} from "@/lib/auth-oauth";
import {
  isKakaoOAuthConfigured,
  startKakaoLoginWeb,
  exchangeKakaoCodeForToken,
  getKakaoCallbackData,
} from "@/lib/auth-kakao";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";

export function useLogin() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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

  const [googleRequest, googleResponse, googlePromptAsync] =
    useGoogleAuthRequest();
  const processedGoogleRef = useRef<typeof googleResponse>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [whatsappStep, setWhatsappStep] = useState<"phone" | "otp">("phone");

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
  const birthDateStr = birthDate ? birthDate.toISOString().split("T")[0] : null;

  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success" || !birthDateStr)
      return;
    if (processedGoogleRef.current === googleResponse) return;
    processedGoogleRef.current = googleResponse;
    // @ts-expect-error Type mismatch from AuthSession
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
          navigation.reset({ index: 0, routes: [{ name: "Main" }] });
        } else {
          Alert.alert(
            "로그인 실패",
            result.error || "Google 로그인에 실패했습니다.",
          );
        }
      })
      .catch((err) => {
        console.error("Google login error:", err);
        Alert.alert(t("login.loginFailed"), t("login.loginFailed"));
      })
      .finally(() => setOauthLoading(false));
  }, [googleResponse, birthDateStr, i18n.language, navigation]);

  // 카카오 웹 리다이렉트 복귀 시 code 처리
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
      Alert.alert(t("login.loginFailed"), t("login.loginFailed"));
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
          navigation.reset({ index: 0, routes: [{ name: "Main" }] });
        } else {
          Alert.alert(
            t("login.loginFailed"),
            result.error || t("login.loginFailed"),
          );
        }
      })
      .catch((err) => {
        console.error("Kakao login error:", err);
        Alert.alert("로그인 실패", "카카오 로그인 중 오류가 발생했습니다.");
      })
      .finally(() => setOauthLoading(false));
  }, [i18n.language, navigation]);

  const validateAndSetDay = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDay(num);
    setDateError(null);
    if (num.length === 2) {
      const d = parseInt(num, 10);
      if (d < 1 || d > 31) {
        setDateError("유효하지 않은 날짜입니다");
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
      }
    }
  };

  const requireBirthDateAndAdult = (): boolean => {
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

  const handleSocialLogin = async (
    provider: "kakao" | "google" | "whatsapp",
  ) => {
    if (!requireBirthDateAndAdult()) return;

    const result = await socialLogin({
      provider,
      birthDate: birthDate!.toISOString().split("T")[0],
      language: i18n.language,
      deviceType: Platform.OS,
      displayName:
        provider === "kakao"
          ? "카카오 사용자"
          : provider === "whatsapp"
            ? "WhatsApp User"
            : "Google User",
    });

    if (result.success && result.user) {
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      Alert.alert(
        t("login.loginFailed"),
        result.error || t("login.loginFailed"),
      );
    }
  };

  const handleGooglePress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (isGoogleOAuthConfigured()) {
      await googlePromptAsync();
    } else {
      await handleSocialLogin("google");
    }
  };

  const handleWhatsAppPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    setShowWhatsAppModal(true);
    setWhatsappStep("phone");
    setWhatsappPhone("");
    setWhatsappOtp("");
  };

  const handleWhatsAppSendOtp = async () => {
    const phone = whatsappPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      Alert.alert(t("login.alert"), t("login.phoneHint"));
      return;
    }
    setOauthLoading(true);
    const result = await whatsappOtpSend(whatsappPhone);
    setOauthLoading(false);
    if (result.success) {
      setWhatsappStep("otp");
      setWhatsappOtp("");
    } else {
      Alert.alert(t("login.loginFailed"), result.error || t("common.retry"));
    }
  };

  const handleWhatsAppVerify = async () => {
    if (!whatsappOtp || whatsappOtp.length < 4) {
      Alert.alert(
        t("login.alert"),
        t("login.otpHint", { phone: whatsappPhone }),
      );
      return;
    }
    setOauthLoading(true);
    const result = await whatsappOtpVerify({
      phoneNumber: whatsappPhone,
      otp: whatsappOtp,
      birthDate: birthDateStr!,
      language: i18n.language, // ⚠️ 2026-07-14 = 선언 안 된 selectedLanguage.code 참조 버그 수정(§19). i18n.language 단일 소스.
      deviceType: Platform.OS === "web" ? "web" : "mobile",
    });
    setOauthLoading(false);
    if (result.success) {
      setShowWhatsAppModal(false);
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      Alert.alert(
        t("login.loginFailed"),
        result.error || t("login.loginFailed"),
      );
    }
  };

  const handleKakaoPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (isKakaoOAuthConfigured() && Platform.OS === "web") {
      setOauthLoading(true);
      try {
        await startKakaoLoginWeb(birthDateStr!, i18n.language);
      } catch (err) {
        console.error("Kakao login start error:", err);
        Alert.alert("로그인 실패", "카카오 로그인을 시작할 수 없습니다.");
        setOauthLoading(false);
      }
    } else {
      await handleSocialLogin("kakao");
    }
  };

  // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인 = 구글 OAuth(웹 400) 우회. 메일 넣으면 그 계정으로 로그인(사장님 메일=admin).
  const [emailInput, setEmailInput] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  // ⚠️ 2026-07-14 = 웹(WebView)에서 Alert.alert 이 안 떠서 로그인 실패·검증 안내가 안 보임 = "눌러도 반응 없음"의 원인. 웹 = window.alert, 앱 = Alert.alert(§19).
  const notify = (msg: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
    } else Alert.alert(msg);
  };
  const handleEmailLogin = async () => {
    const email = emailInput.trim();
    if (!email || !email.includes("@")) {
      notify(t("login.emailInvalid"));
      return;
    }
    setEmailLoading(true);
    try {
      const r = await emailLogin(email);
      if (r.success) {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      } else if (r.error === "email_not_found") {
        notify(t("login.emailNotFound"));
      } else {
        notify(t("login.emailLoginFailed"));
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGuestBrowse = async () => {
    const guestUser: UserData = {
      id: "guest_browse",
      displayName: "비회원",
      provider: "kakao",
      language: i18n.language,
      birthDate: birthDateStr || "1990-01-01",
    };
    await saveAuth(guestUser);
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

  return {
    t,
    i18n,
    theme,
    insets,
    navigation,
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
    showWhatsAppModal,
    setShowWhatsAppModal,
    whatsappPhone,
    setWhatsappPhone,
    whatsappOtp,
    setWhatsappOtp,
    whatsappStep,
    setWhatsappStep,
    age,
    ageGroup,
    isAdult,
    isDateComplete,
    validateAndSetDay,
    validateAndSetMonth,
    validateAndSetYear,
    handleGooglePress,
    handleWhatsAppPress,
    handleWhatsAppSendOtp,
    handleWhatsAppVerify,
    handleKakaoPress,
    emailInput,
    setEmailInput,
    emailLoading,
    handleEmailLogin,
    handleGuestBrowse,
  };
}

export type LoginApi = ReturnType<typeof useLogin>;
