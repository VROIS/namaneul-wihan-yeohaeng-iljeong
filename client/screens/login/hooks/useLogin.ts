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
  calculateAge,
  getAgeGroup,
  socialLoginWithGoogle,
  socialLoginWithKakao,
  whatsappOtpSend,
  whatsappOtpVerify,
  emailLogin,
} from "@/lib/auth";
import {
  isWhatsAppOtpConfigured,
  getIdTokenFromGoogleResponse,
} from "@/lib/auth-oauth";
// 구글 = 웹(auth-google.web.ts, 리다이렉트) / 앱(auth-google.ts, 네이티브 SDK) 자동 선택
import { useGoogleAuthRequest } from "@/lib/auth-google";
import {
  startKakaoLoginWeb,
  exchangeKakaoCodeForToken,
  getKakaoCallbackData,
  isKakaoOAuthConfigured,
} from "@/lib/auth-kakao";
// 애플 = 웹(auth-apple.web.ts, 없음) / 앱(auth-apple.ts, iOS 네이티브) 자동 선택
import { isAppleAuthAvailable } from "@/lib/auth-apple";
// ⚠️ 앱 소셜 3종 조립 = 공용 1벌(§16). 아미봉 인증창도 같은 것을 쓴다.
import {
  runNativeSocial,
  isSocialConfigured,
  type SocialProvider,
} from "@/lib/auth-social";
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
  //   ⚠️ 2026-07-27 사장님 SSOT = 알림은 **한 줄**만(제목·본문 2칸 쓰던 상세문구 기능 완전삭제 §19).
  //   긴 영문 원문은 안 붙인다 = 누더기 금지(§23). 실패 사유 **이름 한 낱말**만 호출부에서 제목에 붙인다.
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
          // ⚠️ 2026-07-26 = 웹에서는 Alert.alert 이 안 뜸(§22 리뷰) → notify 로 통일(§16 1벌)
          notify(result.error || t("login.loginFailed"));
        }
      })
      .catch((err) => {
        console.error("[Auth] 웹 구글 로그인 실패:", err);
        notify(t("login.loginFailed"));
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
        // ⚠️ 2026-07-28 = 성공·조기실패 경로와 동일하게 여기서도 code 를 지운다(§16 형식 통일).
        //   안 지우면 네트워크 예외 시 다음 시도에서 이미 쓴 code 를 또 시도하게 된다.
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
      // ⚠️ 2026-07-28 = 실패 **사유 이름 한 낱말**만 제목 옆에 붙인다(§11 = 사실을 보게).
      //   사유: 사유를 아예 안 보여주니 실기기에서 "버튼이 죽었다"로만 보였고 원인을 못 찾았다.
      //   긴 영문 원문은 안 붙인다(§23 = 누더기 금지). 예: "로그인 실패 (Misconfigured)".
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
  //   옛것(구글·카카오·애플 각각 여기서 따로 조립) 완전삭제 §19 = 아미봉 인증창과 두 벌로 갈리던 근본.
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
  //   생년월일 확인 → 애플 창 → 우리 서버 로그인 = **구글·카카오와 완전히 같은 순서**.
  //   웹 분기가 없는 이유 = 웹에는 버튼 자체가 안 그려진다(isAppleAvailable=false).
  const handleApplePress = async () => {
    if (!requireBirthDateAndAdult()) return;
    await startNativeSocial("apple");
  };

  // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인 = 구글 OAuth(웹 400) 우회. 메일 넣으면 그 계정으로 로그인(사장님 메일=admin).
  const [emailInput, setEmailInput] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const handleEmailLogin = async () => {
    const email = emailInput.trim();
    if (!email || !email.includes("@")) {
      notify(t("login.emailInvalid"));
      return;
    }
    const targetBirthDate = birthDateStr || "1990-05-15";
    setEmailLoading(true);
    try {
      const r = await emailLogin({
        email,
        birthDate: targetBirthDate,
        language: i18n.language,
        deviceType: Platform.OS === "web" ? "web" : "mobile",
      });
      if (r.success) {
        onDone(); // 성공 = 팝업 닫기 및 로그인 상태 반영
      } else {
        notify(r.error || t("login.emailLoginFailed"));
      }
    } catch (e) {
      notify("로그인 처리 중 오류 발생");
    } finally {
      setEmailLoading(false);
    }
  };

  // ⚠️ 게스트("로그인 없이 둘러보기") 완전삭제 = 2026-07-27 사장님 = 기능 폐지 §19.
  //   가짜 계정(guest_browse)을 저장소에 넣어 로그인 흉내를 내던 경로 = 판정이 갈리는 원인이기도 했음.

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
    handleApplePress,
    // 애플 버튼을 보여줄지 = 아이폰만 true. 화면은 이 값 1벌만 보고 판단(§16).
    isAppleAvailable: isAppleAuthAvailable(),
    emailInput,
    setEmailInput,
    emailLoading,
    handleEmailLogin,
  };
}

export type LoginApi = ReturnType<typeof useLogin>;
