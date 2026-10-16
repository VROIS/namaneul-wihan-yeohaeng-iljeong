// ⚠️ 수정금지(승인필요) — 애플 로그인 "앱(iOS)" 전용 경로 (2026-07-31 사장님 지시)
import { Platform } from "react-native";

export function isAppleAuthAvailable(): boolean {
  return Platform.OS === "ios";
}

export async function signInWithApple(): Promise<{
  identityToken: string;
  fullName?: string;
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AppleAuthentication = require("expo-apple-authentication");

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const identityToken: string | null = credential?.identityToken ?? null;
    if (!identityToken)
      throw new Error("애플에서 인증 정보를 받지 못했습니다.");

    const name = [
      credential?.fullName?.givenName,
      credential?.fullName?.familyName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return { identityToken, fullName: name || undefined };
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "ERR_REQUEST_CANCELED") {
      return null;
    }
    throw err;
  }
}
