// 구글·카카오 로그인 라우트 = Worker 이관본. 응답·상태코드·에러문구는 원본과 같게 유지한다.
// 원본 = server/auth.ts:106(구글) · server/auth.ts:161(카카오) · server/auth.ts:32(카카오 본문)
//        · server/auth-user.ts · server/storage.ts · server/creditService.ts.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const { apiKeys, creditTransactions, users, userProviders } = schema;

type User = typeof users.$inferSelect;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// ── 열쇠 공급 ──────────────────────────────────────────────────────────────
// Worker 는 부팅(모듈 평가) 시점에 process.env 가 비어 있고, 요청 밖 I/O 도 금지된다.
// 그래서 원본처럼 모듈 최상단에서 읽지 않고, 라우트가 실행될 때 DB api_keys 로 채운다.
// 방식 = worker/routes-expert-bts.ts:874 `/api/bts/map-config` 과 동일(같은 openDb 로 조회 후 주입).
// 별칭 파생 = server/index.ts:341~347 · worker/keys.ts:applyKey 과 동일 규칙.
const SOCIAL_KEY_NAMES = [
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "KAKAO_APP_ID",
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
      // server/index.ts:341~347 = 이 두 이름은 서로의 별칭으로도 채운다.
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

// ── 구글 신분증 확인 (원본 server/auth.ts:16~30) ────────────────────────────
// 원본은 모듈 최상단에서 process.env 를 읽지만, Worker 는 그 시점에 값이 없어 빈 문자열로
// 굳는다(gotchas.md:25 "Cannot fetch in global scope" 와 같은 부팅 시점 제약).
// 그래서 같은 식을 **함수 안**으로 옮겼다 = 값만 같고 읽는 시점만 다르다.
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

// ── 원본 헬퍼의 쿼리 이식 (server/db.ts 미탑재분) ───────────────────────────

/** 원본 server/auth-user.ts:24 = 소셜별 닉네임 기본문구. */
const KAKAO_DEFAULT_NAME = "카카오 사용자";
const GOOGLE_DEFAULT_NAME = "Google User";
const APPLE_DEFAULT_NAME = "Apple User";
const SOCIAL_DEFAULT_NAMES = new Set([
  KAKAO_DEFAULT_NAME,
  GOOGLE_DEFAULT_NAME,
  APPLE_DEFAULT_NAME,
]);

/** 원본 server/storage.ts:75 getUserByEmail = DB 단 대소문자 무시(lower 비교). */
async function getUserByEmail(
  db: Db,
  email: string,
): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
  return user || undefined;
}

/** 원본 server/storage.ts:128 getUserByProvider = user_providers 우선, 없으면 users 열 조회. */
async function getUserByProvider(
  db: Db,
  provider: string,
  providerId: string,
): Promise<User | undefined> {
  try {
    const [row] = await db
      .select({ user: users })
      .from(userProviders)
      .innerJoin(users, eq(userProviders.userId, users.id))
      .where(
        and(
          eq(userProviders.provider, provider),
          eq(userProviders.providerId, providerId),
        ),
      );
    if (row) return row.user;
  } catch {
    /* user_providers 조회 실패 = 아래 users 열 조회로 계속(원본과 동일) */
  }
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.providerId, providerId)));
  return user || undefined;
}

/** 원본 server/storage.ts:154 linkProvider. */
async function linkProvider(
  db: Db,
  userId: string,
  provider: string,
  providerId: string,
): Promise<void> {
  await db
    .insert(userProviders)
    .values({ userId, provider, providerId })
    .onConflictDoNothing({
      target: [userProviders.provider, userProviders.providerId],
    });
}

/** 원본 server/creditService.ts:92 grantSignupBonus + :36 addCredits (SIGNUP_BONUS=50). */
const SIGNUP_BONUS = 50;

async function grantSignupBonus(db: Db, userId: string): Promise<void> {
  const [existingBonus] = await db
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "signup_bonus"),
      ),
    )
    .limit(1);

  if (existingBonus) {
    console.log(`User ${userId} already received signup bonus`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(creditTransactions).values({
      userId,
      type: "signup_bonus",
      amount: SIGNUP_BONUS,
      description: `신규 가입 보너스 ${SIGNUP_BONUS} 크레딧 🎁`,
    });
    await tx
      .update(users)
      .set({
        credits: sql`COALESCE(${users.credits}, 0) + ${SIGNUP_BONUS}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });
}

type LoginOpts = {
  birthDate?: string;
  language?: string;
  deviceType?: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  provider?: string;
  providerId?: string;
};

/** 원본 server/auth-user.ts:32 applyLogin = 로그인 성공 시 기존 계정 반영 1벌. */
async function applyLogin(db: Db, user: User, opts: LoginOpts): Promise<User> {
  const nameIsPlaceholder =
    !user.displayName || SOCIAL_DEFAULT_NAMES.has(user.displayName);
  const incomingIsRealName =
    !!opts.displayName && !SOCIAL_DEFAULT_NAMES.has(opts.displayName);

  let emailToFill: string | undefined;
  if (opts.email && opts.emailVerified && !user.email) {
    const owner = await getUserByEmail(db, opts.email);
    if (!owner) emailToFill = opts.email;
    else if (owner.id !== user.id)
      console.warn(
        `[Auth] 메일 ${opts.email} 은 다른 계정(${owner.id}) 소유 = 채우지 않음`,
      );
  }

  if (opts.provider && opts.providerId) {
    try {
      await linkProvider(db, user.id, opts.provider, opts.providerId);
    } catch (e) {
      console.warn(
        "[Auth] linkProvider 실패(로그인은 계속):",
        (e as Error)?.message,
      );
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-08-08 = **탈퇴 유예 중 다시 로그인하면 되살린다.**
  const wasDeleted = user.accountStatus === "deleted";

  // 원본 server/storage.ts:167 updateUserLogin = updatedAt 은 넘기지 않는다.
  const [updated] = await db
    .update(users)
    .set({
      ...(emailToFill ? { email: emailToFill } : {}),
      ...(wasDeleted ? { accountStatus: "active", deletedAt: null } : {}),
      lastLoginAt: new Date(),
      loginCount: (user.loginCount || 0) + 1,
      deviceType: opts.deviceType,
      preferredLanguage: opts.language || user.preferredLanguage,
      birthDate: opts.birthDate || user.birthDate,
      ...(incomingIsRealName && nameIsPlaceholder
        ? { displayName: opts.displayName }
        : {}),
    })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}

/** 원본 server/auth-user.ts:88 findOrCreateUser = provider+providerId(소셜 인증 신원)로만 매칭. */
async function findOrCreateUser(
  db: Db,
  params: {
    provider: string;
    providerId: string;
    birthDate?: string;
    email?: string;
    emailVerified?: boolean;
    displayName: string;
    language?: string;
    deviceType?: string;
  },
): Promise<User> {
  const {
    provider,
    providerId,
    birthDate,
    email,
    emailVerified,
    displayName,
    language,
    deviceType,
  } = params;

  const user = await getUserByProvider(db, provider, providerId);
  if (user)
    return applyLogin(db, user, {
      birthDate,
      language,
      deviceType,
      displayName,
      email,
      emailVerified,
      provider,
      providerId,
    });

  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **메일 1개 = 그 사람의 신원**.
  if (email && emailVerified) {
    const byEmail = await getUserByEmail(db, email);
    if (byEmail)
      return applyLogin(db, byEmail, {
        birthDate,
        language,
        deviceType,
        displayName,
        email,
        emailVerified,
        provider,
        providerId,
      });
  }

  const username = `${provider}_${providerId.substring(0, 12)}_${Math.random().toString(36).substring(2, 6)}`;
  const emailFree = email ? !(await getUserByEmail(db, email)) : false;

  // 원본 server/storage.ts:102 createUser = insert 후 linkProvider(실패해도 무시).
  const [created] = await db
    .insert(users)
    .values({
      username,
      password: "social_login_no_password",
      displayName,
      email: emailFree && emailVerified ? email : undefined,
      provider,
      providerId,
      birthDate,
      preferredLanguage: language || "ko",
      deviceType,
      loginCount: 1,
      lastLoginAt: new Date(),
      isPaid: false,
      planType: "free",
    })
    .returning();

  try {
    await linkProvider(db, created.id, provider, providerId);
  } catch {
    /* 원본 server/storage.ts:110 과 동일하게 조용히 무시 */
  }

  // ⚠️ 수정금지(승인필요) — 가입 보너스 50 크레딧(2026-08-05 조정 = CLAUDE.md §9).
  try {
    await grantSignupBonus(db, created.id);
  } catch (e) {
    console.warn(
      "[Auth] 가입 보너스 지급 실패(로그인은 계속):",
      (e as Error)?.message,
    );
  }

  return created;
}

/** 원본 server/auth-user.ts:170 toClientUser = 모든 로그인 응답의 user 객체 1벌. */
function toClientUser(user: User) {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    provider: user.provider,
    birthDate: user.birthDate,
    language: user.preferredLanguage,
    isPaid: user.isPaid,
    planType: user.planType,
    role: user.role,
  };
}

// ── 카카오 본문 (원본 server/auth.ts:32 loginWithKakaoAccessToken) ──────────

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

// ⚠️ 수정금지(승인필요) — 카카오 accessToken → 우리 로그인 = 이 함수 1벌만 (2026-07-26 §16).
async function loginWithKakaoAccessToken(
  db: Db,
  params: {
    accessToken: string;
    birthDate?: string;
    language?: string;
    deviceType?: string;
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
  });
  return {
    success: true as const,
    user: toClientUser(user),
    token: "simple_auth_token_v1_" + user.id,
  };
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
  // 원본 server/auth.ts:106
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const { idToken, birthDate, language, deviceType } = req.body || {};
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
      });
      res.json({
        success: true,
        user: toClientUser(user),
        token: "simple_auth_token_v1_" + user.id,
      });
    } catch (e) {
      console.error("[Auth] Google Error:", e);
      res
        .status(500)
        .json({ success: false, error: "Failed to process Google login" });
    } finally {
      close();
    }
  });

  // 원본 server/auth.ts:161
  app.post("/api/auth/kakao", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const { accessToken, birthDate, language, deviceType } = req.body || {};
      // ⚠️ 사장님 SSOT 2026-07-26(세션2-D) = 외부인증에서 생년월일 분리 = accessToken(인증 신원)만 필수. 생년월일은 findOrCreateUser 가 저장/갱신(신규 생성 / 기존 통과).
      if (!accessToken) {
        return res.status(400).json({
          success: false,
          error: "accessToken is required",
        });
      }
      await loadSocialKeys(db);
      const result = await loginWithKakaoAccessToken(db, {
        accessToken: String(accessToken),
        birthDate,
        language,
        deviceType,
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
