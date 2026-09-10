// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 크레딧(§9) = 원본 server/credit-charge.ts
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";

const { creditTransactions, users } = schema;

type Db = PostgresJsDatabase<typeof schema>;

// ── 크레딧 (§9). 원본 server/credit-charge.ts. worker/routes-gemini.ts:100 과 같은 1벌 형태. ──

/** 원본 server/credit-charge.ts:6 CREDIT_COSTS 의 route_generate. */
export const ROUTE_GENERATE_COST = 5;
/** 원본 server/credit-charge.ts:16 CREDIT_LABELS 의 route_generate(장부에 그대로 남는다). */
export const ROUTE_GENERATE_LABEL = "여정 생성";

/** 크레딧 잔액 사전확인(차감 0). 비로그인·관리자 면제, 부족하면 402. 첫 응답 나가기 전에 부른다(§9). */
export async function precheckRouteGenerate(
  db: Db,
  res: Response,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return true;
  const [user] = await db
    .select({ role: users.role, credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role === "admin") return true;
  const balance = user.credits ?? 0;
  if (balance < ROUTE_GENERATE_COST) {
    res.status(402).json({
      error: "insufficient_credits",
      message: `크레딧이 부족합니다. (필요: ${ROUTE_GENERATE_COST}, 잔액: ${balance})`,
      balance,
      required: ROUTE_GENERATE_COST,
    });
    return false;
  }
  return true;
}

/** 여정이 나온 뒤에만 크레딧을 깎는다 = 장부와 잔액을 한 번에. 깎기 실패해도 만든 여정은 남긴다. */
export async function chargeRouteGenerateOnSuccess(
  db: Db,
  userId: string | null,
  referenceId?: string,
): Promise<void> {
  if (!userId) return;
  try {
    const [user] = await db
      .select({ role: users.role, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.role === "admin") return;
    if ((user.credits ?? 0) < ROUTE_GENERATE_COST) {
      console.error(
        `[credits] ${ROUTE_GENERATE_LABEL} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
      return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(creditTransactions).values({
        userId,
        type: "usage",
        amount: -ROUTE_GENERATE_COST,
        description: ROUTE_GENERATE_LABEL,
        referenceId,
      });
      await tx
        .update(users)
        .set({
          credits: sql`COALESCE(${users.credits}, 0) + ${-ROUTE_GENERATE_COST}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  } catch (e) {
    console.error(
      `[credits] ${ROUTE_GENERATE_LABEL} 차감 예외(완성물은 그대로 보존):`,
      (e as Error)?.message,
    );
  }
}
