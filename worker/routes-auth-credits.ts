// 계정(메일 로그인·내 정보·탈퇴) + 크레딧(잔액·내역) 라우트 = Worker 이관본.
// 응답·상태코드·에러문구는 원본과 같게 유지한다.
import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { desc, eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import {
  applyLogin,
  findOrCreateUser,
  getUserByEmail,
  getUserIdFromReq,
  loginResponse,
} from "./auth-user";
import { getUser } from "../shared/users";
import { getBalance } from "../shared/credits";
import { BIRTHDATE_REQUIRED } from "../shared/birthdate-policy";

const { creditTransactions, users } = schema;

type Db = ReturnType<typeof drizzle<typeof schema>>;
export type OpenDb = () => { db: Db; close: () => void };

/** markAccountDeleted = 문패만 내린다(아무것도 지우지 않는다). */
async function markAccountDeleted(db: Db, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ accountStatus: "deleted", deletedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
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
  // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 이메일창 = 네 번째 로그인 수단(신규 가입 + 기존 본인확인 2역할)
  app.post("/api/auth/email-login", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const raw = req.body?.email;
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const { birthDate, language, deviceType, entry } = req.body || {};
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

      // ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 이메일 = 네 번째 로그인 수단 = 소셜 3종과 동일하게 신규 가입도 된다
      const found = await getUserByEmail(db, email);
      if (!found) {
        const user = await findOrCreateUser(db, {
          provider: "email",
          providerId: email,
          birthDate,
          email,
          emailVerified: true,
          displayName: email.split("@")[0],
          language,
          deviceType,
          entry,
        });
        return res.json(loginResponse(user));
      }

      const user = await applyLogin(db, found, {
        birthDate,
        language,
        deviceType,
        provider: "email",
        providerId: email,
        entry,
      });
      res.json(loginResponse(user));
    } catch (error) {
      console.error("[Auth] email-login Error:", (error as Error)?.message);
      res.status(500).json({ success: false, error: "server_error" });
    } finally {
      close();
    }
  });

  // 내 정보. 응답 = users 행 통째(toClientUser 아님).
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

  // 크레딧 잔액.
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

  // 크레딧 내역(limit 1~100, 기본 20).
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
