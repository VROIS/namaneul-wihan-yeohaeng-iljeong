// ⚠️ 수정금지(승인필요) — 애플 신분증(identityToken) 확인 = 이 함수 1벌만 (2026-07-31 사장님 지시 §16).
import { createRemoteJWKSet, jwtVerify } from "jose";
import fs from "node:fs";
import path from "node:path";

// ⚠️ 수정금지(승인필요) 2026-07-31 = 앱 설정(app.json)에서 번호를 읽는다.
const appConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "app.json"), "utf8"),
) as { expo: { ios: { bundleIdentifier: string } } };

// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **애플도 네이티브**(카카오·구글과 같음).
// ⚠️ 2026-07-31 사장님 결정 = **'내손앱' 과 같은 번호를 쓴다**(`com.sonanie.guide`).
// ⚠️ 수정금지(승인필요) 2026-07-31 §16 = 번호를 **여기 적지 않고 `app.json` 에서 읽는다.**
const APPLE_BUNDLE_ID: string = appConfig.expo.ios.bundleIdentifier;

function getAppleAudiences(): string[] {
  const fromEnv = (process.env.APPLE_CLIENT_ID || "").trim();
  return fromEnv && fromEnv !== APPLE_BUNDLE_ID
    ? [APPLE_BUNDLE_ID, fromEnv]
    : [APPLE_BUNDLE_ID];
}

const APPLE_ISSUER = "https://appleid.apple.com";

const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export type AppleIdentity = {
  providerId: string;
  email?: string;
  emailVerified: boolean;
};

export async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<AppleIdentity | null> {
  try {
    const { payload } = await jwtVerify(identityToken, appleKeys, {
      issuer: APPLE_ISSUER,
      audience: getAppleAudiences(),
    });

    const providerId = String(payload.sub || "");
    if (!providerId) {
      console.error("[Auth] 애플 신분증에 sub 없음 = 거부");
      return null;
    }

    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";

    return {
      providerId,
      email: typeof payload.email === "string" ? payload.email : undefined,
      emailVerified,
    };
  } catch (e) {
    console.error("[Auth] 애플 신분증 확인 실패:", (e as Error).message);
    return null;
  }
}
