// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 크레딧 차감 단일 관문 (CLAUDE.md §9).
import type { Response } from "express";
import { creditService } from "./creditService";

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

/** ⚠️ 수정금지(승인필요) — 유료 호출 **직전**에 크레딧을 깎는다. */
/** ⚠️ 2026-08-06 사장님 승인 = res=null 허용 = **성공 시점 차감**(일별영상 = 완성·게시 순간 백그라운드에서 차감 = 응답 객체 없음). */
export async function chargeFeature(
  res: Response | null,
  userId: string | null,
  feature: CreditFeature,
  referenceId?: string,
): Promise<boolean> {
  if (!userId) return true;

  const amount = CREDIT_COSTS[feature];
  const label = CREDIT_LABELS[feature];

  const user = await creditService.getUserProfile(userId);
  if (!user || user.role === "admin") return true;

  const charge = await creditService.useCredits(
    userId,
    amount,
    label,
    referenceId,
  );

  if (!charge.success) {
    if (res)
      res.status(402).json({
        error: "insufficient_credits",
        message: charge.message,
        balance: charge.balance,
        required: amount,
      });
    return false;
  }

  return true;
}

/** ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **완성 시점 차감 1벌.** */
export async function chargeOnSuccess(
  userId: string | null,
  feature: CreditFeature,
  opts?: { referenceId?: string; tag?: string },
): Promise<void> {
  const tag = opts?.tag || feature;
  try {
    const paid = await chargeFeature(null, userId, feature, opts?.referenceId);
    if (!paid)
      console.error(
        `[credits] ${tag} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
  } catch (e) {
    console.error(
      `[credits] ${tag} 차감 예외(완성물은 그대로 보존):`,
      (e as Error)?.message,
    );
  }
}

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 SSOT = 잔액 사전확인(차감 0, 일별영상 성공시점차감의 짝) — "만드는 중인 것" 중복방어는 안 만듦(§0), 상세 경위는 정본문서
export async function precheckFeature(
  res: Response,
  userId: string | null,
  feature: CreditFeature,
): Promise<boolean> {
  if (!userId) return true;
  const amount = CREDIT_COSTS[feature];
  const user = await creditService.getUserProfile(userId);
  if (!user || user.role === "admin") return true;
  const balance = await creditService.getBalance(userId);
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
