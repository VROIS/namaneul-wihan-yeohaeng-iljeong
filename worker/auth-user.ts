// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 로그인 1벌 = 토큰 → 사용자 번호·역할 · 사용자 조회 · 계정 찾기·만들기 · 소셜 연결 · 로그인 처리 · 사용자 정보 변환 (정본 9-27)
import type { Request } from "express";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type User, userProviders, users } from "../shared/schema";
import { grantSignupBonus } from "../shared/credits";

type Db = PgDatabase<PgQueryResultHKT, any>;

export function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

export async function getRoleFromDb(db: Db, userId: string): Promise<string> {
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  return u?.role || "user";
}

export const KAKAO_DEFAULT_NAME = "카카오 사용자";
export const GOOGLE_DEFAULT_NAME = "Google User";
export const APPLE_DEFAULT_NAME = "Apple User";
const SOCIAL_DEFAULT_NAMES = new Set([
  KAKAO_DEFAULT_NAME,
  GOOGLE_DEFAULT_NAME,
  APPLE_DEFAULT_NAME,
]);

export async function getUserByEmail(
  db: Db,
  email: string,
): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
  return user || undefined;
}

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
  } catch {}
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.providerId, providerId)));
  return user || undefined;
}

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

type LoginOpts = {
  birthDate?: string;
  language?: string;
  deviceType?: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  provider?: string;
  providerId?: string;
  entry?: string;
};

export async function applyLogin(
  db: Db,
  user: User,
  opts: LoginOpts,
): Promise<User> {
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
      // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 유입 경로 = 들어올 때마다 갱신(기존 가입자도 어디로 들어왔는지 보이게)
      referredBy: opts.entry || user.referredBy,
      ...(incomingIsRealName && nameIsPlaceholder
        ? { displayName: opts.displayName }
        : {}),
    })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}

const cleanSignupRef = (v: unknown): string | null =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;

/** ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 계정 조회·생성 1벌 = 소셜 3종과 이메일이 같이 쓴다(§16 재발명 금지). */
export async function findOrCreateUser(
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
    entry?: string; // 유입 경로(main | bts) = shared/login-entry
    ref?: unknown; // 처음 들어온 링크의 ref = 가입 때만 남김
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
    entry,
  } = params;
  const signupRef = cleanSignupRef(params.ref);

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
      entry,
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
        entry,
      });
  }

  const username = `${provider}_${providerId.substring(0, 12)}_${Math.random().toString(36).substring(2, 6)}`;
  const emailFree = email ? !(await getUserByEmail(db, email)) : false;

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
      // ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 신규 가입 때 인증창(main/bts) + 처음 들어온 링크의 ref 를 남긴다 (정본 §큰 일 4)
      referredBy: entry,
      signupRef,
      loginCount: 1,
      lastLoginAt: new Date(),
      isPaid: false,
      planType: "free",
    })
    .returning();

  try {
    await linkProvider(db, created.id, provider, providerId);
  } catch {}

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

export async function getFirstAdmin(db: Db): Promise<User | undefined> {
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.createdAt)
    .limit(1);
  return admin || undefined;
}

export function loginResponse(user: User) {
  return {
    success: true as const,
    user: toClientUser(user),
    token: "simple_auth_token_v1_" + user.id,
  };
}
