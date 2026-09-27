// 애플 로그인 라우트 = Worker 이관본. 응답·상태코드·에러문구는 원본과 같게 유지한다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as schema from "../shared/schema";
import {
  APPLE_DEFAULT_NAME,
  findOrCreateUser,
  loginResponse,
} from "./auth-user";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// ── 애플 신분증 확인 ────────────────────────────

// app.json 에서 읽던 값. Worker 는 파일이 없어 상수로 고정(2026-09-06).
// ⚠️ 드리프트 주의 = app.json 의 expo.ios.bundleIdentifier 가 바뀌면 **여기도 함께 바꿔야 한다.**
//   (Worker 에는 파일시스템도 process.cwd() 도 없어 app.json 을 읽을 수 없다.)
const APPLE_BUNDLE_ID = "com.sonanie.guide";

const APPLE_ISSUER = "https://appleid.apple.com";

const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

// getAppleAudiences 와 동일(열쇠 게이트가 채운 process.env 를 읽는다).
function getAppleAudiences(): string[] {
  const fromEnv = (process.env.APPLE_CLIENT_ID || "").trim();
  return fromEnv && fromEnv !== APPLE_BUNDLE_ID
    ? [APPLE_BUNDLE_ID, fromEnv]
    : [APPLE_BUNDLE_ID];
}

type AppleIdentity = {
  providerId: string;
  email?: string;
  emailVerified: boolean;
};

/** verifyAppleIdentityToken 과 동일. */
async function verifyAppleIdentityToken(
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

// ── 라우트 ────────────────────────────────────────────────────────────────

export function registerAppleAuthRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 — 애플 로그인(아이폰 전용).
  app.post("/api/auth/apple", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const {
        identityToken,
        birthDate,
        language,
        deviceType,
        fullName,
        entry,
      } = req.body || {};
      // 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = 신분증만 필수.
      if (!identityToken) {
        return res
          .status(400)
          .json({ success: false, error: "identityToken is required" });
      }
      const identity = await verifyAppleIdentityToken(String(identityToken));
      if (!identity) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Apple token" });
      }
      const displayName =
        (typeof fullName === "string" && fullName.trim()) ||
        identity.email ||
        APPLE_DEFAULT_NAME;
      const user = await findOrCreateUser(db, {
        provider: "apple",
        providerId: identity.providerId,
        email: identity.email,
        emailVerified: identity.emailVerified,
        birthDate,
        displayName,
        language,
        deviceType,
        entry,
      });
      res.json(loginResponse(user));
    } catch (e) {
      console.error("[Auth] Apple Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Apple login" });
    } finally {
      close();
    }
  });
}
