// 로그인 화면 상태·핸들러 = LoginScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
  UserData,
  calculateAge,
  getAgeGroup,
  saveAuth,
  socialLoginWithGoogle,
  socialLoginWithKakao,
  whatsappOtpSend,
  whatsappOtpVerify,
  emailLogin,
} from "@/lib/auth";
import {
  isWhatsAppOtpConfigured,
  getIdTokenFromGoogleResponse,
  authErrorDetail,
} from "@/lib/auth-oauth";
// 구글 = 웹(auth-google.web.ts, 리다이렉트) / 앱(auth-google.ts, 네이티브 SDK) 자동 선택
import {
  useGoogleAuthRequest,
  signInWithGoogle,
  isGoogleOAuthConfigured,
} from "@/lib/auth-google";
import {
  isKakaoOAuthConfigured,
  startKakaoLoginWeb,
  loginKakaoNative,
  isKakaoUserCancelled,
  exchangeKakaoCodeForToken,
  getKakaoCallbackData,
} from "@/lib/auth-kakao";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";

// ⚠️ 사장님 SSOT 2026-07-25 = 로그인 성공 시 "다음 동작"을 호출자가 결정(§0 단일경로·분기금지). onDone:
//   - LoginScreen(과도기 보관 화면) = () => navigation.reset(Main)  (기존 동작 100% 유지)
//   - LoginSheet(인앱 팝업) = () => setVisible(false)  (팝업만 닫고 배경 화면 유지)
//   훅 내부엔 화면이동/팝업닫기 분기 없음 = 성공하면 onDone() 1개만 부름.
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

  // 첫 칸(요청 객체)은 안 씀 = 생략(§19)
  const [, googleResponse, googlePromptAsync] = useGoogleAuthRequest();
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
  // ⚠️ 수정금지(승인필요) — 생년월일 = 사용자가 친 년·월·일 칸을 그대로 조립 = 시간대 변환 0 = 어느 나라에서든 입력값 = 저장값.
  //   UTC 변환 방식 폐기 = 2026-07-26 §19 (한국·유럽 등 UTC 보다 앞선 곳에서 하루 앞날짜로 저장되던 실측 버그).
  const birthDateStr = birthDate ? `${year}-${month}-${day}` : null;

  // ⚠️ 2026-07-14 = 웹(WebView)에서 Alert.alert 이 안 떠서 로그인 실패·검증 안내가 안 보임 = "눌러도 반응 없음"의 원인. 웹 = window.alert, 앱 = Alert.alert(§19).
  //   2026-07-26(§22 리뷰) = "로그인 실패" 안내를 여기 1벌로 통일(§16).
  //   (생년월일 게이트·WhatsApp 의 Alert.alert 은 그대로 = 생년월일은 인라인 빨간 문구가 웹에서도 보이고, WhatsApp 은 비활성)
  //   detail = 실패 사유(에러 코드 등). 앱은 제목·본문 2칸으로 넘겨야 잘리지 않음(§22 리뷰).
  const notify = (msg: string, detail?: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined")
        window.alert(detail ? `${msg}\n${detail}` : msg);
    } else Alert.alert(msg, detail);
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
          // ⚠️ 2026-07-26 = 웹에서는 Alert.alert 이 안 뜸(§22 리뷰) → notify 로 통일(§16 1벌)
          notify(result.error || t("login.loginFailed"));
        }
      })
      .catch((err) => {
        console.error("[Auth] 웹 구글 로그인 실패:", err);
        notify(t("login.loginFailed"), authErrorDetail(err));
      })
      .finally(() => setOauthLoading(false));
  }, [googleResponse, birthDateStr, i18n.language, onDone]);

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
        notify(t("login.loginFailed"), authErrorDetail(err));
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
      } else {
        // ⚠️ 2026-07-25(세션2) = 생년월일 마지막 칸(연도) 완료 = 키보드 자동 내림. number-pad엔 return 키가 없어 코드 dismiss가 표준(사장님 실기기: 키보드 갇힘 해소).
        Keyboard.dismiss();
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

  // ⚠️ 사장님 SSOT 2026-07-26 = 앱(iOS·Android) 소셜 로그인 공통 마무리(§16 1벌).
  //   외부인증에서 표(구글 id_token / 카카오 accessToken)를 받은 뒤 → 우리 서버 로그인 → 성공하면 onDone().
  //   생년월일은 인증 요청이 아니라 "우리 저장분"으로만 함께 감(생년월일-인증 분리, 세션2-D).
  //   run() 이 null 을 주면 = 사용자가 로그인 창을 닫은 것(취소) = 실패 아님 = 조용히 종료.
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
      // 카카오 SDK 는 취소를 예외로 던짐 = 안내 없이 종료(흔적은 로그로 남김)
      if (isKakaoUserCancelled(err)) {
        console.log("[Auth] 사용자가 로그인 창을 닫음:", err);
        return;
      }
      // ⚠️ 2026-07-26 = 실패 사유를 화면에 그대로 보여줌(§11). 삼키면 사장님·AI 모두 원인을 못 봄.
      console.error("[Auth] 앱 소셜 로그인 실패:", err);
      notify(t("login.loginFailed"), authErrorDetail(err));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleGooglePress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (!isGoogleOAuthConfigured()) {
      console.error("[Auth] 구글 클라이언트 ID 미주입 = 로그인 불가");
      notify(t("login.loginFailed"));
      return;
    }
    if (Platform.OS === "web") {
      await googlePromptAsync(); // 리다이렉트 → 복귀 시 위 useEffect 가 처리
      return;
    }
    await runNativeSocialLogin(async () => {
      const idToken = await signInWithGoogle();
      if (!idToken) return null; // 사용자가 구글 창을 닫음
      return socialLoginWithGoogle({
        idToken,
        birthDate: birthDateStr!,
        language: i18n.language,
        deviceType: "mobile",
      });
    });
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
      onDone(); // 성공 = 호출자 결정. §0 단일경로.
    } else {
      Alert.alert(
        t("login.loginFailed"),
        result.error || t("login.loginFailed"),
      );
    }
  };

  const handleKakaoPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (!isKakaoOAuthConfigured()) {
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
        notify(t("login.loginFailed"), authErrorDetail(err));
        setOauthLoading(false);
      }
      return;
    }
    await runNativeSocialLogin(async () => {
      const accessToken = await loginKakaoNative();
      return socialLoginWithKakao({
        accessToken,
        birthDate: birthDateStr!,
        language: i18n.language,
        deviceType: "mobile",
      });
    });
  };

  // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인 = 구글 OAuth(웹 400) 우회. 메일 넣으면 그 계정으로 로그인(사장님 메일=admin).
  const [emailInput, setEmailInput] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const handleEmailLogin = async () => {
    // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 = 2가지 필수(생년월일 + 인증). 생년월일 = 비번 대체 + 진짜 생년월일 재유도. 이메일도 구글·카톡과 동일하게 생년월일 게이트 통과 필수.
    if (!requireBirthDateAndAdult()) return;
    const email = emailInput.trim();
    if (!email || !email.includes("@")) {
      notify(t("login.emailInvalid"));
      return;
    }
    setEmailLoading(true);
    try {
      const r = await emailLogin({
        email,
        birthDate: birthDateStr!, // 위 게이트를 통과했으므로 항상 있음
        language: i18n.language,
        deviceType: Platform.OS === "web" ? "web" : "mobile",
      });
      if (r.success) {
        onDone(); // 성공 = 호출자 결정. §0 단일경로.
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
    onDone(); // 게스트 진입 = 호출자 결정. §0 단일경로.
  };

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
