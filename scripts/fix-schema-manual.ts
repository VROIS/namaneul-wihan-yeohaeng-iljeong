import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function run() {
    console.log("=== [DB 스키마 수동 보정] place_seed_raw 컬럼 수동 추가 시작 ===");

    try {
        // missing columns 추가 (있더라도 오류 안 나도록 IF NOT EXISTS는 PG 9.6 이상 지원이나, column_exists 체크로 우회)
        await db.execute(sql`
      DO $$ 
      BEGIN
        -- ⚠️ 2026-06-11 = unified_id/celeb_mention/naver_blog_count ADD 제거 (= DROP된 헛바퀴 = 좀비 부활 차단)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='place_seed_raw' AND column_name='vibe_keywords') THEN
          ALTER TABLE place_seed_raw ADD COLUMN vibe_keywords jsonb;
        END IF;
      END $$;
    `);

        console.log("✅ place_seed_raw 컬럼 보정 완료");
    } catch (e) {
        console.error("❌ 스키마 보정 실패:", e);
        process.exit(1);
    }
    process.exit(0);
}

run();
