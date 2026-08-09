// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 크레딧 차감 단일 관문 (CLAUDE.md §9).
//   정본 문서 = docs/2026-07-29 결제·크레딧 구현.md
//   유료 외부호출 5지점(여정생성·AI의견·Tripis해설·전문가검증·일별영상)이 **전부 이 함수 1벌만** 부른다.
//   왜 1벌인가: 관리자 면제 규칙과 잔액부족(402) 응답 형태가 두 벌로 갈라지면 어느 게 진짜인지 알 수 없어진다(§0·§16).
//   장부 기록·잔액 차감은 재발명하지 않고 server/creditService.ts 의 useCredits() 를 그대로 쓴다.
import type { Response } from "express";
import { creditService } from "./creditService";

// ⚠️ 수정금지(승인필요) — 크레딧 단가표 = 사장님 SSOT 2026-07-22 (일별영상 60 = A안·B안 동일, 2026-07-29 확정).
//   화면은 이 값을 GET /api/credits/pricing 으로 읽어간다 = 단가를 화면에 하드코딩하지 마라(두 벌 금지).
export const CREDIT_COSTS = {
  route_generate: 5, // 여정 생성 (DB-only 포함 = 동일)
  ai_opinion: 5, // AI 의견
  guide_explain: 5, // Tripis 해설 (가이드 미니앱)
  expert_verify: 10, // 전문가 검증·문의
  day_video: 60, // 일별 여행영상 (하루치)
} as const;

export type CreditFeature = keyof typeof CREDIT_COSTS;

// 장부(credit_transactions.description)에 남는 한국어 이름 = 사장님이 거래내역에서 바로 읽을 수 있어야 함
const CREDIT_LABELS: Record<CreditFeature, string> = {
  route_generate: "여정 생성",
  ai_opinion: "AI 의견",
  guide_explain: "Tripis 해설",
  expert_verify: "전문가 검증",
  day_video: "일별 영상",
};

/**
 * ⚠️ 수정금지(승인필요) — 유료 호출 **직전**에 크레딧을 깎는다.
 *   반환 true  = 통과(차감했거나 면제 대상) → 호출부는 그대로 진행.
 *   반환 false = **이미 402 응답을 보냈다** → 호출부는 `return` 만 하면 된다(응답 두 번 보내기 방지).
 *   ⚠️ 스트리밍 라우트는 res.setHeader/res.write **전에** 불러야 한다. 헤더가 나간 뒤엔 402 를 보낼 수 없다.
 *   userId 는 호출부가 자기 규약대로 넘긴다(Bearer 토큰 또는 그 라우트의 body 규약) = 여기서 갈래를 만들지 않는다(§0).
 *   ⚠️ 2026-08-06 사장님 승인 = res=null 허용 = **성공 시점 차감**(일별영상 = 완성·게시 순간 백그라운드에서 차감 = 응답 객체 없음).
 *     이때 402 는 못 보내므로 반환 false = "차감 실패(잔액 소진)" 판단만 호출부가 한다(시작 시 precheckFeature 로 이미 걸렀음).
 */
export async function chargeFeature(
  res: Response | null,
  userId: string | null,
  feature: CreditFeature,
  referenceId?: string,
): Promise<boolean> {
  // 비로그인 = 차감 없음 (개발단계 게스트 개방 방침, CLAUDE.md §9). 로그인 정식화 때 닫힌다.
  if (!userId) return true;

  const amount = CREDIT_COSTS[feature];
  const label = CREDIT_LABELS[feature];

  // 관리자 면제 = **users.role 만** 본다 (shared/schema/users.ts:61 사장님 SSOT = "신규 코드는 role만 읽음").
  //   is_admin 은 배포앱 원서버가 쓰는 옛 칸이라 기준으로 삼지 않는다 = 두 칸이 어긋나면 공짜 사용이 뚫린다(2026-07-29 §22 지적).
  //   ⚠️ 아이디 문자열에 'admin' 이 들어있는지로 판단하는 방식도 금지 = 아무나 관리자가 되는 권한상승 경로.
  //   사용자 행이 없으면 차감을 건너뛴다 = 장부 외래키 위반으로 500 나는 것 방지(그 라우트의 기존 401/404 흐름을 그대로 살림).
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

/**
 * ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **완성 시점 차감 1벌.**
 *   차감을 "다 만든 뒤"로 옮기면 호출부마다 똑같은 뒷정리가 필요하다 —
 *   ① 응답이 이미 나갔으니 402 를 못 보낸다(res=null) ② 그 사이 잔액이 비었으면 로그만 남기고 결과는 준다
 *   ③ 차감 중 DB 예외가 바깥 catch 로 가면 **다 만든 유료 결과물이 500 으로 버려진다** = 자체 try/catch 필수.
 *   이 셋을 호출부 4곳에 각각 적어 두면 한 곳만 고쳐지는 날 갈라진다(§0·§16) = 여기 1벌로 둔다.
 *   옛 방식(호출부마다 try/catch 복붙) 폐기 = 2026-08-09 §19(판단3종 지적).
 *   @param tag 로그에 남길 이름(어느 기능인지 사장님이 로그에서 바로 읽게)
 */
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

/**
 * ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **잔액 사전확인**(차감 0) — 성공 시점 차감 기능(일별영상)의 짝.
 *   왜: 차감을 "완성·게시 순간"으로 옮기면(사장님 승인 = 실패 시 돈 안 날림) 402 를 보낼 기회가 백그라운드엔 없다.
 *   → 시작 시점에 이 함수로 잔액을 확인해 부족하면 402 = §9 "헤더 나간 뒤 402 불가" 금지 취지를 시작 시점에서 충족.
 *   면제 규칙(비로그인·관리자)은 chargeFeature 와 동일 = 여기서 갈라지면 두 벌(§0) = 같은 판정 순서 유지.
 *   반환 true = 진행 가능 / false = 이미 402 보냄.
 */
//   ⚠️ 여기서 "지금 만드는 중인 것"까지 세는 방어는 만들지 않는다(2026-08-09 사장님 판단으로 삭제 §0·§19).
//     사유 = ① 화면은 누르는 즉시 로딩으로 바뀌어 **사람 손으로는 두 번 못 누른다**(실측: setScreen 이 요청보다 먼저).
//            ② 프로그램으로 동시에 부르는 경우만 해당 = 지금 막을 위협이 아니다(사장님: "뚫으려 들면 다 뚫린다").
//            ③ 그 방어가 유료 요청마다 DB 조회를 한 번씩 더 얹고, 죽은 영상 판정을 두 벌로 만들었다(판단3종 지적).
//     = §0 "안전장치 남발 금지" 그대로. 필요해지는 날 만든다.
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
