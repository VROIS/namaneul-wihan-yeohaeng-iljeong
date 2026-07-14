import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";

const AUTH_KEY = "@vibetrip_auth";
const USER_KEY = "@vibetrip_user";

// 로컬 개발 환경에서 빠른 테스트를 위해 인증 우회를 활성화합니다.
const BYPASS_AUTH_IN_DEV = true;

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
  token?: string;
  createdAt?: string;
}


export async function isAuthenticated(): Promise<boolean> {
  if (__DEV__ && BYPASS_AUTH_IN_DEV) {
    return true;
  }
  try {
    const token = await AsyncStorage.getItem(AUTH_KEY);
    return token !== null;
  } catch {
    return false;
  }
}

export async function getUserData(): Promise<UserData | null> {
  // ⚠️ 사장님 SSOT 2026-07-14 = 실제 로그인(저장된 @vibetrip_user)이 있으면 항상 그것을 우선 반환 = 메일/구글 로그인이 DEV 에서도 실제로 반영됨(옛: DEV 목업이 실 로그인을 덮어 admin 이 무시되던 버그 폐기 §19).
  //   저장된 사용자가 없을 때만(비로그인) DEV 편의 목업 폴백.
  try {
    const data = await AsyncStorage.getItem(USER_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // 게스트(둘러보기)는 실 계정 아님 = DEV 목업 폴백 대상으로 취급(아래).
      if (parsed && parsed.id && parsed.id !== "guest_browse") return parsed;
    }
  } catch {
    // 저장 조회 실패 = 아래 폴백
  }
  if (__DEV__ && BYPASS_AUTH_IN_DEV) {
    return {
      id: "local_dev_user",
      email: "local@example.com",
      name: "로컬 개발자",
      displayName: "로컬 개발자",
      provider: "kakao",
      language: "ko",
      birthDate: "1990-01-01",
      ageGroup: "30대",
      isPaid: true,
      // 2026-07-13 = DEV 목업 토큰도 실제 형식(simple_auth_token_v1_+id) = DEV에서 /api/auth/me·role 조회 등 실제 인증경로 작동(옛 'mock_token_for_dev'=인증불가 폐기 §19).
      token: "simple_auth_token_v1_local_dev_user",
    };
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
export async function emailLogin(email: string): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/email-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      const userData: UserData = { ...result.user, token: result.token };
      await saveAuth(userData);
      return { success: true, user: userData };
    }
    if (response.status === 404) return { success: false, error: "email_not_found" };
    return { success: false, error: result.error || "로그인 실패" };
  } catch (error) {
    console.error("Email login error:", error);
    return { success: false, error: "서버 연결 실패" };
  }
}

export async function socialLogin(data: {
  provider: "kakao" | "google" | "whatsapp";
  providerId?: string;
  birthDate: string;
  language: string;
  deviceType: string;
  displayName?: string;
}): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/social-login`, {
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
    return { success: false, error: result.error || "로그인 실패" };
  } catch (error) {
    console.error("Social login error:", error);
    return { success: false, error: "서버 연결 실패" };
  }
}

/** Google OAuth 성공 후 id_token으로 로그인 */
export async function socialLoginWithGoogle(data: {
  idToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/google`, {
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
    return { success: false, error: result.error || "Google 로그인 실패" };
  } catch (error) {
    console.error("Google login error:", error);
    return { success: false, error: "서버 연결 실패" };
  }
}

/** 카카오 OAuth 성공 후 accessToken으로 로그인 */
export async function socialLoginWithKakao(data: {
  accessToken: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/kakao`, {
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
    return { success: false, error: result.error || "카카오 로그인 실패" };
  } catch (error) {
    console.error("Kakao login error:", error);
    return { success: false, error: "서버 연결 실패" };
  }
}

/** WhatsApp OTP 발송 */
export async function whatsappOtpSend(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
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
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
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
