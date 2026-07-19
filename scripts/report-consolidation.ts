import "dotenv/config";
import { db } from "../server/db";
import { placeSeedRaw } from "@shared/schema";
import { sql } from "drizzle-orm";

async function report() {
  console.log("=== [긴급 점검] 마스터 데이터 통합 현황 ===");

  // 1. 전체 데이터 수
  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeSeedRaw);
  console.log(`- 전체 장소수: ${total.count}`);

  // ⚠️ 2026-06-11 = unified_id 통계 제거 (= DROP된 헛바퀴)
  // 3. 사진 데이터 통합수 (⚠️ 2026-06-11 = image_url 1종)
  const [img] = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeSeedRaw)
    .where(sql`image_url IS NOT NULL`);
  console.log(
    `- 사진 정보 통합 완료: ${img.count} (${Math.round((img.count / total.count) * 100)}%)`,
  );

  // 4. 분위기 데이터 통합수
  const [vibe] = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeSeedRaw)
    .where(sql`vibe_keywords IS NOT NULL`);
  console.log(
    `- 분위기 키워드 통합 완료: ${vibe.count} (${Math.round((vibe.count / total.count) * 100)}%)`,
  );

  // ⚠️ 2026-06-11 = celeb_mention/naver_blog_count 통계 제거 (= DROP된 헛바퀴)

  process.exit(0);
}

report();
