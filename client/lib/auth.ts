import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_KEY = "@vibetrip_auth";
const USER_KEY = "@vibetrip_user";

export interface UserData {
  id: string;
  email: string;
  name: string;
  provider: "kakao" | "google";
  language: string;
  birthDate: string;
  ageGroup: string;
  createdAt: string;
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
