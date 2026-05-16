/**
 * 2차 물류 트럭: place_prices → place_seed_raw 가격 빈칸 땜빵
 * place-linker 매칭 로직 재사용 (AGENT_PROTOCOL ①~⑤)
 */
import { db } from '../db';
import { placeSeedRaw, placePrices } from '@shared/schema';
import { eq, desc, isNull } from 'drizzle-orm';
import { buildCityPlaceLookup, matchPlaceName } from './place-linker';

export async function runSyncPricesToSeed(): Promise<{
  totalUpdated: number;
  notFound: number;
  placeIdMatched: number;
}> {
  const seedRows = await db.select().from(placeSeedRaw).where(isNull(placeSeedRaw.priceEur));

  let totalUpdated = 0;
  let notFound = 0;
  let placeIdMatched = 0;

  const cityLookupCache = new Map<number, Awaited<ReturnType<typeof buildCityPlaceLookup>>>();

  for (const seed of seedRows) {
    let placeId: number | null = null;

    if (seed.placeId) {
      placeId = seed.placeId;
    } else {
      let lookup = cityLookupCache.get(seed.cityId);
      if (!lookup) {
        lookup = await buildCityPlaceLookup(seed.cityId);
        cityLookupCache.set(seed.cityId, lookup);
      }
      placeId = matchPlaceName(seed.nameEn || '', lookup)
        ?? (seed.nameKo ? matchPlaceName(seed.nameKo, lookup) : null);

      if (placeId) {
        placeIdMatched++;
        await db.update(placeSeedRaw)
          .set({ placeId })
          .where(eq(placeSeedRaw.id, seed.id));
      }
    }

    if (placeId) {
      const prices = await db.select().from(placePrices)
        .where(eq(placePrices.placeId, placeId))
        .orderBy(desc(placePrices.fetchedAt));

      if (prices.length > 0) {
        const bestPriceRow = prices[0];
        const finalPrice = bestPriceRow.priceAverage ?? bestPriceRow.priceHigh ?? bestPriceRow.priceLow;

        if (finalPrice != null) {
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

  return { totalUpdated, notFound, placeIdMatched };
}
