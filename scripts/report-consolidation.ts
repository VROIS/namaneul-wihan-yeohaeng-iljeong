import "dotenv/config";
import { db } from "../server/db";
import { placeSeedRaw } from "@shared/schema";
import { sql } from "drizzle-orm";

async function report() {
  console.log("=== [긴급 점검] 마스터 데이터 통합 현황 ===");

  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeSeedRaw);
  console.log(`- 전체 장소수: ${total.count}`);

  const [img] = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeSeedRaw)
    .where(sql`image_url IS NOT NULL`);
  console.log(
    `- 사진 정보 통합 완료: ${img.count} (${Math.round((img.count / total.count) * 100)}%)`,
  );

  const [vibe] = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeSeedRaw)
    .where(sql`vibe_keywords IS NOT NULL`);
  console.log(
    `- 분위기 키워드 통합 완료: ${vibe.count} (${Math.round((vibe.count / total.count) * 100)}%)`,
  );

  process.exit(0);
}

report();
