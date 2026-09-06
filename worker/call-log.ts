// ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Worker 외부 유료호출 카운터 기록 1벌(§16)
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../shared/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type CallProvider = "ts" | "pm" | "veo" | "omni" | "nano" | "gemini";

export interface ExternalCallInput {
  provider: CallProvider;
  sku?: string | null;
  cityId?: number | null;
  units?: number; // 기본 1 = 호출 1건. veo = 생성 초(과금 단위)
  tag?: string | null;
  responseTimeMs?: number | null; // 미전달 = NULL(= 계측 안 된 호출, 집계에서 자동 제외)
  success?: boolean | null;
  errorMessage?: string | null;
}

// db 를 인자로 받는다 = 호출부가 이미 연 연결을 재사용(Hyperdrive 요청당 연결 6개 상한).
// 기록 실패는 삼킨다 = 본 기능(유료호출)을 막지 않는다. 절대 throw 하지 않는다.
export async function recordExternalCall(
  db: Db,
  e: ExternalCallInput,
): Promise<void> {
  try {
    await db.insert(schema.externalCalls).values({
      provider: e.provider,
      sku: e.sku ?? null,
      cityId: e.cityId ?? null,
      units: String(e.units ?? 1), // numeric 컬럼 = drizzle 은 문자열로 받는다
      tag: e.tag ?? null,
      responseTimeMs: e.responseTimeMs ?? null,
      success: e.success ?? null,
      errorMessage: e.errorMessage ? e.errorMessage.slice(0, 500) : null,
    });
  } catch (err) {
    console.error(
      "[external-calls] 기록 실패(호출은 정상):",
      (err as Error).message,
    );
  }
}
