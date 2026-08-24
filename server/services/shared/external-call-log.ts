// ⚠️ 수정금지(승인필요) 2026-08-23 사장님 승인 = 외부 유료호출 카운터 + 관리자 배치 무료잔량 게이트 = 단일 진입점 1벌(§16).
//   배경: €860 폭탄 재발 방지. 구글 Places는 2025-03 개편으로 SKU마다 **독립** 월 무료한도(Enterprise = 1,000) → 넘으면 즉시 과금.
//   원칙(사장님 확정 2026-08-23):
//     - BE 의 모든 유료 외부호출(제미니 텍스트 제외) = 호출 직전 출입증처럼 `precheck` = "무료잔량 안인가 / 진행하면 얼마 더 과금인가" 판정·기록.
//     - 사용자 호출(MIX·해설·영상) = 판정만 하고 막지 않음(= 의도된 투자). 관리자 배치(발굴·보충) = `gateBatch` = 초과면 중단, --force-quota = 사장님 승인 시만.
//     - 시뮬(`simulateCost`) = DRY·관리자 API 에서 실행 전 "추가 과금 €" 를 미리 봄.
//   기록은 절대 본 호출을 깨지 않는다(try/catch, 실패 = 경고 1줄). 월 = UTC 달력월(구글 무료한도 리셋 단위).
//   같은 테이블이 5번 계획(관제탑)의 "외부호출 수 항목별" 계기판 소스 = 카운터 2벌 금지.
import { pool } from "../../db";

export type CallProvider = "ts" | "pm" | "veo" | "omni" | "nano" | "gemini";

/** 월 무료 한도(이벤트 수). Places Enterprise SKU = 1,000 (Text Search Enterprise / Place Details Photos). Veo·나노·제미니 = 무료 없음. */
export const FREE_CAPS: Partial<Record<CallProvider, number>> = {
  ts: 1000,
  pm: 1000,
};

/** 초과분 단가(€, 2026-08 GCP 실청구 환산·세전). ts/pm = 건당, veo/omni = 초당, nano = 장당. 제미니 텍스트 = 사전판정 제외(사장님) */
export const UNIT_COST_EUR: Record<CallProvider, number> = {
  ts: 0.035,
  pm: 0.006,
  veo: 0.044,
  omni: 0.13,
  nano: 0.034,
  gemini: 0,
};

export interface QuotaSim {
  provider: CallProvider;
  cap: number | null;
  used: number;
  remaining: number | null;
  planned: number;
  overflow: number; // 무료 밖으로 넘어가는 단위 수(= 과금 대상)
  extraEur: number; // 진행 시 추가 과금 예상(€)
}

/** 시뮬 = 실행 전 "가능한가 + 얼마 더 과금인가". 외부호출 0·DB 읽기만. */
export async function simulateCost(
  provider: CallProvider,
  planned: number,
): Promise<QuotaSim> {
  const cap = FREE_CAPS[provider] ?? null;
  const { count: used } = await monthlyUsage(provider);
  const remaining = cap == null ? null : Math.max(0, cap - used);
  const overflow =
    remaining == null ? planned : Math.max(0, planned - remaining);
  return {
    provider,
    cap,
    used,
    remaining,
    planned,
    overflow,
    extraEur: +(overflow * UNIT_COST_EUR[provider]).toFixed(3),
  };
}

/** 출입증형 사전판정 = 모든 유료 호출 직전 1줄. 막지 않음(사용자 경로) = 판정·로그만. DB 없음/실패 = 호출 방해 0. */
export async function precheck(
  provider: CallProvider,
  units = 1,
): Promise<QuotaSim | null> {
  try {
    const s = await simulateCost(provider, units);
    console.log(
      `[출입증-잔량] ${provider} 이달 ${s.used}/${s.cap ?? "∞"} 잔량 ${s.remaining ?? "∞"} · 이 호출 ${units} → 추가과금 €${s.extraEur}`,
    );
    return s;
  } catch (err) {
    console.warn(
      "[출입증-잔량] 판정 실패(호출은 진행):",
      (err as Error).message,
    );
    return null;
  }
}

export interface ExternalCall {
  provider: CallProvider;
  sku?: string | null;
  cityId?: number | null;
  units?: number; // 기본 1 = 호출 1건. veo = 생성 초(과금 단위)
  tag?: string | null;
}

/** 기록 = fire-and-forget. 유료 호출 성공 직후 1줄 호출. 실패해도 호출 결과에 영향 0. */
export async function recordExternalCall(e: ExternalCall): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO external_calls (provider, sku, city_id, units, tag) VALUES ($1, $2, $3, $4, $5)",
      [
        e.provider,
        e.sku ?? null,
        e.cityId ?? null,
        e.units ?? 1,
        e.tag ?? null,
      ],
    );
  } catch (err) {
    console.warn(
      "[external-calls] 기록 실패(호출은 정상):",
      (err as Error).message,
    );
  }
}

/** 이달(UTC) 사용량 = 건수 + 단위합 */
export async function monthlyUsage(
  provider: CallProvider,
): Promise<{ count: number; units: number }> {
  if (!pool) return { count: 0, units: 0 };
  const r = await pool.query(
    `SELECT count(*)::int AS count, COALESCE(sum(units), 0)::float AS units
       FROM external_calls
      WHERE provider = $1 AND created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
    [provider],
  );
  return { count: r.rows[0]?.count ?? 0, units: r.rows[0]?.units ?? 0 };
}

/** 배치 실행 전 무료잔량 판정. cap 없는 공급자(veo 등) = 항상 ok(과금 공급자는 기록만). DB 없음 = fail-closed. */
export async function checkBatchQuota(
  provider: CallProvider,
  planned: number,
): Promise<QuotaSim & { ok: boolean }> {
  if (FREE_CAPS[provider] != null && !pool)
    throw new Error(
      "[무료잔량] DB 연결 없음 = 잔량 판정 불가 → 배치 중단(게이트는 fail-closed)",
    );
  const s = await simulateCost(provider, planned);
  return { ...s, ok: s.cap == null || s.overflow === 0 };
}

/** 배치 게이트 = 잔량 초과면 throw(중단). force = --force-quota(사장님 승인) 일 때만 통과. */
export async function gateBatch(
  provider: CallProvider,
  planned: number,
  opts?: { force?: boolean },
): Promise<void> {
  const q = await checkBatchQuota(provider, planned);
  const line = `[무료잔량] ${provider} 이달 ${q.used}/${q.cap ?? "∞"} 사용, 계획 ${planned}건, 잔량 ${q.remaining ?? "∞"}, 진행 시 추가과금 €${q.extraEur}`;
  if (q.ok) {
    console.log(`${line} = 통과`);
    return;
  }
  if (opts?.force) {
    console.warn(
      `${line} = 초과지만 --force-quota(사장님 승인)로 진행 = 초과분 과금`,
    );
    return;
  }
  throw new Error(
    `${line} = 초과 → 중단. 다음 달 1일(UTC) 리셋 후 실행하거나, 사장님 승인 시 --force-quota`,
  );
}

/** 관제탑 계기판용 = 공급자별 이달 사용량·무료한도 */
export async function usageSummary(): Promise<
  {
    provider: string;
    count: number;
    units: number;
    cap: number | null;
    remaining: number | null;
  }[]
> {
  const providers: CallProvider[] = [
    "ts",
    "pm",
    "veo",
    "omni",
    "nano",
    "gemini",
  ];
  const out = [];
  for (const p of providers) {
    const u = await monthlyUsage(p);
    const cap = FREE_CAPS[p] ?? null;
    out.push({
      provider: p,
      count: u.count,
      units: u.units,
      cap,
      remaining: cap == null ? null : Math.max(0, cap - u.count),
    });
  }
  return out;
}
