import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw, places } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

async function debug() {
    console.log("=== [매칭 디버깅] 이름 차이 분석 ===");

    // 통합 실패한 샘플 20개 추출
    const failures = await db.select().from(placeSeedRaw)
        .where(sql`best_image_url IS NULL`)
        .limit(20);

    for (const f of failures) {
        console.log(`\n[Raw] Ko: ${f.nameKo}, En: ${f.nameEn}`);

        // 해당 도시의 places 전체 이름 출력 (최대 10개)
        const candidates = await db.select().from(places)
            .where(eq(places.cityId, f.cityId))
            .limit(30);

        console.log(`[DB Candidates in same city]`);
        console.log(candidates.map(p => `${p.displayNameKo} (${p.name})`).join(", "));
    }

    process.exit(0);
}

debug();
