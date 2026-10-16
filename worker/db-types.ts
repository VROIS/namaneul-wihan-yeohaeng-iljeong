// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 정리: DB 타입 한 벌 (정본 §정리)
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../shared/schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type OpenDb = () => { db: Db; close: () => void };
