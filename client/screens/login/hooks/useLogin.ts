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
  getKakaoCallbackLanguage,
  isKakaoOAuthConfigured,
} from "@/lib/auth-kakao";
import {
  stashBirthDate,
  readBirthDate,
  clearBirthDate,
} from "@/lib/birthdate-store";
import { isAppleAuthAvailable } from "@/lib/auth-apple";
import {
  runNativeSocial,
  isSocialConfigured,
  type SocialProvider,
} from "@/lib/auth-social";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "@/lib/i18n";
import { BIRTHDATE_REQUIRED } from "@shared/birthdate-policy";
import { LOGIN_ENTRY_MAIN } from "@shared/login-entry";

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
  const processedKakaoCodeRef = useRef<string | null>(null);
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
  // ⚠️ 수정금지(승인필요) — 생년월일 = 사용자가 친 년·월·일 칸을 그대로 조립 = 시간대 변환 0 = 어느 나라에서든 입력값 = 저장값.
  const birthDateStr = birthDate ? `${year}-${month}-${day}` : null;

  //   ⚠️ 2026-07-27 사장님 SSOT = 알림은 **한 줄**만(제목·본문 2칸 쓰던 상세문구 기능 완전삭제 §19).
  const notify = (msg: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
    } else Alert.alert(msg);
  };

  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 외부 인증은 신원만 처리 = 생년월일은 우리가 맡아둔 값을 실어 보낸다
  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success") return;
    if (processedGoogleRef.current === googleResponse) return;
    processedGoogleRef.current = googleResponse;
    const idToken = getIdTokenFromGoogleResponse(googleResponse);
    if (!idToken) return;
    setOauthLoading(true);
    socialLoginWithGoogle({
      idToken,
      birthDate: readBirthDate(),
      language: i18n.language,
      deviceType: Platform.OS === "web" ? "web" : "mobile",
      entry: LOGIN_ENTRY_MAIN,
    })
      .then((result) => {
        clearBirthDate();
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
  }, [googleResponse, i18n.language, onDone]);

  useEffect(() => {
    if (Platform.OS !== "web" || !isKakaoOAuthConfigured()) return;
    const url = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(url);
    const code = params.get("code");
    if (!code) return;
    // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 카카오 인증번호는 한 번만 쓴다(구글 processedGoogleRef 와 같은 방식). 두 번 쓰면 카카오가 거절해 "로그인 실패" 경고가 뜬다.
    if (processedKakaoCodeRef.current === code) return;
    processedKakaoCodeRef.current = code;

    // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 외부 인증은 신원만 처리 = 생년월일은 우리가 맡아둔 값을 실어 보낸다
    const language = getKakaoCallbackLanguage() || i18n.language;

    setOauthLoading(true);
    exchangeKakaoCodeForToken(code)
      .then((accessToken) =>
        socialLoginWithKakao({
          accessToken,
          birthDate: readBirthDate(),
          language,
          deviceType: "web",
          entry: LOGIN_ENTRY_MAIN,
        }),
      )
      .then((result) => {
        clearBirthDate();
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

  // ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 생년월일 필수/선택 = 토글(shared/birthdate-policy) 1벌, 성인 확인 없음
  const requireBirthDate = (): boolean => {
    if (BIRTHDATE_REQUIRED && !birthDate) {
      setDateError(t("login.birthRequired"));
      notify(t("login.birthRequiredAlert"));
      dayRef.current?.focus();
      return false;
    }
    stashBirthDate(birthDateStr); // 외부 창을 열기 전에 우리가 맡아둔다
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
        birthDate: readBirthDate(),
        language: i18n.language,
        entry: LOGIN_ENTRY_MAIN,
      }),
    );

  const handleGooglePress = async () => {
    if (!requireBirthDate()) return;
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
    if (!requireBirthDate()) return;
    if (!isSocialConfigured("kakao")) {
      console.error("[Auth] 카카오 앱 키 미주입 = 로그인 불가");
      notify(t("login.loginFailed"));
      return;
    }
    if (Platform.OS === "web") {
      setOauthLoading(true);
      try {
        await startKakaoLoginWeb(i18n.language); // 리다이렉트
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
    if (!requireBirthDate()) return;
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
    if (!requireBirthDate()) return;
    setEmailLoading(true);
    try {
      const r = await emailLogin({
        email,
        birthDate: birthDateStr ?? undefined,
        language: i18n.language,
        deviceType: Platform.OS === "web" ? "web" : "mobile",
        entry: LOGIN_ENTRY_MAIN,
      });
      if (r.success) {
        onDone(); // 성공 = 팝업 닫기 및 로그인 상태 반영
        return;
      }
      notify(t("login.emailLoginFailed"));
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
    ageGroup,
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
