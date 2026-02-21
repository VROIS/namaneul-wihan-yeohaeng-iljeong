import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw, places, cities } from '@shared/schema';
import { eq, isNull } from 'drizzle-orm';
import { googlePlacesFetcher } from '../server/services/google-places';

function normalizePlaceKey(value: string): string {
    if (!value) return "";
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

async function run() {
    console.log("=== 누락된 장소 구글 API 연동 (Text Search) 시작 ===");

    // 1. bestImageUrl이 없는 place_seed_raw 항목을 찾습니다. 
    //    (이전에 place 찾기에 실패하여 업데이트 되지 않은 항목들 위주로)
    const missingSeeds = await db.select().from(placeSeedRaw).where(isNull(placeSeedRaw.bestImageUrl));
    console.log(`총 ${missingSeeds.length}개의 누락 가능성 있는 로우 데이터 발견`);

    // 모든 cities 
    const allCitiesArray = await db.select().from(cities);
    const citiesMap = new Map(allCitiesArray.map(c => [c.id, c]));

    // places (매번 DB에서 조회하지 않기 위해 캐싱)
    const allPlacesArray = await db.select({
        id: places.id,
        cityId: places.cityId,
        name: places.name,
        displayNameKo: places.displayNameKo,
        aliases: places.aliases
    }).from(places);

    const placeCache = new Map<number, typeof allPlacesArray>();
    for (const p of allPlacesArray) {
        if (!placeCache.has(p.cityId!)) {
            placeCache.set(p.cityId!, []);
        }
        placeCache.get(p.cityId!)!.push(p);
    }

    let processedCount = 0;
    let fallbackCount = 0;

    for (const seed of missingSeeds) {
        if (processedCount >= 5) {
            console.log("\n[안내] 일일 구글 Places API 사용량 초과(요금 폭탄 방지)를 막기 위해 임시로 5건까지만 진행합니다.");
            break;
        }

        const city = citiesMap.get(seed.cityId);
        if (!city) continue;

        // 이미 places 에 있는지 다시 한번 확인
        let exists = false;
        const cityPlaces = placeCache.get(seed.cityId) || [];
        const keyEnNorm = normalizePlaceKey(seed.nameEn);
        const keyKoNorm = seed.nameKo ? normalizePlaceKey(seed.nameKo) : "";

        for (const p of cityPlaces) {
            const pNameNorm = normalizePlaceKey(p.name || "");
            const pKoNorm = normalizePlaceKey(p.displayNameKo || "");
            const pAliases = (p.aliases as string[] | null) || [];

            if ((pNameNorm && pNameNorm === keyEnNorm) ||
                (pKoNorm && pKoNorm === keyKoNorm) ||
                (pNameNorm && pNameNorm === keyKoNorm) ||
                (pKoNorm && pKoNorm === keyEnNorm)) {
                exists = true;
                break;
            }

            for (const a of pAliases) {
                const aNorm = normalizePlaceKey(a);
                if (aNorm && (aNorm === keyEnNorm || aNorm === keyKoNorm)) {
                    exists = true;
                    break;
                }
            }
            if (exists) break;
        }

        if (exists) {
            continue; // 이미 places에 존재하므로 스킵 (단지 image가 없을뿐)
        }

        // 구글에 검색
        console.log(`\n🔍 검색 중: ${seed.nameEn} (${city.name})`);
        try {
            const query = `${seed.nameEn} ${city.nameEn || city.name}`;
            const searchResults = await googlePlacesFetcher.searchText(
                query,
                Number(city.latitude),
                Number(city.longitude),
                50000 // 50km
            );

            if (searchResults && searchResults.length > 0) {
                const bestMatch = searchResults[0]; // 리뷰 많은 순(POPULARITY)로 오지는 않지만 첫번째 결과 사용
                console.log(`✅ 찾음: ${bestMatch.displayName?.text} (ID: ${bestMatch.id})`);

                // 상세정보 조회 후 저장
                const details = await googlePlacesFetcher.getPlaceDetails(bestMatch.id);
                // dbType -> 식당/카페면 restaurant, 그외 attraction
                let dbType: "restaurant" | "attraction" | "cafe" | "hotel" | "landmark" = "attraction";
                if (seed.seedCategory === "restaurant") dbType = "restaurant";
                else if (seed.seedCategory === "cafe") dbType = "cafe";

                const placeCategory = (seed.seedCategory === "cafe" ? "restaurant" : seed.seedCategory) as any;

                await googlePlacesFetcher.fetchAndStorePlace(details, seed.cityId, dbType, placeCategory);
                processedCount++;
                console.log(`💾 저장 완료: ${details.displayName?.text}`);

                // 딜레이 (Rate Limit 방지)
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.log(`❌ 결과 없음: ${seed.nameEn}`);
                fallbackCount++;
            }
        } catch (error: any) {
            console.error(`🚨 API 오류 (${seed.nameEn}):`, error.message);
            // 한도초과 에러 등인 경우 다음 루프 중단
            if (error.message.includes("BILLING PROTECTION") || error.message.includes("quota")) {
                break;
            }
        }
    }

    console.log(`\n=== 보완 수집 완료 ===`);
    console.log(`- 새로 수집하여 places에 저장한 건수: ${processedCount}`);
    console.log(`- 검색 결과 없어서 실패(Fallback)한 건수: ${fallbackCount}`);

    // 재통합 스크립트 실행 안내
    console.log(`\n💡 데이터가 추가되었습니다. 마스터 데이터와 연동하려면 다음 명령어를 실행하세요:`);
    console.log(`   npx tsx scripts/sync-master-place-seed.ts`);
    console.log(`   (통합 후 report-consolidation.ts 를 실행하면 확인 가능)`);
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
