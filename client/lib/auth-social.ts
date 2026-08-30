// ⚠️ 수정금지(승인필요) — 앱(iOS·Android) 소셜 로그인 3종을 엮는 **단 하나의 함수** (2026-07-31 §0·§16).
import {
  socialLoginWithGoogle,
  socialLoginWithKakao,
  socialLoginWithApple,
} from "./auth";
import { isGoogleOAuthConfigured, signInWithGoogle } from "./auth-google";
import { isKakaoOAuthConfigured, loginKakaoApp } from "./auth-kakao";
import { isAppleAuthAvailable, signInWithApple } from "./auth-apple";

export type SocialProvider = "google" | "kakao" | "apple";

export function isSocialConfigured(provider: SocialProvider): boolean {
  if (provider === "google") return isGoogleOAuthConfigured();
  if (provider === "kakao") return isKakaoOAuthConfigured();
  return isAppleAuthAvailable();
}

export async function runNativeSocial(
  provider: SocialProvider,
  ctx: { birthDate: string; language: string },
): Promise<{ success: boolean; error?: string } | null> {
  const common = { ...ctx, deviceType: "mobile" };

  if (provider === "google") {
    const idToken = await signInWithGoogle();
    if (!idToken) return null; // 구글 창을 닫음
    return socialLoginWithGoogle({ idToken, ...common });
  }

  if (provider === "kakao") {
    const accessToken = await loginKakaoApp();
    return socialLoginWithKakao({ accessToken, ...common });
  }

  const apple = await signInWithApple();
  if (!apple) return null; // 애플 창을 닫음
  return socialLoginWithApple({
    identityToken: apple.identityToken,
    fullName: apple.fullName,
    ...common,
  });
}
