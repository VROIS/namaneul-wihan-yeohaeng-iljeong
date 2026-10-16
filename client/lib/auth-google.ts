// ⚠️ 수정금지(승인필요) — 구글 로그인 "앱(iOS·Android)" 전용 경로 (2026-07-26 신설)
import { Platform } from "react-native";
import type { GoogleAuthRequestTuple } from "./auth-oauth";
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
} from "./app-keys";

const webClientIdForPlatform =
  Platform.OS === "android" ? GOOGLE_ANDROID_CLIENT_ID : GOOGLE_WEB_CLIENT_ID;

export function isGoogleOAuthConfigured(): boolean {
  return Platform.OS === "ios"
    ? !!(GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID)
    : !!webClientIdForPlatform;
}

const NOOP_PROMPT = async () => null;
export function useGoogleAuthRequest(): GoogleAuthRequestTuple {
  return [null, null, NOOP_PROMPT];
}

let configured = false;

export async function signInWithGoogle(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require("@react-native-google-signin/google-signin");

  if (!configured) {
    GoogleSignin.configure({
      webClientId: webClientIdForPlatform,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    });
    configured = true;
  }

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices();
  }

  const result = await GoogleSignin.signIn();
  if (result?.type === "cancelled") return null; // 사용자가 창을 닫음

  const idToken: string | null = result?.data?.idToken ?? null;
  if (!idToken) throw new Error("구글에서 인증 정보를 받지 못했습니다.");
  return idToken;
}
