import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";

const AUTH_KEY = "@vibetrip_auth";
const USER_KEY = "@vibetrip_user";

export interface UserData {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  provider: "kakao" | "google" | "facebook" | "whatsapp";
  language: string;
  birthDate: string;
  ageGroup?: string;
  isPaid?: boolean;
  planType?: string;
  token?: string;
  createdAt?: string;
}


export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem(AUTH_KEY);
    return token !== null;
  } catch {
    return false;
  }
}

export async function getUserData(): Promise<UserData | null> {
  try {
    const data = await AsyncStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
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

export async function socialLogin(data: {
  provider: "kakao" | "google" | "facebook" | "whatsapp";
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

/** Facebook OAuth 성공 후 code로 로그인 */
export async function socialLoginWithFacebook(data: {
  code: string;
  redirectUri: string;
  birthDate: string;
  language: string;
  deviceType: string;
}): Promise<{ success: boolean; user?: UserData; error?: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/facebook`, {
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
    return { success: false, error: result.error || "Facebook 로그인 실패" };
  } catch (error) {
    console.error("Facebook login error:", error);
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
