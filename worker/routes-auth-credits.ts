// 계정(메일 로그인·내 정보·탈퇴) + 크레딧(잔액·내역) 라우트 = Worker 이관본.
// 원본 = server/auth.ts · server/payment-routes.ts · server/auth-user.ts · server/storage.ts · server/creditService.ts.
// 응답·상태코드·에러문구는 원본과 같게 유지한다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { desc, eq, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

const { creditTransactions, users, userProviders } = schema;

type User = typeof users.$inferSelect;

type Db = ReturnType<typeof drizzle<typeof schema>>;
export type OpenDb = () => { db: Db; close: () => void };

// 원본 server/auth-user.ts:8 getUserIdFromReq = 헤더 정규식만(DB 무관).
// server/auth-user.ts 를 import 하면 server/db.ts 가 딸려와 Worker 번들이 불가하므로 식만 옮긴다.
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

// 원본 shared/birthdate-policy.ts:5 의 BIRTHDATE_POLICY = 'optional' → BIRTHDATE_REQUIRED = false.
// ⚠️ 드리프트 주의 = shared/birthdate-policy.ts 의 토글을 'required' 로 바꾸면 **여기도 함께 바꿔야 한다.**
//   그 파일을 import 하지 않는 이유 = 토글이 상수라 TS 가 비교식을 TS2367 로 잡는다(본 프로젝트 tsc 에도
//   이미 뜨는 기존 오류). Worker tsc 를 오류 0 으로 유지하려고 값만 옮긴다.
const BIRTHDATE_REQUIRED = false;

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

/** 원본 server/storage.ts:61 getUser. */
async function getUser(db: Db, id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || undefined;
}

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

/** 원본 server/storage.ts:84 markAccountDeleted = 문패만 내린다(아무것도 지우지 않는다). */
async function markAccountDeleted(db: Db, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ accountStatus: "deleted", deletedAt: new Date() })
    .where(eq(users.id, userId));
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

/** 원본 server/creditService.ts:22 getBalance. */
async function getBalance(db: Db, userId: string): Promise<number> {
  const [user] = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  return user?.credits ?? 0;
}

/**
 * 원본 server/creditService.ts:181 getTransactionHistory.
 * 정렬 = created_at 내림차순, 그 뒤 현재 잔액에서 거꾸로 빼며 줄별 balance 를 붙인다(원본과 동일).
 */
async function getTransactionHistory(
  db: Db,
  userId: string,
  limit: number,
): Promise<(typeof creditTransactions.$inferSelect & { balance: number })[]> {
  const transactions = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit);

  const currentBalance = await getBalance(db, userId);
  let runningBalance = currentBalance;

  return transactions.map((tx) => {
    const balance = runningBalance;
    runningBalance = runningBalance - tx.amount;
    return { ...tx, balance };
  });
}

// ── 라우트 ────────────────────────────────────────────────────────────────

export function registerAuthCreditsRoutes(app: Express, openDb: OpenDb): void {
  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **이메일창은 "가입"이 아니라 "이미 있는 내 계정 찾기"다.**
  // 원본 server/auth.ts:369
  app.post("/api/auth/email-login", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const raw = req.body?.email;
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const { birthDate, language, deviceType } = req.body || {};
      if (!email || !email.includes("@")) {
        return res
          .status(400)
          .json({ success: false, error: "email_required" });
      }
      if (BIRTHDATE_REQUIRED && !birthDate) {
        return res
          .status(400)
          .json({ success: false, error: "birthdate_required" });
      }

      const found = await getUserByEmail(db, email);
      if (!found) {
        return res
          .status(404)
          .json({ success: false, error: "account_not_found" });
      }
      if (birthDate && (!found.birthDate || found.birthDate !== birthDate)) {
        return res
          .status(401)
          .json({ success: false, error: "birthdate_mismatch" });
      }

      const user = await applyLogin(db, found, {
        language,
        deviceType,
        provider: "email",
        providerId: email,
      });
      res.json({
        success: true,
        user: toClientUser(user),
        token: "simple_auth_token_v1_" + user.id,
      });
    } catch (error) {
      // 원본 server/auth.ts:369 블록은 로그를 남기지 않고 500 만 낸다.
      console.error("[Auth] email-login Error:", (error as Error)?.message);
      res.status(500).json({ success: false, error: "server_error" });
    } finally {
      close();
    }
  });

  // 원본 server/auth.ts:305 = 내 정보. 응답 = users 행 통째(toClientUser 아님).
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await getUser(db, userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("[Auth] me Error:", (error as Error)?.message);
      res.status(500).json({ error: "Failed to fetch user data" });
    } finally {
      close();
    }
  });

  // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **회원 탈퇴 = 6개월 유예.**
  // 원본 server/auth.ts:353
  app.delete("/api/auth/account", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      const user = await getUser(db, userId);
      if (!user) return res.status(404).json({ error: "user_not_found" });
      await markAccountDeleted(db, userId);
      res.json({ success: true, graceMonths: 6 });
    } catch (error) {
      console.error("[Auth] 탈퇴 처리 실패:", error);
      res.status(500).json({ error: "server_error" });
    } finally {
      close();
    }
  });

  // 원본 server/payment-routes.ts:184 = 크레딧 잔액.
  app.get("/api/credits/balance", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      res.json({ balance: await getBalance(db, userId) });
    } catch (e) {
      console.error("[Credits] 잔액 조회 실패:", (e as Error)?.message);
      res.status(500).json({ error: "balance_failed" });
    } finally {
      close();
    }
  });

  // 원본 server/payment-routes.ts:195 = 크레딧 내역(limit 1~100, 기본 20).
  app.get("/api/credits/transactions", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      const raw = parseInt(String(req.query.limit ?? "20"), 10);
      const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 100) : 20;
      res.json({
        transactions: await getTransactionHistory(db, userId, limit),
      });
    } catch (e) {
      console.error("[Credits] 내역 조회 실패:", (e as Error)?.message);
      res.status(500).json({ error: "transactions_failed" });
    } finally {
      close();
    }
  });
}
