// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 회원 1명 읽기 = 워커·컨테이너가 함께 쓰는 이 함수 1벌 (정본 9-27)
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type User, users } from "./schema";

export async function getUser(
  db: PgDatabase<PgQueryResultHKT, any>,
  id: string,
): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || undefined;
}
