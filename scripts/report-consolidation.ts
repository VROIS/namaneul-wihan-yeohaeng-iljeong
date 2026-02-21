import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function report() {
    console.log("=== [긴급 점검] 마스터 데이터 통합 현황 ===");

    // 1. 전체 데이터 수
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw);
    console.log(`- 전체 장소수: ${total.count}`);

    // 2. 통합 ID 생성수
    const [unified] = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw).where(sql`unified_id IS NOT NULL`);
    console.log(`- Unified ID 생성 완료: ${unified.count}`);

    // 3. 사진 데이터 통합수
    const [img] = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw).where(sql`best_image_url IS NOT NULL`);
    console.log(`- 사진 정보 통합 완료: ${img.count} (${Math.round(img.count / total.count * 100)}%)`);

    // 4. 분위기 데이터 통합수
    const [vibe] = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw).where(sql`vibe_keywords IS NOT NULL`);
    console.log(`- 분위기 키워드 통합 완료: ${vibe.count} (${Math.round(vibe.count / total.count * 100)}%)`);

    // 5. 셀럽 데이터 통합수
    const [celeb] = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw).where(sql`celeb_mention IS NOT NULL`);
    console.log(`- 셀럽 정보 통합 완료: ${celeb.count}`);

    // 6. 블로그 데이터 통합수
    const [blog] = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw).where(sql`naver_blog_count > 0`);
    console.log(`- 네이버 블로그수 통합 완료: ${blog.count}`);

    process.exit(0);
}

report();
