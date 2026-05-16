/**
 * 대통합 서비스: place_seed_raw를 기존 로우데이터로 최대한 채우기
 *
 * 6단계 파이프라인 + 우선순위 원칙:
 *  1) place_id 전건 매칭 (place-linker 5단계 + 토큰 매칭)
 *  2) 이미지: 셀럽인스타 > 인스타사진 > 구글사진 > MCP수집
 *  3) 가격: Google실제가격 > Klook/Viator > Gemini추정치
 *  4) naver_blog_posts → naverBlogCount
 *  5) celebrity_place_evidence → celebMention
 *  6) places → vibeKeywords
 */
import { db } from "../db";
import {
  placeSeedRaw,
  places,
  placeImages,
  placePrices,
  naverBlogPosts,
  celebrityPlaceEvidence,
  celebEvidence,
  placeNubiReasons,
} from "@shared/schema";
import { eq, desc, isNull, sql, and, asc } from "drizzle-orm";
import { buildCityPlaceLookup, matchPlaceName } from "./place-linker";

const STOP_WORDS = new Set([
  "the", "le", "la", "les", "de", "du", "des", "di", "del", "della",
  "das", "der", "die", "el", "los", "a", "an", "et", "and", "of", "in",
  "at", "to", "on", "for", "by", "mit", "von", "aux", "sur", "en",
]);

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[''`\-_.,;:!?()[\]{}]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function tokenMatchScore(a: string, b: string): number {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.length === 0 || tokB.length === 0) return 0;
  let matches = 0;
  for (const t of tokA) {
    if (tokB.some((tb) => tb === t || tb.includes(t) || t.includes(tb))) matches++;
  }
  return matches / Math.max(tokA.length, tokB.length);
}

interface PlaceLookupFull {
  id: number;
  name: string;
  displayNameKo: string | null;
  aliases: string[];
  cityId: number;
}

async function buildFullCityLookup(cityId: number): Promise<PlaceLookupFull[]> {
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      displayNameKo: places.displayNameKo,
      aliases: places.aliases,
      cityId: places.cityId,
    })
    .from(places)
    .where(eq(places.cityId, cityId));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayNameKo: r.displayNameKo || null,
    aliases: (r.aliases as string[]) || [],
    cityId: r.cityId,
  }));
}

function aggressiveMatch(seedName: string, lookup: PlaceLookupFull[]): number | null {
  if (!seedName || seedName.length < 3) return null;

  let bestId: number | null = null;
  let bestScore = 0;

  for (const p of lookup) {
    const score1 = tokenMatchScore(seedName, p.name);
    let score2 = 0;
    if (p.displayNameKo) score2 = tokenMatchScore(seedName, p.displayNameKo);
    let score3 = 0;
    for (const a of p.aliases) {
      score3 = Math.max(score3, tokenMatchScore(seedName, a));
    }
    const best = Math.max(score1, score2, score3);
    if (best > bestScore && best >= 0.5) {
      bestScore = best;
      bestId = p.id;
    }
  }

  return bestId;
}

interface ConsolidationResult {
  placeIdMatched: number;
  placeIdAlready: number;
  imagesUpdated: number;
  pricesUpdated: number;
  blogCountsUpdated: number;
  celebUpdated: number;
  vibeUpdated: number;
  nubiReasonUpdated: number;
  totalSeedRows: number;
  errors: string[];
}

export async function runConsolidation(): Promise<ConsolidationResult> {
  const result: ConsolidationResult = {
    placeIdMatched: 0,
    placeIdAlready: 0,
    imagesUpdated: 0,
    pricesUpdated: 0,
    blogCountsUpdated: 0,
    celebUpdated: 0,
    vibeUpdated: 0,
    nubiReasonUpdated: 0,
    totalSeedRows: 0,
    errors: [],
  };

  try {
    const allSeeds = await db.select().from(placeSeedRaw);
    result.totalSeedRows = allSeeds.length;
    console.log(`[Consolidation] place_seed_raw ${allSeeds.length}건 대상 시작`);

    // ── Step 1: place_id 전건 매칭 (2단계: 정밀 + 토큰) ──
    console.log("[Consolidation] Step 1/6: place_id 전건 매칭...");
    const cityLookupCache = new Map<number, Awaited<ReturnType<typeof buildCityPlaceLookup>>>();
    const cityFullCache = new Map<number, PlaceLookupFull[]>();

    // Pass 1: place-linker 정밀 매칭
    for (const seed of allSeeds) {
      if (seed.placeId) {
        result.placeIdAlready++;
        continue;
      }

      let lookup = cityLookupCache.get(seed.cityId);
      if (!lookup) {
        lookup = await buildCityPlaceLookup(seed.cityId);
        cityLookupCache.set(seed.cityId, lookup);
      }

      const placeId =
        matchPlaceName(seed.nameEn || "", lookup) ??
        (seed.nameKo ? matchPlaceName(seed.nameKo, lookup) : null);

      if (placeId) {
        await db.update(placeSeedRaw).set({ placeId }).where(eq(placeSeedRaw.id, seed.id));
        seed.placeId = placeId;
        result.placeIdMatched++;
      }
    }
    const pass1 = result.placeIdMatched;

    // Pass 2: 토큰 기반 적극적 매칭 (미매칭 건만)
    let aggressiveMatches = 0;
    for (const seed of allSeeds) {
      if (seed.placeId) continue;

      let fullLookup = cityFullCache.get(seed.cityId);
      if (!fullLookup) {
        fullLookup = await buildFullCityLookup(seed.cityId);
        cityFullCache.set(seed.cityId, fullLookup);
      }

      const placeId =
        aggressiveMatch(seed.nameEn || "", fullLookup) ??
        (seed.nameKo ? aggressiveMatch(seed.nameKo, fullLookup) : null);

      if (placeId) {
        await db.update(placeSeedRaw).set({ placeId }).where(eq(placeSeedRaw.id, seed.id));
        seed.placeId = placeId;
        aggressiveMatches++;
        result.placeIdMatched++;
      }
    }
    console.log(
      `[Consolidation] Step 1 완료: 정밀 ${pass1} + 토큰 ${aggressiveMatches} = 총 ${result.placeIdMatched} 신규, 기존 ${result.placeIdAlready}`
    );

    // place_id가 있는 시드만 필터
    const seedsWithPlaceId = allSeeds.filter((s) => s.placeId != null);
    console.log(`[Consolidation] place_id 보유: ${seedsWithPlaceId.length}건`);

    // ── Step 2: 이미지 우선순위 채우기 (셀럽인스타 > 인스타 > 구글 > MCP) ──
    console.log("[Consolidation] Step 2/6: 이미지 우선순위 채우기...");
    for (const seed of seedsWithPlaceId) {
      // 1순위: 셀럽 인스타 사진 (인물 포함, 핵심 차별화)
      const celebImg = await db
        .select({ imageUrl: celebrityPlaceEvidence.imageUrl })
        .from(celebrityPlaceEvidence)
        .where(eq(celebrityPlaceEvidence.placeId, seed.placeId!))
        .limit(1);
      if (celebImg.length > 0 && celebImg[0].imageUrl) {
        if (seed.bestImageUrl !== celebImg[0].imageUrl) {
          await db.update(placeSeedRaw).set({ bestImageUrl: celebImg[0].imageUrl }).where(eq(placeSeedRaw.id, seed.id));
          seed.bestImageUrl = celebImg[0].imageUrl;
          result.imagesUpdated++;
        }
        continue;
      }

      // 2순위: place_images 인스타 사진 (sortOrder 1=인스타)
      const instaImg = await db
        .select({ url: placeImages.url, sourceType: placeImages.sourceType })
        .from(placeImages)
        .where(eq(placeImages.placeId, seed.placeId!))
        .orderBy(asc(placeImages.sortOrder))
        .limit(1);
      if (instaImg.length > 0 && !seed.bestImageUrl) {
        await db.update(placeSeedRaw).set({ bestImageUrl: instaImg[0].url }).where(eq(placeSeedRaw.id, seed.id));
        seed.bestImageUrl = instaImg[0].url;
        result.imagesUpdated++;
        continue;
      }

      if (seed.bestImageUrl) continue;

      // 3순위: places.instagramPhotoUrls / photoUrls (구글 사진)
      const placeRow = await db
        .select({ instagramPhotoUrls: places.instagramPhotoUrls, photoUrls: places.photoUrls })
        .from(places)
        .where(eq(places.id, seed.placeId!))
        .limit(1);
      if (placeRow.length > 0) {
        const instaUrls = placeRow[0].instagramPhotoUrls as string[] | null;
        const photoUrls = placeRow[0].photoUrls as string[] | null;
        const url = instaUrls?.[0] ?? photoUrls?.[0];
        if (url) {
          await db.update(placeSeedRaw).set({ bestImageUrl: url }).where(eq(placeSeedRaw.id, seed.id));
          seed.bestImageUrl = url;
          result.imagesUpdated++;
        }
      }
    }

    // place_id 없는 시드: placeSeedRawId로 직접 연결 시도
    for (const seed of allSeeds) {
      if (seed.bestImageUrl || seed.placeId) continue;
      const imgs = await db
        .select({ url: placeImages.url })
        .from(placeImages)
        .where(eq(placeImages.placeSeedRawId, seed.id))
        .orderBy(asc(placeImages.sortOrder))
        .limit(1);
      if (imgs.length > 0) {
        await db.update(placeSeedRaw).set({ bestImageUrl: imgs[0].url }).where(eq(placeSeedRaw.id, seed.id));
        seed.bestImageUrl = imgs[0].url;
        result.imagesUpdated++;
      }
    }
    console.log(`[Consolidation] Step 2 완료: 이미지 ${result.imagesUpdated}건 (셀럽>인스타>구글 우선순위)`);

    // ⚠️ 2026-05-15 = price_eur 단일 SSOT (= SSOT §14 GREATEST 비싼 쪽)
    console.log("[Consolidation] Step 3/6: 가격 채우기 (GREATEST 비싼 쪽)...");
    for (const seed of seedsWithPlaceId) {
      const prices = await db
        .select()
        .from(placePrices)
        .where(eq(placePrices.placeId, seed.placeId!))
        .orderBy(desc(placePrices.fetchedAt));

      if (prices.length > 0) {
        const candidates = prices
          .map((p) => p.priceAverage ?? p.priceHigh ?? p.priceLow)
          .filter((v): v is number => v != null);

        if (candidates.length > 0) {
          const maxPrice = Math.max(...candidates);
          const currentPrice = seed.priceEur ?? 0;
          if (maxPrice > currentPrice) {
            await db
              .update(placeSeedRaw)
              .set({ priceEur: maxPrice })
              .where(eq(placeSeedRaw.id, seed.id));
            seed.priceEur = maxPrice;
            result.pricesUpdated++;
          }
        }
      }
    }
    console.log(`[Consolidation] Step 3 완료: 가격 ${result.pricesUpdated}건 (GREATEST)`);

    // ── Step 4: naver_blog_posts → naverBlogCount ──
    console.log("[Consolidation] Step 4/6: 블로그 수 채우기...");
    for (const seed of seedsWithPlaceId) {
      if (seed.naverBlogCount != null && seed.naverBlogCount > 0) continue;

      const blogCount = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(naverBlogPosts)
        .where(eq(naverBlogPosts.placeId, seed.placeId!));

      const cnt = blogCount[0]?.cnt ?? 0;
      if (cnt > 0) {
        await db
          .update(placeSeedRaw)
          .set({ naverBlogCount: cnt })
          .where(eq(placeSeedRaw.id, seed.id));
        seed.naverBlogCount = cnt;
        result.blogCountsUpdated++;
      }
    }
    console.log(`[Consolidation] Step 4 완료: 블로그 ${result.blogCountsUpdated}건 채움`);

    // ── Step 5: celebrity_place_evidence → celebMention ──
    console.log("[Consolidation] Step 5/6: 셀럽 채우기...");
    for (const seed of seedsWithPlaceId) {
      if (seed.celebMention) continue;

      const celebs = await db
        .select({ name: celebEvidence.name })
        .from(celebrityPlaceEvidence)
        .innerJoin(celebEvidence, eq(celebrityPlaceEvidence.celebId, celebEvidence.id))
        .where(eq(celebrityPlaceEvidence.placeId, seed.placeId!))
        .limit(3);

      if (celebs.length > 0) {
        const names = celebs.map((c) => c.name).join(", ");
        await db
          .update(placeSeedRaw)
          .set({ celebMention: names })
          .where(eq(placeSeedRaw.id, seed.id));
        seed.celebMention = names;
        result.celebUpdated++;
      }
    }
    console.log(`[Consolidation] Step 5 완료: 셀럽 ${result.celebUpdated}건 채움`);

    // ── Step 6: places → vibeKeywords 보충 ──
    console.log("[Consolidation] Step 6/6: 분위기 키워드 채우기...");
    for (const seed of seedsWithPlaceId) {
      if (seed.vibeKeywords && Array.isArray(seed.vibeKeywords) && seed.vibeKeywords.length > 0) continue;

      const placeRow = await db
        .select({ vibeKeywords: places.vibeKeywords })
        .from(places)
        .where(eq(places.id, seed.placeId!))
        .limit(1);

      if (placeRow.length === 0) continue;
      const vk = placeRow[0].vibeKeywords;
      if (vk && Array.isArray(vk) && vk.length > 0) {
        await db.update(placeSeedRaw).set({ vibeKeywords: vk }).where(eq(placeSeedRaw.id, seed.id));
        result.vibeUpdated++;
      }
    }
    console.log(`[Consolidation] Step 6 완료: 분위기 ${result.vibeUpdated}건 채움`);

    // ── Bonus: placeNubiReasons → nubiReason 보충 ──
    console.log("[Consolidation] Bonus: nubiReason 보충...");
    for (const seed of seedsWithPlaceId) {
      if (seed.nubiReason) continue;

      const reasons = await db
        .select({ nubiReason: placeNubiReasons.nubiReason })
        .from(placeNubiReasons)
        .where(eq(placeNubiReasons.placeId, seed.placeId!))
        .limit(1);

      if (reasons.length > 0) {
        await db
          .update(placeSeedRaw)
          .set({ nubiReason: reasons[0].nubiReason })
          .where(eq(placeSeedRaw.id, seed.id));
        result.nubiReasonUpdated++;
      }
    }
    console.log(`[Consolidation] Bonus 완료: nubiReason ${result.nubiReasonUpdated}건 보충`);
  } catch (e: any) {
    result.errors.push(e?.message || String(e));
    console.error("[Consolidation] 오류:", e);
  }

  console.log("\n=== 대통합 최종 결과 ===");
  console.log(`전체 seed_raw: ${result.totalSeedRows}건`);
  console.log(`place_id: 기존 ${result.placeIdAlready} + 신규 ${result.placeIdMatched} = ${result.placeIdAlready + result.placeIdMatched}`);
  console.log(`이미지: ${result.imagesUpdated}건 채움`);
  console.log(`가격: ${result.pricesUpdated}건 채움`);
  console.log(`블로그: ${result.blogCountsUpdated}건 채움`);
  console.log(`셀럽: ${result.celebUpdated}건 채움`);
  console.log(`분위기: ${result.vibeUpdated}건 채움`);
  console.log(`nubiReason: ${result.nubiReasonUpdated}건 보충`);
  if (result.errors.length > 0) console.log(`오류: ${result.errors.join(", ")}`);

  return result;
}
