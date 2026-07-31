// ⚠️ 수정금지(승인필요) — 앱(iOS·Android) 소셜 로그인 3종을 엮는 **단 하나의 함수** (2026-07-31 §0·§16).
//
// 왜 만들었나(§22 검증이 잡은 실제 결함):
//   메인 인증창(LoginSheet)과 아미봉 인증창(BTSLandingScreen)이 **같은 일을 각자 따로** 하고 있었다.
//   그러다 보니 이미 서로 달라져 있었다 — 메인은 "열쇠가 있는지" 먼저 보고 막는데
//   아미봉은 그 검사가 없어서, 열쇠가 안 들어온 상태로 누르면 알 수 없는 오류만 떴다.
//   두 창이 이 파일 1벌만 부르게 하면 = 앞으로 어느 한쪽만 달라지는 일이 생길 수 없다.
//
// 여기서 하는 일 = "외부에서 표 받기 → 우리 서버로 로그인" 까지.
//   화면에 뭘 보여줄지(성공하면 어디로 갈지·실패 안내)는 **부르는 쪽이 정한다** = 화면마다 다르므로.
import {
  socialLoginWithGoogle,
  socialLoginWithKakao,
  socialLoginWithApple,
} from "./auth";
import { isGoogleOAuthConfigured, signInWithGoogle } from "./auth-google";
import { isKakaoOAuthConfigured, loginKakaoApp } from "./auth-kakao";
import { isAppleAuthAvailable, signInWithApple } from "./auth-apple";

export type SocialProvider = "google" | "kakao" | "apple";

/** 그 소셜을 지금 쓸 수 있는지(열쇠가 있는지·이 기기에서 되는지). 두 인증창이 같은 기준으로 막는다. */
export function isSocialConfigured(provider: SocialProvider): boolean {
  if (provider === "google") return isGoogleOAuthConfigured();
  if (provider === "kakao") return isKakaoOAuthConfigured();
  return isAppleAuthAvailable();
}

/**
 * 앱 소셜 로그인 = 외부 창 → 표 받기 → 우리 서버 로그인.
 * **null = 사용자가 창을 닫음(취소) = 실패 아님.**
 * 생년월일은 인증 조건이 아니라 "우리가 저장할 값"으로 함께 보낸다(생년월일-인증 분리 SSOT).
 */
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
