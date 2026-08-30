// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = **그 도시의 "대표 장소" 고르는 기준 = 앱 전체 1벌.**
// 기준(2026-08-01 사장님 결정 + 2026-08-21 보완) = 그 도시에서
import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import { servingGateSql } from "./pool-radius";
import { bestRankOrder } from "./best-rank";

// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 하이라이트 카테고리 순서 1벌(§16).
export const HIGHLIGHT_CATEGORIES = [
  "hotspot",
  "attraction",
  "healing",
  "adventure",
] as const;

export function cityRepresentativeWhere(cityId: number) {
  return and(
    eq(placeSeedRaw.cityId, cityId),
    isNotNull(placeSeedRaw.imageUrl),
    isNotNull(placeSeedRaw.googleReviewCount),
    ne(placeSeedRaw.seedCategory, "restaurant"),
    // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 쇼핑은 멀티태그(다른 성격 겸함)일 때만 인정.
    or(
      ne(placeSeedRaw.seedCategory, "shopping"),
      sql`array_length(${placeSeedRaw.categoryTags}, 1) > 1`,
    ),
    // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 격리(wrong-city-suspect) 행 제외.
    sql`NOT (COALESCE(${placeSeedRaw.phaseTags}, '{}') && ARRAY['wrong-city-suspect'])`,
    // 2026-08-24 사장님 육안검수 = 손님상 게이트 1벌(status='active' + RC 증거) = 여정과 동일 기준
    servingGateSql(),
    or(eq(placeSeedRaw.dayZone, "core"), isNull(placeSeedRaw.dayZone)),
  );
}

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 정렬 1벌에 베스트 선두 추가(§16 단일 정렬 유지).
export const cityRepresentativeOrder = [
  bestRankOrder(),
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

// 🗑️ isCityRepresentativePlace() 삭제 = 2026-08-21 사장님 승인 §19.
