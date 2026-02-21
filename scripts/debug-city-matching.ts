import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw, places } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

async function debug() {
    console.log("=== [매칭 디버깅] 파리 장소 데이터 샘플링 ===");

    const cityId = 1; // 파리

    console.log("\n[1] place_seed_raw (Seed) 예시:");
    const seeds = await db.select().from(placeSeedRaw).where(eq(placeSeedRaw.cityId, cityId)).limit(10);
    console.table(seeds.map(s => ({ id: s.id, nameKo: s.nameKo, nameEn: s.nameEn })));

    console.log("\n[2] places (Actual) 예시:");
    const actuals = await db.select().from(places).where(eq(places.cityId, cityId)).limit(10);
    console.table(actuals.map(a => ({ id: a.id, nameKo: a.displayNameKo, nameEn: a.name })));

    process.exit(0);
}

debug();
