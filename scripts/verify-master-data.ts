import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function verify() {
    console.log("=== [데이터 검증] place_seed_raw 마스터 데이터 샘플 확인 ===");
    if (!db) { console.error('db 미초기화'); process.exit(1); }

    // ⚠️ 수정금지(승인필요) 2026-06-11 = 헛바퀴 컬럼(unified_id/naver_blog_count) DROP 동반 제거.
    const samples = await db.select().from(placeSeedRaw)
        .limit(10);

    console.table(samples.map(s => ({
        ID: s.id,
        Name: s.nameKo || s.nameEn,
        Image: s.imageUrl ? "(O)" : "(X)",
        Vibes: s.vibeKeywords ? s.vibeKeywords.join(",") : "(X)",
    })));

    process.exit(0);
}

verify();
