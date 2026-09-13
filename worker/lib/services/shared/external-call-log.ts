// ⚠️ 수정금지(승인필요) 2026-08-23 사장님 승인 = 외부 유료호출 카운터 + 관리자 배치 무료잔량 게이트 = 단일 진입점 1벌(§16).
//   원칙(사장님 확정 2026-08-23):
import { pool } from "../../db";

export type CallProvider = "ts" | "pm" | "veo" | "omni" | "nano" | "gemini";

export const FREE_CAPS: Partial<Record<CallProvider, number>> = {
  ts: 1000,
  pm: 1000,
};

// ⚠️ 수정금지(승인필요) 2026-08-25 사장님 승인·리서치 확정 = 단가 가계부(공개단가·출처·확인일·서지 전부 기록,
export interface UnitCostLedgerEntry {
  eur: number; // 실제 과금 계산에 쓰는 단가(€) = publicPriceUsd × (1+surchargePct/100)
  publicPriceUsd: number; // 공식 공개단가(원문 통화 그대로, USD)
  surchargePct: number; // 공개단가 대비 실청구 추가율(%)
  unit: string; // 과금 단위
  source: string; // 공식 출처 URL
  verifiedAt: string; // 확인일자(YYYY-MM-DD)
  note?: string; // 근사치 등 특이사항
}
export const UNIT_COST_LEDGER: Record<CallProvider, UnitCostLedgerEntry> = {
  ts: {
    eur: 0.0424,
    publicPriceUsd: 0.035,
    surchargePct: 21,
    unit: "건당",
    source: "https://developers.google.com/maps/billing-and-pricing/pricing",
    verifiedAt: "2026-08-25",
  },
  pm: {
    eur: 0.0085,
    publicPriceUsd: 0.007,
    surchargePct: 21,
    unit: "장당",
    source: "https://developers.google.com/maps/billing-and-pricing/pricing",
    verifiedAt: "2026-08-25",
    note: "옛값 €0.006 = 공개단가 $0.006 오인. 공식 재확인 결과 $0.007/장.",
  },
  veo: {
    eur: 0.0605,
    publicPriceUsd: 0.05,
    surchargePct: 21,
    unit: "초당(720p, veo-3.1-lite-generate-preview)",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedAt: "2026-08-25",
  },
  omni: {
    eur: 0.121,
    publicPriceUsd: 0.1,
    surchargePct: 21,
    unit: "초당(gemini-omni-flash-preview)",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedAt: "2026-08-25",
    note: "구글이 초당단가를 직접 안 주고 출력토큰단가($17.50/1M)로만 표기 = 구글 자체 환산치(720p 기준 초당 5,792토큰)를 그대로 씀. 장면이 복잡하면 토큰이 더 들어 실제 단가가 더 높을 수 있음.",
  },
  nano: {
    eur: 0.0472,
    publicPriceUsd: 0.039,
    surchargePct: 21,
    unit: "장당(gemini-2.5-flash-image, ≤1024×1024)",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedAt: "2026-08-25",
  },
  gemini: {
    eur: 0,
    publicPriceUsd: 0,
    surchargePct: 0,
    unit: "-",
    source: "-",
    verifiedAt: "2026-08-25",
    note: "사전판정·과금계산 제외 정책(2026-08-23 사장님 확정, 제미니 텍스트만 예외).",
  },
};

export const UNIT_COST_EUR: Record<CallProvider, number> = Object.fromEntries(
  (
    Object.entries(UNIT_COST_LEDGER) as [CallProvider, UnitCostLedgerEntry][]
  ).map(([k, v]) => [k, v.eur]),
) as Record<CallProvider, number>;

export interface QuotaSim {
  provider: CallProvider;
  cap: number | null;
  used: number;
  remaining: number | null;
  planned: number;
  overflow: number; // 무료 밖으로 넘어가는 단위 수(= 과금 대상)
  extraEur: number; // 진행 시 추가 과금 예상(€)
}

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
  // ⚠️ 2026-08-25 사장님 승인 = AI 성능(관제탑) 계측 3필드. 미전달 = NULL(= 계측 안 된 옛 방식 호출, 집계에서 자동 제외).
  responseTimeMs?: number | null;
  success?: boolean | null;
  errorMessage?: string | null;
}

export async function recordExternalCall(e: ExternalCall): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO external_calls (provider, sku, city_id, units, tag, response_time_ms, success, error_message) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        e.provider,
        e.sku ?? null,
        e.cityId ?? null,
        e.units ?? 1,
        e.tag ?? null,
        e.responseTimeMs ?? null,
        e.success ?? null,
        e.errorMessage ? e.errorMessage.slice(0, 500) : null,
      ],
    );
  } catch (err) {
    console.warn(
      "[external-calls] 기록 실패(호출은 정상):",
      (err as Error).message,
    );
  }
}

export interface GeminiPerformance {
  sampleSize: number;
  avgResponseTimeMs: number | null;
  successRate: number | null; // %
  errorRate: number | null; // %
}

export async function geminiPerformance(): Promise<GeminiPerformance> {
  if (!pool)
    return {
      sampleSize: 0,
      avgResponseTimeMs: null,
      successRate: null,
      errorRate: null,
    };
  const r = await pool.query(`
    SELECT
      COUNT(*)::int AS sample_size,
      ROUND(AVG(response_time_ms)) AS avg_response_time_ms,
      ROUND(COUNT(*) FILTER (WHERE success = true) * 100.0 / NULLIF(COUNT(*), 0), 1) AS success_rate,
      ROUND(COUNT(*) FILTER (WHERE success = false) * 100.0 / NULLIF(COUNT(*), 0), 1) AS error_rate
    FROM (
      SELECT response_time_ms, success
        FROM external_calls
       WHERE provider = 'gemini' AND success IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 100
    ) recent
  `);
  const row = r.rows[0] || {};
  return {
    sampleSize: row.sample_size ?? 0,
    avgResponseTimeMs:
      row.avg_response_time_ms != null
        ? Number(row.avg_response_time_ms)
        : null,
    successRate: row.success_rate != null ? Number(row.success_rate) : null,
    errorRate: row.error_rate != null ? Number(row.error_rate) : null,
  };
}

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
