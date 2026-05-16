import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw, places, cities, placePrices } from '@shared/schema';
import { eq, sql, desc, isNull } from 'drizzle-orm';

function normalizePlaceKey(value: string): string {
    if (!value) return "";
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

async function run() {
    console.log("=== [2차 물류 트럭] place_seed_raw 누락된 가격(Price) 빈칸 100% 땜빵 시작 ===");

    // 가격이 비어있는(null) 85%의 항목들만 가져오기
    const seedRows = await db.select().from(placeSeedRaw).where(isNull(placeSeedRaw.priceEur));
    console.log(`총 ${seedRows.length}개의 가격 누락 데이터 처리 진행`);

    let totalUpdated = 0;
    let notFound = 0;

    const allCities = await db.select().from(cities).execute();
    const cityMap = new Map(allCities.map(c => [c.id, c]));

    for (const seed of seedRows) {
        const city = cityMap.get(seed.cityId);
        if (!city) continue;

        let placeId = null;
        const keyEnNorm = normalizePlaceKey(seed.nameEn);
        const keyKoNorm = seed.nameKo ? normalizePlaceKey(seed.nameKo) : "";

        // [Pass 1] 도시 내 검색 (가장 정확한 기존 로직 재활용)
        const cityPlaces = await db.select().from(places).where(eq(places.cityId, seed.cityId));
        for (const p of cityPlaces) {
            const pNameNorm = normalizePlaceKey(p.name || "");
            const pKoNorm = normalizePlaceKey(p.displayNameKo || "");
            const pAliases = (p.aliases as string[] | null) || [];

            if ((pNameNorm && pNameNorm === keyEnNorm) ||
                (pKoNorm && pKoNorm === keyKoNorm) ||
                (pNameNorm && pNameNorm === keyKoNorm) ||
                (pKoNorm && pKoNorm === keyEnNorm)) {
                placeId = p.id;
                break;
            }
            for (const a of pAliases) {
                const aNorm = normalizePlaceKey(a);
                if (aNorm && (aNorm === keyEnNorm || aNorm === keyKoNorm)) {
                    placeId = p.id;
                    break;
                }
            }
            if (placeId) break;
        }

        // [Pass 2] 전역 이름 검색
        if (!placeId && keyEnNorm) {
            const matchesByEn = await db.select().from(places).where(
                sql`LOWER(REPLACE(${places.name}, ' ', '')) = ${keyEnNorm}`
            ).limit(2);
            if (matchesByEn.length === 1) placeId = matchesByEn[0].id;
        }

        if (placeId) {
            // 해당 placeId를 가진 place_prices 내역 긁어오기
            const prices = await db.select().from(placePrices)
                .where(eq(placePrices.placeId, placeId))
                .orderBy(desc(placePrices.fetchedAt));

            if (prices.length > 0) {
                // 가격이 있는 경우 첫 번째 최신/베스트 가격 사용
                const bestPriceRow = prices[0];
                let finalPrice = bestPriceRow.priceAverage ?? bestPriceRow.priceHigh ?? bestPriceRow.priceLow;

                if (finalPrice !== null && finalPrice !== undefined) {
                    await db.update(placeSeedRaw)
                        .set({ priceEur: finalPrice })
                        .where(eq(placeSeedRaw.id, seed.id));
                    totalUpdated++;
                } else {
                    notFound++;
                }
            } else {
                notFound++;
            }
        } else {
            notFound++;
        }
    }

    console.log(`=== 완료: 총 ${totalUpdated}건 가격 땜빵 성공 (실패/가격없음: ${notFound}건) ===`);
    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
