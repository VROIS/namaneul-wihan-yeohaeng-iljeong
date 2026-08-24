import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";
// ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 이 파일은 React 컴포넌트가 아니라(useTranslation 훅 불가)
//   전역 i18n 싱글턴을 직접 불러 t() 대신 i18n.t() 로 결과 문자열을 번역한다(§16 = 기존 i18n 1벌 재사용).
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

// ⚠️ 옛 isAuthenticated(@vibetrip_auth 토큰 유무) 완전삭제 = 2026-07-27 §19.
//   사유: 로그인 판정이 두 벌(토큰 유무 / 사용자 정보)로 갈려 화면마다 결과가 달랐음.
//   현재 판정은 MapToggleContext(getUserData 기반) 1벌뿐.

export async function getUserData(): Promise<UserData | null> {
  // ⚠️ 저장된 실계정(@vibetrip_user)만 반환. 비로그인 = null.
  //   guest_browse 거르기는 게스트 기능 폐지로 불필요해졌으나, 옛 기기에 남은 가짜 계정이
  //   로그인으로 잡히지 않게 그대로 둔다(2026-07-27 §19 = 기능은 삭제, 옛 저장값 방어만 유지).
  try {
    const data = await AsyncStorage.getItem(USER_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && parsed.id && parsed.id !== "guest_browse") return parsed;
    }
  } catch {
    // 저장 조회 실패 = 비로그인 취급
  }
  return null;
}

// ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **저장소에 인증을 쓰면 자동으로 알린다**(§19·§22 "글 아닌 기계").
//   옛 방식 폐기 §19 = 부르는 쪽이 따로 신호를 보내야 했고, 한 곳(관리자 로그인)이 빠뜨려
//   "로그인했는데 앱은 비로그인"이 재발했음(§22 검증이 잡음). 이제 잊을 수가 없다.
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
//   신규 가입은 소셜 3종(구글·카카오·애플)만 = 오타가 새 계정이 되던 통로를 원천 차단.
//   관문 2개 = 메일 + 생년월일이 **둘 다** 그 계정과 맞아야 한다("생년월일은 비번처럼").
//   서버가 주는 사유 = account_not_found / birthdate_mismatch / birthdate_required (화면이 그대로 보여준다).
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
//   사유: 진짜 외부인증 없이 로그인시키던 우회로. 소셜 로그인 = 아래 2개(구글·카카오)가 유일.

type LoginResult = { success: boolean; user?: UserData; error?: string };

/**
 * ⚠️ 수정금지(승인필요) — 소셜 인증 결과를 우리 서버로 보내 로그인하는 **단 하나의 함수** (2026-07-26 §16).
 *   보낼 것(id_token / accessToken / code)만 다르고 나머지(보내기 → 성공이면 저장 → 실패문구)는 전부 같음.
 *   같은 처리 3벌 공존 폐기 = 2026-07-26 §0·§16 (§22 검증 지적).
 */
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

/** Google OAuth 성공 후 id_token으로 로그인 */
export function socialLoginWithGoogle(data: {
  idToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/google", data, i18n.t("login.loginFailed"));
}

/** 카카오 OAuth 성공 후 accessToken으로 로그인 (웹 = 브라우저가 교환한 토큰) */
export function socialLoginWithKakao(data: {
  accessToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/kakao", data, i18n.t("login.loginFailed"));
}

// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 = 애플 로그인(아이폰 전용).
//   애플이 주는 신분증(identityToken)을 우리 서버로 보낸다 = 구글과 **완전히 같은 형식**.
//   이름은 애플이 **맨 처음 로그인할 때 딱 한 번만** 준다(두 번째부터는 안 줌).
//   그래서 받은 그 순간 함께 보내 저장한다 = 나중에는 두 번 다시 받을 수 없다.
export function socialLoginWithApple(data: {
  identityToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
  fullName?: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/apple", data, i18n.t("login.loginFailed"));
}

/** WhatsApp OTP 발송 */
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

/** WhatsApp OTP 검증 후 로그인 */
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
