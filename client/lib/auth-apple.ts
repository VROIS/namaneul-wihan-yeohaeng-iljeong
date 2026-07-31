// ⚠️ 수정금지(승인필요) — 애플 로그인 "앱(iOS)" 전용 경로 (2026-07-31 사장님 지시)
// 웹은 같은 폴더의 auth-apple.web.ts 가 Metro 플랫폼 확장자로 자동 선택됨
// = 한 플랫폼에 경로 1벌만 존재(§0). 애플 부품이 웹 번들에 섞이는 것도 원천 차단.
// 구조는 auth-google.ts 와 **똑같이** 맞췄다(§16 = 새로 지어내지 않음).
import { Platform } from "react-native";

/**
 * 애플 로그인 버튼을 보여줄지 판단.
 * 애플은 **아이폰에서만** 이 기능을 제공한다(안드로이드용 부품 자체가 없음).
 * 그래서 안드로이드·웹에서는 버튼을 아예 만들지 않는다.
 */
export function isAppleAuthAvailable(): boolean {
  return Platform.OS === "ios";
}

/**
 * 애플 로그인 → { identityToken, fullName } 반환. **사용자가 취소하면 null**(실패 아님).
 * - identityToken = 애플이 서명한 신분증. 우리 서버가 이 서명을 검사해 진짜인지 판단한다.
 * - ⚠️ 이름(fullName)은 애플이 **맨 처음 로그인할 때 딱 한 번만** 준다.
 *   두 번째부터는 빈 값이 오므로, 받은 그 순간에 서버로 넘겨 저장해야 한다.
 * - 부품은 버튼을 누른 순간에만 불러옴 = 부품이 없는 Expo Go 에서도 앱 자체는 안 깨짐
 *   (구글 로그인과 같은 방식).
 */
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

    // 이름 = 애플이 성/이름을 따로 준다. 있는 것만 이어 붙인다(둘 다 없으면 안 보냄).
    const name = [
      credential?.fullName?.givenName,
      credential?.fullName?.familyName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return { identityToken, fullName: name || undefined };
  } catch (err) {
    // ⚠️ 애플은 사용자가 창을 닫으면 **예외를 던진다**(구글은 정상 반환) = 여기서 취소를 가려낸다.
    //   취소는 실패가 아니므로 조용히 끝낸다(빨간 실패 안내를 띄우면 안 된다).
    if ((err as { code?: string } | null)?.code === "ERR_REQUEST_CANCELED") {
      return null;
    }
    throw err;
  }
}
