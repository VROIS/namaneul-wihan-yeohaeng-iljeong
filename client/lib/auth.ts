import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";
import { KAKAO_APP_API_ORIGIN } from "./auth-kakao";

const AUTH_KEY = "@vibetrip_auth";
const USER_KEY = "@vibetrip_user";

// ⚠️ 사장님 SSOT 2026-07-15 = 실제 로그인만 = 저장 토큰 유무로만 판정. DEV 자동로그인 목업 완전삭제 §19(로그아웃 무효·로그인실패 은폐 근본원인).

export interface UserData {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  provider: "kakao" | "google" | "whatsapp";
  language: string;
  birthDate: string;
  ageGroup?: string;
  isPaid?: boolean;
  planType?: string;
  role?: string; // user | expert | admin = 전문가/관리자 화면 분기(서버 toClientUser 가 실어줌)
  token?: string;
  createdAt?: string;
}

export async function isAuthenticated(): Promise<boolean> {
  // 저장 토큰(@vibetrip_auth) 존재로만 판정 = 실제 로그인/로그아웃이 정확히 반영.
  try {
    const token = await AsyncStorage.getItem(AUTH_KEY);
    return token !== null;
  } catch {
    return false;
  }
}

export async function getUserData(): Promise<UserData | null> {
  // ⚠️ 사장님 SSOT 2026-07-15 = 저장된 실계정(@vibetrip_user)만 반환. 게스트(둘러보기)·비로그인 = null. DEV 목업 폴백 완전삭제 §19.
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

export async function saveAuth(userData: UserData): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_KEY, "authenticated");
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
  } catch (error) {
    console.error("Failed to save auth:", error);
  }
}

export async function clearAuth(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([AUTH_KEY, USER_KEY]);
  } catch (error) {
    console.error("Failed to clear auth:", error);
  }
}

// ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인 = 구글 OAuth(웹 400) 우회. 메일만 넣으면 그 계정으로 로그인(사장님 메일=admin).
//   ⚠️ 임시(개발용) = 로그인 정식화 때 폐기 §19. 기존 saveAuth·UserData 재사용(§16).
// ⚠️ 사장님 SSOT 2026-07-26 = 이메일 = 지메일 아닌 메일로 하는 정식 인증.
//   생년월일은 인증 조건이 아니라 "우리가 저장할 값"으로 함께 보냄(소셜 2종과 동일 구조).
export async function emailLogin(data: {
  email: string;
  birthDate: string;
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
    if (response.status === 404)
      return { success: false, error: "email_not_found" };
    return { success: false, error: result.error || "로그인 실패" };
  } catch (error) {
    console.error("Email login error:", error);
    return { success: false, error: "서버 연결 실패" };
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
  origin: string = getApiUrl(),
): Promise<LoginResult> {
  try {
    const response = await fetch(`${origin}${path}`, {
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
    return { success: false, error: "서버 연결 실패" };
  }
}

/** Google OAuth 성공 후 id_token으로 로그인 */
export function socialLoginWithGoogle(data: {
  idToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/google", data, "Google 로그인 실패");
}

/** 앱 카카오 로그인 = 서버가 봉한 표를 열어 토큰으로 바꿔 로그인.
 *  nonce = 이 폰이 시작한 로그인임을 증명하는 값(가로챈 표를 못 쓰게 함, 2026-07-26). */
export function socialLoginWithKakaoApp(data: {
  ticket: string;
  nonce: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  // ⚠️ 카카오 앱 경로만 운영 주소 고정 = 표를 봉한 서버와 여는 서버를 같게(auth-kakao.ts 주석 참조)
  return postSocialLogin(
    "/api/auth/kakao/code",
    data,
    "카카오 로그인 실패",
    KAKAO_APP_API_ORIGIN,
  );
}

/** 카카오 OAuth 성공 후 accessToken으로 로그인 (웹 = 브라우저가 교환한 토큰) */
export function socialLoginWithKakao(data: {
  accessToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<LoginResult> {
  return postSocialLogin("/api/auth/kakao", data, "카카오 로그인 실패");
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
    return { success: false, error: result.error || "OTP 발송 실패" };
  } catch (error) {
    console.error("WhatsApp OTP send error:", error);
    return { success: false, error: "서버 연결 실패" };
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
    return { success: false, error: result.error || "WhatsApp 로그인 실패" };
  } catch (error) {
    console.error("WhatsApp OTP verify error:", error);
    return { success: false, error: "서버 연결 실패" };
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
  if (age < 20) return "10대";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  if (age < 50) return "40대";
  if (age < 60) return "50대";
  return "60대+";
}
