// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 크레딧 단가·잔액·장부·차감·가입 보너스 = 워커·컨테이너가 함께 쓰는 이 파일 1벌 (정본 9-27)
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditTransactions, users } from "./schema";

type Db = PgDatabase<PgQueryResultHKT, any>;
type JsonRes = { status(code: number): { json(body: unknown): unknown } };

// ⚠️ 수정금지(승인필요) — 크레딧 단가표 = 사장님 SSOT 2026-07-22 (일별영상 60 = A안·B안 동일, 2026-07-29 확정).
export const CREDIT_COSTS = {
  route_generate: 5, // 여정 생성 (DB-only 포함 = 동일)
  ai_opinion: 5, // AI 의견
  guide_explain: 5, // Tripis 해설 (가이드 미니앱)
  expert_verify: 10, // 전문가 검증·문의
  day_video: 60, // 일별 여행영상 (하루치)
} as const;

export type CreditFeature = keyof typeof CREDIT_COSTS;

const CREDIT_LABELS: Record<CreditFeature, string> = {
  route_generate: "여정 생성",
  ai_opinion: "AI 의견",
  guide_explain: "Tripis 해설",
  expert_verify: "전문가 검증",
  day_video: "일별 영상",
};

// 🎁 2026-08-05 사장님 SSOT = 신규 가입 **50** 크레딧.
export const SIGNUP_BONUS = 50;
export const PURCHASE_CREDITS = 140;
export const PURCHASE_BONUS = 40;
export const PRICE_EUR = 10;

export async function getBalance(db: Db, userId: string): Promise<number> {
  const [user] = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  return user?.credits ?? 0;
}

// ⚠️ 수정금지(승인필요) 2026-07-30 = 장부 줄과 잔액을 **한 덩어리로** 처리한다.
export async function addCredits(
  db: Db,
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
): Promise<number> {
  return await db.transaction(async (tx) => {
    await tx.insert(creditTransactions).values({
      userId,
      type,
      amount,
      description,
      referenceId,
    });

    const [updated] = await tx
      .update(users)
      .set({
        credits: sql`COALESCE(${users.credits}, 0) + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ credits: users.credits });

    return updated?.credits ?? 0;
  });
}

export async function grantSignupBonus(db: Db, userId: string): Promise<void> {
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

  await addCredits(
    db,
    userId,
    SIGNUP_BONUS,
    "signup_bonus",
    `신규 가입 보너스 ${SIGNUP_BONUS} 크레딧 🎁`,
  );
}

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 SSOT = 잔액 사전확인(차감 0, 성공시점차감의 짝) = 비로그인·관리자 면제, 부족하면 402
export async function precheckFeature(
  db: Db,
  res: JsonRes,
  userId: string | null,
  feature: CreditFeature,
): Promise<boolean> {
  if (!userId) return true;
  const amount = CREDIT_COSTS[feature];
  const [user] = await db
    .select({ role: users.role, credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role === "admin") return true;
  const balance = user.credits ?? 0;
  if (balance < amount) {
    res.status(402).json({
      error: "insufficient_credits",
      message: `크레딧이 부족합니다. (필요: ${amount}, 잔액: ${balance})`,
      balance,
      required: amount,
    });
    return false;
  }
  return true;
}

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **완성 시점 차감 1벌.** 깎기 실패해도 완성물은 남긴다
export async function chargeOnSuccess(
  db: Db,
  userId: string | null,
  feature: CreditFeature,
  referenceId?: string,
): Promise<void> {
  if (!userId) return;
  const amount = CREDIT_COSTS[feature];
  const label = CREDIT_LABELS[feature];
  try {
    const [user] = await db
      .select({ role: users.role, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.role === "admin") return;
    if ((user.credits ?? 0) < amount) {
      console.error(
        `[credits] ${label} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
      return;
    }
    await addCredits(db, userId, -amount, "usage", label, referenceId);
  } catch (e) {
    console.error(
      `[credits] ${label} 차감 예외(완성물은 그대로 보존):`,
      (e as Error)?.message,
    );
  }
}
