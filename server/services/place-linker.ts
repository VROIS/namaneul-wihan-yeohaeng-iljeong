/**
 * Place Linker 서비스
 * 
 * 크롤러가 수집한 데이터(placeName 텍스트)를 places 테이블의 placeId와 매칭
 * 
 * ┌─────────────────────────────────────────────────────────┐
 * │ 대상 테이블         │ 매칭 기준 필드    │ 업데이트 필드   │
 * ├─────────────────────────────────────────────────────────┤
 * │ youtube_place_mentions │ placeName + cityName │ placeId     │
 * │ naver_blog_posts       │ extractedPlaces JSON │ placeId     │
 * │ instagram_hashtags     │ hashtag              │ linkedPlaceId│
 * └─────────────────────────────────────────────────────────┘
 * 
 * 매칭 로직:
 * 1. places.name 정확 매칭 (대소문자 무시)
 * 2. places.displayNameKo 정확 매칭
 * 3. places.aliases 배열에 포함 여부
 * 4. ILIKE 부분 매칭 (짧은 이름 → 긴 이름)
 * 5. 매칭 실패 → 로그 기록 (수동 검토용)
 */

import { db } from "../db";
import { 
  places, cities, youtubePlaceMentions, naverBlogPosts, instagramHashtags 
} from "@shared/schema";
import { eq, isNull, and, ilike, sql, or, inArray } from "drizzle-orm";

// ===================================================================
// 타입
// ===================================================================

interface LinkResult {
  linked: number;
  alreadyLinked: number;
  unmatched: number;
  errors: string[];
  unmatchedNames: string[];
}

interface PlaceLookup {
  id: number;
  name: string;
  nameLower: string;
  displayNameKo: string | null;
  aliases: string[];
  cityId: number;
}

// ===================================================================
// 도시별 장소 캐시 구축
// ===================================================================

async function buildCityPlaceLookup(cityId: number): Promise<PlaceLookup[]> {
  const dbPlaces = await db.select({
    id: places.id,
    name: places.name,
    displayNameKo: places.displayNameKo,
    aliases: places.aliases,
    cityId: places.cityId,
  }).from(places).where(eq(places.cityId, cityId));

  return dbPlaces.map(p => ({
    id: p.id,
    name: p.name,
    nameLower: p.name.toLowerCase().trim(),
    displayNameKo: p.displayNameKo || null,
    aliases: (p.aliases as string[]) || [],
    cityId: p.cityId,
  }));
}

// ===================================================================
// 장소명 → placeId 매칭 (핵심 로직)
// ===================================================================

function matchPlaceName(
  placeName: string,
  lookup: PlaceLookup[],
): number | null {
  const target = placeName.toLowerCase().trim();
  if (!target || target.length < 2) return null;

  // 1단계: 정확 매칭 (name, 대소문자 무시)
  for (const p of lookup) {
    if (p.nameLower === target) return p.id;
  }

  // 2단계: displayNameKo 정확 매칭
  for (const p of lookup) {
    if (p.displayNameKo && p.displayNameKo.toLowerCase().trim() === target) {
      return p.id;
    }
  }

  // 3단계: aliases 배열에서 매칭
  for (const p of lookup) {
    for (const alias of p.aliases) {
      if (alias.toLowerCase().trim() === target) return p.id;
    }
  }

  // 4단계: 부분 매칭 (target이 name에 포함되거나, name이 target에 포함)
  // 짧은 단어의 부분매칭은 오매칭 위험이 있으므로 최소 4자 이상
  if (target.length >= 4) {
    for (const p of lookup) {
      if (p.nameLower.includes(target) || target.includes(p.nameLower)) {
        return p.id;
      }
      if (p.displayNameKo) {
        const koLower = p.displayNameKo.toLowerCase().trim();
        if (koLower.includes(target) || target.includes(koLower)) {
          return p.id;
        }
      }
    }
  }

  // 5단계: 한국어 이름 부분 매칭 (한글 2글자 이상)
  const isKorean = /[가-힣]/.test(target);
  if (isKorean && target.length >= 2) {
    for (const p of lookup) {
      if (p.displayNameKo) {
        const koLower = p.displayNameKo.toLowerCase().trim();
        if (koLower.includes(target) || target.includes(koLower)) {
          return p.id;
        }
      }
      // aliases 한국어 매칭
      for (const alias of p.aliases) {
        if (/[가-힣]/.test(alias)) {
          const aliasLower = alias.toLowerCase().trim();
          if (aliasLower.includes(target) || target.includes(aliasLower)) {
            return p.id;
          }
        }
      }
    }
  }

  return null;
}

// ===================================================================
// YouTube Place Mentions 링킹
// ===================================================================

async function linkYouTubeMentions(cityId?: number): Promise<LinkResult> {
  const result: LinkResult = { linked: 0, alreadyLinked: 0, unmatched: 0, errors: [], unmatchedNames: [] };

  try {
    // placeId가 NULL인 mentions 가져오기
    const unlinked = await db.select({
      id: youtubePlaceMentions.id,
      placeName: youtubePlaceMentions.placeName,
      cityName: youtubePlaceMentions.cityName,
    }).from(youtubePlaceMentions)
      .where(isNull(youtubePlaceMentions.placeId))
      .limit(500);

    if (unlinked.length === 0) {
      console.log("[PlaceLinker] YouTube: 미연결 데이터 없음");
      return result;
    }

    console.log(`[PlaceLinker] YouTube: ${unlinked.length}개 미연결 mention 처리 중...`);

    // 도시별로 그룹핑
    const cityGroups = new Map<string, typeof unlinked>();
    for (const m of unlinked) {
      const key = (m.cityName || "unknown").toLowerCase();
      if (!cityGroups.has(key)) cityGroups.set(key, []);
      cityGroups.get(key)!.push(m);
    }

    // 도시명 → cityId 매핑
    const allCities = await db.select({ id: cities.id, name: cities.name }).from(cities);
    const cityMap = new Map<string, number>();
    for (const c of allCities) {
      cityMap.set(c.name.toLowerCase(), c.id);
    }

    for (const [cityName, mentions] of cityGroups) {
      const resolvedCityId = cityId || cityMap.get(cityName);
      if (!resolvedCityId) {
        // 도시명으로 fuzzy 매칭
        let foundCityId: number | null = null;
        for (const [cName, cId] of cityMap) {
          if (cName.includes(cityName) || cityName.includes(cName)) {
            foundCityId = cId;
            break;
          }
        }
        if (!foundCityId) {
          result.unmatched += mentions.length;
          for (const m of mentions) {
            if (!result.unmatchedNames.includes(m.placeName)) {
              result.unmatchedNames.push(m.placeName);
            }
          }
          continue;
        }
      }

      const lookup = await buildCityPlaceLookup(resolvedCityId || 0);
      if (lookup.length === 0) continue;

      for (const mention of mentions) {
        const matchedId = matchPlaceName(mention.placeName, lookup);
        if (matchedId) {
          await db.update(youtubePlaceMentions)
            .set({ placeId: matchedId })
            .where(eq(youtubePlaceMentions.id, mention.id));
          result.linked++;
        } else {
          result.unmatched++;
          if (!result.unmatchedNames.includes(mention.placeName) && result.unmatchedNames.length < 20) {
            result.unmatchedNames.push(mention.placeName);
          }
        }
      }
    }
  } catch (e: any) {
    result.errors.push(`YouTube: ${e.message}`);
  }

  console.log(`[PlaceLinker] YouTube: ${result.linked}개 연결, ${result.unmatched}개 미매칭`);
  return result;
}

// ===================================================================
// Naver Blog Posts 링킹
// ===================================================================

async function linkNaverBlogPosts(cityId?: number): Promise<LinkResult> {
  const result: LinkResult = { linked: 0, alreadyLinked: 0, unmatched: 0, errors: [], unmatchedNames: [] };

  try {
    // placeId가 NULL이고 cityId가 있는 posts
    const whereClause = cityId
      ? and(isNull(naverBlogPosts.placeId), eq(naverBlogPosts.cityId, cityId))
      : isNull(naverBlogPosts.placeId);

    const unlinked = await db.select({
      id: naverBlogPosts.id,
      cityId: naverBlogPosts.cityId,
      extractedPlaces: naverBlogPosts.extractedPlaces,
      postTitle: naverBlogPosts.postTitle,
    }).from(naverBlogPosts)
      .where(whereClause)
      .limit(500);

    if (unlinked.length === 0) {
      console.log("[PlaceLinker] Naver Blog: 미연결 데이터 없음");
      return result;
    }

    console.log(`[PlaceLinker] Naver Blog: ${unlinked.length}개 미연결 포스트 처리 중...`);

    // 도시별 lookup 캐시
    const lookupCache = new Map<number, PlaceLookup[]>();

    for (const post of unlinked) {
      if (!post.cityId) { result.unmatched++; continue; }

      let lookup = lookupCache.get(post.cityId);
      if (!lookup) {
        lookup = await buildCityPlaceLookup(post.cityId);
        lookupCache.set(post.cityId, lookup);
      }
      if (lookup.length === 0) { result.unmatched++; continue; }

      // extractedPlaces에서 장소명 추출하여 매칭
      const extracted = post.extractedPlaces as any[];
      let bestMatch: number | null = null;

      if (extracted && Array.isArray(extracted)) {
        for (const ep of extracted) {
          if (ep.placeName) {
            const matchedId = matchPlaceName(ep.placeName, lookup);
            if (matchedId) {
              bestMatch = matchedId;
              break;
            }
          }
        }
      }

      // extractedPlaces에서 못 찾으면 제목에서 시도
      if (!bestMatch) {
        for (const p of lookup) {
          const title = post.postTitle.toLowerCase();
          if (title.includes(p.nameLower) || 
              (p.displayNameKo && title.includes(p.displayNameKo.toLowerCase()))) {
            bestMatch = p.id;
            break;
          }
        }
      }

      if (bestMatch) {
        await db.update(naverBlogPosts)
          .set({ placeId: bestMatch })
          .where(eq(naverBlogPosts.id, post.id));
        result.linked++;
      } else {
        result.unmatched++;
      }
    }
  } catch (e: any) {
    result.errors.push(`Naver Blog: ${e.message}`);
  }

  console.log(`[PlaceLinker] Naver Blog: ${result.linked}개 연결, ${result.unmatched}개 미매칭`);
  return result;
}

// ===================================================================
// Instagram Hashtags 링킹
// ===================================================================

async function linkInstagramHashtags(cityId?: number): Promise<LinkResult> {
  const result: LinkResult = { linked: 0, alreadyLinked: 0, unmatched: 0, errors: [], unmatchedNames: [] };

  try {
    // linkedPlaceId가 NULL인 해시태그
    const whereClause = cityId
      ? and(isNull(instagramHashtags.linkedPlaceId), eq(instagramHashtags.linkedCityId, cityId))
      : isNull(instagramHashtags.linkedPlaceId);

    const unlinked = await db.select({
      id: instagramHashtags.id,
      hashtag: instagramHashtags.hashtag,
      linkedCityId: instagramHashtags.linkedCityId,
    }).from(instagramHashtags)
      .where(whereClause)
      .limit(500);

    if (unlinked.length === 0) {
      console.log("[PlaceLinker] Instagram: 미연결 데이터 없음");
      return result;
    }

    console.log(`[PlaceLinker] Instagram: ${unlinked.length}개 미연결 해시태그 처리 중...`);

    const lookupCache = new Map<number, PlaceLookup[]>();

    for (const tag of unlinked) {
      const cId = tag.linkedCityId || (cityId ?? null);
      if (!cId) { result.unmatched++; continue; }

      let lookup = lookupCache.get(cId);
      if (!lookup) {
        lookup = await buildCityPlaceLookup(cId);
        lookupCache.set(cId, lookup);
      }
      if (lookup.length === 0) { result.unmatched++; continue; }

      // 해시태그에서 장소명 추출 (공백/특수문자 제거된 상태)
      const cleanTag = tag.hashtag.replace(/^#/, "").toLowerCase();
      
      let bestMatch: number | null = null;
      for (const p of lookup) {
        const nameNoSpace = p.nameLower.replace(/[\s\-_'']/g, "");
        if (nameNoSpace === cleanTag || cleanTag === nameNoSpace) {
          bestMatch = p.id;
          break;
        }
        // 한국어명 매칭
        if (p.displayNameKo) {
          const koNoSpace = p.displayNameKo.replace(/[\s\-_]/g, "").toLowerCase();
          if (koNoSpace === cleanTag || cleanTag.includes(koNoSpace)) {
            bestMatch = p.id;
            break;
          }
        }
      }

      if (bestMatch) {
        await db.update(instagramHashtags)
          .set({ linkedPlaceId: bestMatch })
          .where(eq(instagramHashtags.id, tag.id));
        result.linked++;
      } else {
        result.unmatched++;
      }
    }
  } catch (e: any) {
    result.errors.push(`Instagram: ${e.message}`);
  }

  console.log(`[PlaceLinker] Instagram: ${result.linked}개 연결, ${result.unmatched}개 미매칭`);
  return result;
}

// ===================================================================
// 전체 링킹 실행
// ===================================================================

export async function linkAllPendingData(cityId?: number): Promise<{
  youtube: LinkResult;
  naverBlog: LinkResult;
  instagram: LinkResult;
  totalLinked: number;
  totalUnmatched: number;
}> {
  console.log(`\n[PlaceLinker] ===== 데이터 링킹 시작 ${cityId ? `(cityId: ${cityId})` : "(전체)"} =====`);

  const youtube = await linkYouTubeMentions(cityId);
  const naverBlog = await linkNaverBlogPosts(cityId);
  const instagram = await linkInstagramHashtags(cityId);

  const totalLinked = youtube.linked + naverBlog.linked + instagram.linked;
  const totalUnmatched = youtube.unmatched + naverBlog.unmatched + instagram.unmatched;

  console.log(`[PlaceLinker] ===== 링킹 완료: ${totalLinked}개 연결, ${totalUnmatched}개 미매칭 =====\n`);

  return { youtube, naverBlog, instagram, totalLinked, totalUnmatched };
}

// ===================================================================
// 도시별 링킹 (place-seeder 연쇄용)
// ===================================================================

export async function linkDataForCity(cityId: number): Promise<{ linked: number; unmatched: number }> {
  const result = await linkAllPendingData(cityId);
  return { linked: result.totalLinked, unmatched: result.totalUnmatched };
}

export const placeLinker = {
  linkAllPendingData,
  linkDataForCity,
  linkYouTubeMentions,
  linkNaverBlogPosts,
  linkInstagramHashtags,
};
