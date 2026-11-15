// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 도시 얼굴·하이라이트(인기 명소 등수순 · 식당만 제외)·대표 여정 고르기 = 앱 전체 1벌 (정본 2026-11-15)
import { desc, eq, and, or, sql, ne } from "drizzle-orm";
import { placeSeedRaw, cities, itineraries } from "@shared/schema";
import { BEST_RANK_BASE, bestRankOrder } from "./best-rank";
import type { Db } from "../../../db-types";

// ⚠️ 수정금지(승인필요) 2026-11-07 사장님 결정 = 도시 대표 여정 고르는 순서 1벌 = 도시 카드·공개 여정 글 페이지가 같이 쓴다 (정본 2026-11-07)
export async function cityWithRepresentative(db: Db, cityId: number) {
  const [row] = await db
    .select({
      nameKo: cities.name,
      nameEn: cities.nameEn,
      country: cities.country,
      countryCode: cities.countryCode,
      itineraryId: itineraries.id,
      rawData: itineraries.rawData,
      videoByDay: itineraries.videoByDay,
      companionType: itineraries.companionType,
      curationFocus: itineraries.curationFocus,
      travelPace: itineraries.travelPace,
      updatedAt: itineraries.updatedAt,
      overrideHeroPlaceId: cities.overrideHeroPlaceId,
      overrideHighlightPlaceIds: cities.overrideHighlightPlaceIds,
      overrideVideoId: cities.overrideVideoId,
      countryOrder: cities.countryOrder,
      cityOrder: cities.cityOrder,
    })
    .from(cities)
    .leftJoin(
      itineraries,
      and(
        eq(itineraries.cityId, cities.id),
        or(
          eq(itineraries.status, "representative"),
          sql`EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e
                    WHERE e.value->>'status' = 'succeeded')`,
        ),
      ),
    )
    .where(eq(cities.id, cityId))
    .orderBy(
      sql`CASE
          WHEN ${itineraries.status} = 'representative'
               AND EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e WHERE e.value->>'status'='succeeded')
               THEN 0
          WHEN EXISTS (SELECT 1 FROM jsonb_each(${itineraries.videoByDay}) e WHERE e.value->>'status'='succeeded')
               THEN 1
          WHEN ${itineraries.status} = 'representative' THEN 2
          ELSE 3
        END`,
      sql`(SELECT MAX(sv.created_at) FROM saved_videos sv WHERE sv.itinerary_id = ${itineraries.id}) DESC NULLS LAST`,
      desc(itineraries.id),
    )
    .limit(1);
  return row ?? null;
}

// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 얼굴·하이라이트 = 그 도시의 식당 아닌 행 한 줄 = 인기 명소 1위가 얼굴 · 그다음 셋이 하이라이트 (정본 2026-11-15)
export function cityRepresentativeWhere(cityId: number) {
  return and(
    eq(placeSeedRaw.cityId, cityId),
    ne(placeSeedRaw.seedCategory, "restaurant"),
  );
}

// ⚠️ 수정금지(승인필요) 2026-11-15 사장님 결정 = 얼굴·하이라이트 공통 정렬 1벌 = 인기 명소 등수 → 베스트 언어수 → RC → id (정본 2026-11-15)
export const cityRepresentativeOrder = (lang?: string) => [
  sql`NULLIF(floor(${placeSeedRaw.bestRank} / ${sql.raw(String(BEST_RANK_BASE))}), 0) ASC NULLS LAST`,
  bestRankOrder(lang),
  desc(placeSeedRaw.googleReviewCount),
  desc(placeSeedRaw.id),
];

// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 다국어 표시명 고르는 규칙 1벌(§16).
const HAS_KOREAN = /[가-힣]/;
export function pickDisplayName(p: {
  nameEn?: string | null;
  nameLocal?: string | null;
  nameKo?: string | null;
}): string {
  const candidates = [p.nameEn, p.nameLocal];
  for (const v of candidates) {
    const s = (v || "").trim();
    if (s && !HAS_KOREAN.test(s)) return s;
  }
  return (p.nameEn || p.nameLocal || p.nameKo || "").trim();
}
