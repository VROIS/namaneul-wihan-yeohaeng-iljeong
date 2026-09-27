// 구글·카카오 로그인 라우트 = Worker 이관본. 응답·상태코드·에러문구는 원본과 같게 유지한다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { createLocalJWKSet, jwtVerify } from "jose";
import * as schema from "../shared/schema";
import {
  GOOGLE_DEFAULT_NAME,
  KAKAO_DEFAULT_NAME,
  findOrCreateUser,
  loginResponse,
} from "./auth-user";

const { apiKeys } = schema;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// ── 열쇠 공급 ──────────────────────────────────────────────────────────────
const SOCIAL_KEY_NAMES = [
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "KAKAO_APP_ID",
  "KAKAO_REST_API_KEY",
  "KAKAO_NATIVE_APP_KEY",
  "KAKAO_JWKS",
];

async function loadSocialKeys(db: Db): Promise<void> {
  try {
    const rows = await db
      .select({ keyName: apiKeys.keyName, keyValue: apiKeys.keyValue })
      .from(apiKeys)
      .where(
        and(
          inArray(apiKeys.keyName, SOCIAL_KEY_NAMES),
          eq(apiKeys.isActive, true),
        ),
      );
    for (const row of rows) {
      const value = (row.keyValue || "").trim();
      if (!value) continue;
      process.env[row.keyName] = value;
      // 이 두 이름은 서로의 별칭으로도 채운다.
      if (
        row.keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
        row.keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
      ) {
        process.env.GOOGLE_CLIENT_ID = value;
        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = value;
      }
    }
  } catch (e) {
    console.error("[Auth] 소셜 열쇠 조회 실패:", (e as Error)?.message);
  }
}

// ── 구글 신분증 확인 ────────────────────────────
// 워커는 부팅 시점에 process.env 가 비어 있어, 모듈 최상단에서 읽으면 빈 문자열로 굳는다 = 같은 식을 **함수 안**으로 옮겼다.
function isValidGoogleAudience(v: string | undefined): boolean {
  if (!v) return false;
  const googleClientId = (
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  const googleClientIdAndroid = (
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || ""
  ).trim();
  return (
    v === googleClientId ||
    (!!googleClientIdAndroid && v === googleClientIdAndroid)
  );
}

// ── 카카오 본문 ──────────

type KakaoTokenInfo = { app_id?: number | string };

type KakaoMe = {
  id?: number | string;
  kakao_account?: {
    id?: number | string;
    email?: string | null;
    is_email_verified?: boolean;
    profile?: { nickname?: string | null; name?: string | null };
  };
  properties?: { nickname?: string | null };
};

// ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 카카오 공개 열쇠 = 금고(KAKAO_JWKS) 1벌, 관제탑이 매일 갱신하고 금고에 없는 열쇠 번호일 때만 로그인 중 1회 갱신 (정본 9-25)
export async function refreshKakaoJwks(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
): Promise<string> {
  const res = await fetch("https://kauth.kakao.com/.well-known/jwks.json");
  const text = await res.text();
  const keys = res.ok ? (JSON.parse(text) as { keys?: unknown[] }).keys : null;
  if (!Array.isArray(keys) || keys.length === 0)
    throw new Error(`카카오 공개 열쇠 받기 실패: ${res.status}`);
  await db
    .update(apiKeys)
    .set({ keyValue: text, updatedAt: sql`now()` })
    .where(and(eq(apiKeys.keyName, "KAKAO_JWKS"), ne(apiKeys.keyValue, text)));
  process.env.KAKAO_JWKS = text;
  return text;
}

type KakaoIdClaims = { sub: string; nickname?: string };

// ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 카카오 ID 토큰을 우리 서버가 직접 확인 = 카카오 호출 0번(발급처·받는 앱·만료·서명), 신원 = 카카오 회원번호(sub) (정본 9-25)
async function verifyKakaoIdToken(
  db: Db,
  idToken: string,
): Promise<KakaoIdClaims> {
  const audience = [
    process.env.KAKAO_REST_API_KEY,
    process.env.KAKAO_NATIVE_APP_KEY,
  ]
    .map((v) => (v || "").trim())
    .filter(Boolean);
  const verify = async (jwks: string) =>
    (
      await jwtVerify(idToken, createLocalJWKSet(JSON.parse(jwks)), {
        issuer: "https://kauth.kakao.com",
        audience,
        requiredClaims: ["sub", "exp"],
      })
    ).payload as KakaoIdClaims;
  const stored = process.env.KAKAO_JWKS;
  try {
    if (stored) return await verify(stored);
  } catch (e) {
    if ((e as { code?: string }).code !== "ERR_JWKS_NO_MATCHING_KEY") throw e;
  }
  return verify(await refreshKakaoJwks(db));
}

async function loginWithKakaoIdToken(
  db: Db,
  params: {
    idToken: string;
    birthDate?: string;
    language?: string;
    deviceType?: string;
    entry?: string;
  },
) {
  let claims: KakaoIdClaims;
  try {
    claims = await verifyKakaoIdToken(db, params.idToken);
  } catch (e) {
    console.error(
      "[Auth] 카카오 ID 토큰 거부:",
      (e as { code?: string }).code || (e as Error).message,
    );
    return null;
  }
  const user = await findOrCreateUser(db, {
    provider: "kakao",
    providerId: claims.sub,
    birthDate: params.birthDate,
    displayName: claims.nickname || KAKAO_DEFAULT_NAME,
    language: params.language,
    deviceType: params.deviceType,
    entry: params.entry,
  });
  return loginResponse(user);
}

// ⚠️ 수정금지(승인필요) — 카카오 accessToken → 우리 로그인 = 이 함수 1벌만 (2026-07-26 §16).
async function loginWithKakaoAccessToken(
  db: Db,
  params: {
    accessToken: string;
    birthDate?: string;
    language?: string;
    deviceType?: string;
    entry?: string;
  },
) {
  // ⚠️ 수정금지(승인필요) — 받은 출입증이 **우리 카카오 앱에서 발급된 것인지** 먼저 확인 (2026-07-27 사장님 승인).
  const ourAppId = (process.env.KAKAO_APP_ID || "").trim();
  if (!ourAppId) {
    console.error(
      "[Auth] KAKAO_APP_ID 없음 = 카카오 로그인 차단(api_keys 확인 필요)",
    );
    return null;
  }
  const infoRes = await fetch(
    "https://kapi.kakao.com/v1/user/access_token_info",
    { headers: { Authorization: `Bearer ${params.accessToken}` } },
  );
  if (!infoRes.ok) {
    console.error("[Auth] Kakao access_token_info 실패:", await infoRes.text());
    return null;
  }
  const info = (await infoRes.json()) as KakaoTokenInfo;
  if (String(info.app_id) !== ourAppId) {
    console.error(
      `[Auth] 다른 앱의 카카오 출입증 거부: app_id=${info.app_id} (우리=${ourAppId})`,
    );
    return null;
  }

  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!meRes.ok) {
    console.error("[Auth] Kakao /v2/user/me failed:", await meRes.text());
    return null;
  }
  const meData = (await meRes.json()) as KakaoMe;
  const providerId = String(meData.id ?? meData.kakao_account?.id);
  const displayName =
    meData.kakao_account?.profile?.nickname ||
    meData.kakao_account?.profile?.name ||
    meData.properties?.nickname ||
    KAKAO_DEFAULT_NAME;
  const user = await findOrCreateUser(db, {
    provider: "kakao",
    providerId,
    email: meData.kakao_account?.email || undefined,
    emailVerified: meData.kakao_account?.is_email_verified === true,
    birthDate: params.birthDate,
    displayName,
    language: params.language,
    deviceType: params.deviceType,
    entry: params.entry,
  });
  return loginResponse(user);
}

// ── 라우트 ────────────────────────────────────────────────────────────────

type GoogleTokenInfo = {
  aud?: string;
  azp?: string;
  sub?: string;
  name?: string;
  email?: string;
  email_verified?: boolean | string;
};

export function registerSocialAuthRoutes(app: Express, openDb: OpenDb): void {
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const { idToken, birthDate, language, deviceType, entry } =
        req.body || {};
      // ⚠️ 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = idToken(인증 신원)만 필수.
      if (!idToken) {
        return res.status(400).json({
          success: false,
          error: "idToken is required",
        });
      }
      await loadSocialKeys(db);
      const tokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(idToken))}`,
      );
      if (!tokenRes.ok) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Google token" });
      }
      const tokenData = (await tokenRes.json()) as GoogleTokenInfo;
      if (
        !isValidGoogleAudience(tokenData.aud) &&
        !isValidGoogleAudience(tokenData.azp)
      ) {
        return res
          .status(401)
          .json({ success: false, error: "Token audience mismatch" });
      }
      const providerId = String(tokenData.sub);
      const displayName =
        tokenData.name || tokenData.email || GOOGLE_DEFAULT_NAME;
      const user = await findOrCreateUser(db, {
        provider: "google",
        providerId,
        email: tokenData.email,
        emailVerified:
          tokenData.email_verified === true ||
          tokenData.email_verified === "true",
        birthDate,
        displayName,
        language,
        deviceType,
        entry,
      });
      res.json(loginResponse(user));
    } catch (e) {
      console.error("[Auth] Google Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Google login" });
    } finally {
      close();
    }
  });

  app.post("/api/auth/kakao", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const { accessToken, idToken, birthDate, language, deviceType, entry } =
        req.body || {};
      // ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 신원 = ID 토큰(카카오 호출 0번) 또는 accessToken(스토어 아이폰 1.0.4 출시 뒤 삭제), 생년월일은 외부인증과 분리 (정본 9-25)
      if (!accessToken && !idToken) {
        return res.status(400).json({
          success: false,
          error: "accessToken is required",
        });
      }
      await loadSocialKeys(db);
      const common = { birthDate, language, deviceType, entry };
      const result = idToken
        ? await loginWithKakaoIdToken(db, {
            idToken: String(idToken),
            ...common,
          })
        : await loginWithKakaoAccessToken(db, {
            accessToken: String(accessToken),
            ...common,
          });
      if (!result) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid Kakao token" });
      }
      res.json(result);
    } catch (e) {
      console.error("[Auth] Kakao Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Kakao login" });
    } finally {
      close();
    }
  });
}
