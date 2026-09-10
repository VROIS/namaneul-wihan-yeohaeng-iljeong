// ⚠️ 수정금지(승인필요) 2026-09-09 사장님 확정 = 인증 = 원본 server/auth-user.ts
//   1,777줄 한 덩어리에서 그대로 잘라낸 것(§0) = 계산·규칙 한 글자도 안 바꿈.

import type { Express, Request, Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../../shared/schema";

type Db = PostgresJsDatabase<typeof schema>;

// ── 인증 ────────────────────────────────────────────────────────────────────

/** 요청 헤더에서 사용자 번호만 읽는다(DB 안 봄). */
export function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}
