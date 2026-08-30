import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";
// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 이 파일은 React 컴포넌트가 아니라(useTranslation 훅 불가)
import i18n from "./i18n";

const AUTH_KEY = "@vibetrip_auth";
const USER_KEY = "@vibetrip_user";

export interface UserData {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  provider: "kakao" | "google" | "apple" | "whatsapp";
  language: string;
  birthDate: string;
  ageGroup?: string;
  isPaid?: boolean;
  planType?: string;
  role?: string; // user | expert | admin = 전문가/관리자 화면 분기(서버 toClientUser 가 실어줌)
  token?: string;
  createdAt?: string;
}

export async function getUserData(): Promise<UserData | null> {
  try {
    const data = await AsyncStorage.getItem(USER_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && parsed.id && parsed.id !== "guest_browse") return parsed;
    }
  } catch {}
  return null;
}

// ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **저장소에 인증을 쓰면 자동으로 알린다**(§19·§22 "글 아닌 기계").
const authListeners = new Set<() => void>();
export function subscribeAuthChanged(fn: () => void): () => void {
  authListeners.add(fn);
  return () => {
    authListeners.delete(fn);
  };
}
function notifyAuthChanged() {
  authListeners.forEach((fn) => fn());
}

export async function saveAuth(userData: UserData): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_KEY, "authenticated");
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
  } catch (error) {
    console.error("Failed to save auth:", error);
  }
  notifyAuthChanged();
}

export async function clearAuth(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([AUTH_KEY, USER_KEY]);
  } catch (error) {
    console.error("Failed to clear auth:", error);
  }
  notifyAuthChanged();
}

// ⚠️ 수정금지(승인필요) 사장님 SSOT 2026-08-08 = **이메일창 = 가입이 아니라 "이미 있는 내 계정 찾기"**.
export async function emailLogin(data: {
  email: string;
  birthDate?: string; // 2026-08-24 = 생년월일 선택 정책(shared/birthdate-policy)
  language: string;
  deviceType: string;
}): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/email-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      const userData: UserData = { ...result.user, token: result.token };
      await saveAuth(userData);
      return { success: true, user: userData };
    }
    return {
      success: false,
      error: result.error || i18n.t("login.loginFailed"),
    };
  } catch (error) {
    console.error("Email login error:", error);
    return { success: false, error: i18n.t("login.serverConnectFailed") };
  }
}

// ⚠️ 수정금지(승인필요) — 옛 socialLogin(/api/auth/social-login) 완전삭제 = 2026-07-26 §0·§19.

type LoginResult = { success: boolean; user?: UserData; error?: string };

/** ⚠️ 수정금지(승인필요) — 소셜 인증 결과를 우리 서버로 보내 로그인하는 **단 하나의 함수** (2026-07-26 §16). */
async function postSocialLogin(
  path: string,
  data: Record<string, string>,
  failMsg: string,
): Promise<LoginResult> {
  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      const userData: UserData = { ...result.user, token: result.token };
      await saveAuth(userData);
      return { success: true, user: userData };
    }
    return { success: false, error: result.error || failMsg };
  } catch (error) {
    console.error(`[Auth] ${path} 실패:`, error);
    return { success: false, error: i18n.t("login.serverConnectFailed") };
  }
}

export function socialLoginWithGoogle(data: {
  idToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/google", data, i18n.t("login.loginFailed"));
}

export function socialLoginWithKakao(data: {
  accessToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/kakao", data, i18n.t("login.loginFailed"));
}

// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = 애플 로그인(아이폰 전용).
export function socialLoginWithApple(data: {
  identityToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
  fullName?: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/apple", data, i18n.t("login.loginFailed"));
}

export async function whatsappOtpSend(
  phoneNumber: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/whatsapp/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber }),
    });
    const result = await response.json();
    if (response.ok && result.success) return { success: true };
    return {
      success: false,
      error: result.error || i18n.t("login.otpSendFailed"),
    };
  } catch (error) {
    console.error("WhatsApp OTP send error:", error);
    return { success: false, error: i18n.t("login.serverConnectFailed") };
  }
}

export async function whatsappOtpVerify(data: {
  phoneNumber: string;
  otp: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/whatsapp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      const userData: UserData = { ...result.user, token: result.token };
      await saveAuth(userData);
      return { success: true, user: userData };
    }
    return {
      success: false,
      error: result.error || i18n.t("login.whatsappLoginFailed"),
    };
  } catch (error) {
    console.error("WhatsApp OTP verify error:", error);
    return { success: false, error: i18n.t("login.serverConnectFailed") };
  }
}

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

export function getAgeGroup(age: number): string {
  if (age < 20) return i18n.t("login.ageGroup10s");
  if (age < 30) return i18n.t("login.ageGroup20s");
  if (age < 40) return i18n.t("login.ageGroup30s");
  if (age < 50) return i18n.t("login.ageGroup40s");
  if (age < 60) return i18n.t("login.ageGroup50s");
  return i18n.t("login.ageGroup60sPlus");
}
