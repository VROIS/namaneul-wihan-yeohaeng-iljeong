// ⚠️ 수정금지(승인필요) 2026-11-07 사장님 결정 = 창고 해설 고르는 순서 1벌(창고 주인 먼저 → 최신) = 앱 [해설 듣기]·공개 해설 글이 같이 쓴다 (정본 2026-11-07)
import { desc, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { getFirstAdmin } from "../auth-user";
import type { Db } from "../db-types";

const { guides } = schema;

export async function warehouseGuideOrder(db: Db) {
  const owner = (await getFirstAdmin(db))?.id || null;
  return [
    owner
      ? sql`CASE WHEN ${guides.userId} = ${owner} THEN 0 ELSE 1 END`
      : sql`0`,
    desc(guides.createdAt),
  ];
}
