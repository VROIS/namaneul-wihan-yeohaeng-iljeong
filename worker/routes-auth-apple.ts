// 애플 로그인 라우트 = Worker 이관본. 응답·상태코드·에러문구는 원본과 같게 유지한다.
// 원본 = server/auth.ts:192 · server/auth-apple.ts · server/auth-user.ts · server/storage.ts.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as schema from "../shared/schema";

const { creditTransactions, users, userProviders } = schema;

type User = typeof users.$inferSelect;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

// ── 애플 신분증 확인 (원본 server/auth-apple.ts) ────────────────────────────

// 원본 server/auth-apple.ts:8 이 app.json 에서 읽던 값. Worker 는 파일이 없어 상수로 고정(2026-09-06).
// ⚠️ 드리프트 주의 = app.json 의 expo.ios.bundleIdentifier 가 바뀌면 **여기도 함께 바꿔야 한다.**
//   (Worker 에는 파일시스템도 process.cwd() 도 없어 app.json 을 읽을 수 없다.)
const APPLE_BUNDLE_ID = "com.sonanie.guide";

const APPLE_ISSUER = "https://appleid.apple.com";

const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

// 원본 server/auth-apple.ts:16 getAppleAudiences 와 동일(열쇠 게이트가 채운 process.env 를 읽는다).
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

/** 원본 server/auth-apple.ts:35 verifyAppleIdentityToken 과 동일. */
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

// ── 라우트 ────────────────────────────────────────────────────────────────

export function registerAppleAuthRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 지시 — 애플 로그인(아이폰 전용).
  // 원본 server/auth.ts:192
  app.post("/api/auth/apple", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const { identityToken, birthDate, language, deviceType, fullName } =
        req.body || {};
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
      });
      res.json({
        success: true,
        user: toClientUser(user),
        token: "simple_auth_token_v1_" + user.id,
      });
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
