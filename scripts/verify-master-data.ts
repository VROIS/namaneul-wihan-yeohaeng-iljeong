import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function verify() {
    console.log("=== [데이터 검증] place_seed_raw 마스터 데이터 샘플 확인 ===");

    const samples = await db.select().from(placeSeedRaw)
        .where(sql`unified_id IS NOT NULL`)
        .limit(10);

    console.table(samples.map(s => ({
        ID: s.id,
        Name: s.nameKo || s.nameEn,
        UnifiedID: s.unifiedId,
        BestImage: s.bestImageUrl ? "(O)" : "(X)",
        Vibes: s.vibeKeywords ? s.vibeKeywords.join(",") : "(X)",
        Celeb: s.celebMention || "(X)",
        NaverBlogs: s.naverBlogCount
    })));

    process.exit(0);
}

verify();
