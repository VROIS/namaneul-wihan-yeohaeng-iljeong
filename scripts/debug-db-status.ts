import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function check() {
    console.log("=== [긴급 진단] DB 연결 및 스키마 상태 확인 ===");
    console.log("DATABASE_URL:", process.env.DATABASE_URL?.split('@')[1]); // 보안상 앞부분 제외

    try {
        const res = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'place_seed_raw' 
      ORDER BY ordinal_position
    `);

        console.log("\n[1] place_seed_raw 컬럼 목록:");
        console.table(res.rows);

        const countRes = await db.execute(sql`SELECT count(*) FROM place_seed_raw WHERE unified_id IS NOT NULL`);
        console.log(`\n[2] unified_id가 채워진 행 수: ${countRes.rows[0].count}`);

        const sample = await db.execute(sql`SELECT id, name_ko, unified_id FROM place_seed_raw WHERE unified_id IS NOT NULL LIMIT 5`);
        console.log("\n[3] 데이터 샘플:");
        console.table(sample.rows);

    } catch (e) {
        console.error("\n❌ 진단 중 오류 발생:", e);
    }
    process.exit(0);
}

check();
