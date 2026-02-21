import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw, placePrices } from '@shared/schema';
import { isNotNull, isNull, sql } from 'drizzle-orm';

async function checkPrices() {
    // Check place_seed_raw priceEur
    const seedTotal = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw);
    const seedWithPrice = await db.select({ count: sql<number>`count(*)` }).from(placeSeedRaw).where(isNotNull(placeSeedRaw.priceEur));

    console.log(`=== place_seed_raw (가격정보 현황) ===`);
    console.log(`총 로우 수: ${seedTotal[0].count}`);
    console.log(`가격 있음(priceEur): ${seedWithPrice[0].count} (${((Number(seedWithPrice[0].count) / Number(seedTotal[0].count)) * 100).toFixed(1)}%)`);
    console.log(`가격 없음: ${Number(seedTotal[0].count) - Number(seedWithPrice[0].count)}`);

    // Check place_prices
    const priceTotal = await db.select({ count: sql<number>`count(*)` }).from(placePrices);
    console.log(`\n=== place_prices (다중 소스 가격 원본) ===`);
    console.log(`총 가격 수집 건수: ${priceTotal[0].count}`);

    process.exit(0);
}

checkPrices();
