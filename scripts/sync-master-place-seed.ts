import 'dotenv/config';
import { db } from '../server/db';
import { placeSeedRaw, places, cities, placeImages, naverBlogPosts, vibeAnalysis, placeNubiReasons } from '@shared/schema';
import { eq, sql, asc, desc } from 'drizzle-orm';

function normalizePlaceKey(value: string): string {
    if (!value) return "";
    return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

// 대륙 코드 (사용자 정의)
const CONTINENT_CODE_MAP: Record<string, string> = {
    "EU": "1", // 유럽
    "AS": "2", // 아시아
    "NA": "3", // 북미
    "SA": "4", // 남미
    "OC": "5", // 오세아니아
    "AF": "6", // 아프리카
};

// 국가별 소속 대륙 (임시 매핑 - 확장 가능)
const COUNTRY_CONTINENT_MAP: Record<string, string> = {
    "FR": "EU", "GB": "EU", "ES": "EU", "IT": "EU", "DE": "EU", "BE": "EU", "NL": "EU", "AT": "EU", "CH": "EU", "CZ": "EU", "HU": "EU", "PT": "EU", "GR": "EU", "PL": "EU", "DK": "EU", "SE": "EU", "IS": "EU", "TR": "EU",
    "KR": "AS", "JP": "AS", "TH": "AS", "MY": "AS", "SG": "AS", "ID": "AS", "HK": "AS", "PH": "AS", "TW": "AS",
    "US": "NA", "MX": "NA", "CA": "NA",
    "CO": "SA", "PE": "SA", "CL": "SA", "AR": "SA", "BR": "SA",
    "AU": "OC",
};

const CATEGORY_CODE_MAP: Record<string, string> = {
    "restaurant": "R",
    "attraction": "A",
    "healing": "H",
    "adventure": "V",
    "hotspot": "P",
    "cafe": "C",
};

async function run() {
    console.log("=== [마스터 창고 통합] place_seed_raw 컬럼 정리 및 Unified ID 생성 시작 ===");

    const seedRows = await db.select().from(placeSeedRaw);
    console.log(`총 ${seedRows.length}개의 로우 데이터 처리 진행`);

    let totalUpdated = 0;

    // 도시 정보 캐싱
    const allCities = await db.select().from(cities).execute();
    const cityMap = new Map(allCities.map(c => [c.id, c]));

    for (const seed of seedRows) {
        const city = cityMap.get(seed.cityId);
        if (!city) continue;

        // 1. Unified ID 생성 (예: 111R1)
        const continent = COUNTRY_CONTINENT_MAP[city.countryCode] || "EU"; // 기본 유럽
        const continentPart = CONTINENT_CODE_MAP[continent] || "1";

        // 도시 코드는 MCP 순위(1~30) 또는 ID 활용 (2자리 확보 위해 pad)
        const cityRank = city.mcpRankFr || city.mcpRankEu || (city.id % 90 + 31);
        const cityPart = cityRank.toString().padStart(2, '0').slice(-2);

        const areaPart = "1"; // 거점은 우선 1로 고정

        // 카테고리 (명소+힐링 등 중복 시 AH 형태로 확장 가능하도록 설계)
        // 현재 seedCategory는 단일값이므로 첫 글자 매핑
        const catPart = CATEGORY_CODE_MAP[seed.seedCategory] || seed.seedCategory[0].toUpperCase();

        const rankPart = seed.rank.toString();

        const unifiedId = `${continentPart}${cityPart}${areaPart}${catPart}${rankPart}`;
        // 1. 매칭되는 최적의 placeId 찾기 (도시 내 검색 -> 전역 이름 검색)
        let placeId = null;
        const keyEnNorm = normalizePlaceKey(seed.nameEn);
        const keyKoNorm = seed.nameKo ? normalizePlaceKey(seed.nameKo) : "";

        // [Pass 1] 도시 내 장소들 장소들 검색 (가장 정확)
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

        // [Pass 2] 도시 내에 없으면 전역에서 영어 이름으로만 검색 (확실한 것만)
        if (!placeId && keyEnNorm) {
            // 전역 검색용으로 임시로 모든 places를 가져오는 것은 비효율적이므로, 
            // 이름이 정확히 일치하는(공백제외) 것만 쿼리로 찾음
            const matchesByEn = await db.select().from(places).where(
                sql`LOWER(REPLACE(${places.name}, ' ', '')) = ${keyEnNorm}`
            ).limit(2);

            if (matchesByEn.length === 1) { // 1개만 나오면 확실함
                placeId = matchesByEn[0].id;
            }
        }

        let updates: any = {};

        if (placeId) {
            // 2. 이미지 결정 (우선순위: Instagram(좋아요 순) > Celeb > Google/Tripadvisor)
            let bestImage = seed.imageUrl; // 기본값

            // A. 인스타 로우 데이터(instagram_photos)에서 가져오기
            const instaPhotos: any = await db.execute(sql`
                SELECT ip.image_url, ip.like_count 
                FROM instagram_photos ip
                JOIN instagram_locations il ON ip.location_id = il.id
                WHERE il.linked_place_id = ${placeId}
                ORDER BY ip.like_count DESC NULLS LAST
                LIMIT 1
            `);

            if (instaPhotos.rows.length > 0) {
                bestImage = instaPhotos.rows[0].image_url;
            } else {
                // B. 통합 이미지 테이블(place_images)에서 우선순위 높은 것 찾기
                const pImages = await db.select().from(placeImages)
                    .where(eq(placeImages.placeId, placeId))
                    .orderBy(asc(placeImages.sortOrder));
                if (pImages.length > 0) {
                    bestImage = pImages[0].url;
                }
            }

            // 3. 분위기 키워드 (vibe_analysis)
            const vibes = await db.select().from(vibeAnalysis)
                .where(eq(vibeAnalysis.placeId, placeId))
                .limit(1);
            if (vibes.length > 0) {
                updates.vibeKeywords = vibes[0].vibeKeywords;
            }

            // 4. 셀럽 정보
            const celebs: any = await db.execute(sql`
                SELECT c.name 
                FROM celebrity_place_evidence cpe
                JOIN celeb_evidence c ON cpe.celeb_id = c.id
                WHERE cpe.place_id = ${placeId}
                LIMIT 3
            `);
            if (celebs.rows.length > 0) {
                updates.celebMention = celebs.rows.map((r: any) => r.name).join(", ");
            }

            // 5. 네이버 블로그 카운트
            const blogs = await db.select().from(naverBlogPosts)
                .where(eq(naverBlogPosts.placeId, placeId));
            updates.naverBlogCount = blogs.length;

            updates.bestImageUrl = bestImage;
            // e. nubiReason (혹시 seed 쪽에 2단계 수집 실패로 비어있다면 보충)
            if (!seed.nubiReason) {
                const nubi = await db.select().from(placeNubiReasons)
                    .where(eq(placeNubiReasons.placeId, placeId))
                    .limit(1);
                if (nubi.length > 0 && nubi[0].nubiReason) {
                    updates.nubiReason = nubi[0].nubiReason;
                }
            }

            // DB 업데이트 실행 (Unified ID 포함)
            updates.unifiedId = unifiedId;

            await db.update(placeSeedRaw).set(updates).where(eq(placeSeedRaw.id, seed.id));
            totalUpdated++;
        } else {
            // placeId 매칭 안되어도 Unified ID는 업데이트
            await db.update(placeSeedRaw).set({ unifiedId }).where(eq(placeSeedRaw.id, seed.id));
            totalUpdated++;
        }
    }

    console.log(`=== 완료: 총 ${totalUpdated}건의 장소 데이터 마스터 창고화 성공 ===`);
    process.exit(0);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
