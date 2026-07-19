import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function check() {
  console.log("=== [긴급 진단] DB 연결 및 스키마 상태 확인 ===");
  console.log("DATABASE_URL:", process.env.DATABASE_URL?.split("@")[1]); // 보안상 앞부분 제외

  try {
    const res = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'place_seed_raw' 
      ORDER BY ordinal_position
    `);

    console.log("\n[1] place_seed_raw 컬럼 목록:");
    console.table(res.rows);
    // ⚠️ 2026-06-11 = unified_id 진단 블록 제거 (= DROP된 헛바퀴)
  } catch (e) {
    console.error("\n❌ 진단 중 오류 발생:", e);
  }
  process.exit(0);
}

check();
