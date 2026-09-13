// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 도시 얼굴 = heritage 고정 / 하이라이트 = 식당·쇼핑만 제외 = 앱 전체 1벌.
import { desc, eq, and, notInArray } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";
import { bestRankOrder } from "./best-rank";

// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 얼굴은 heritage 하나만. 사진·격리·도심으로 거르지 않는다
//   (사진 없음 = 사장님께 "채워라" 신호 / 베스트로 뽑혔으면 도심 밖이어도 그 도시 것).
export function cityRepresentativeWhere(cityId: number) {
  return and(
    eq(placeSeedRaw.cityId, cityId),
    eq(placeSeedRaw.seedCategory, "heritage"),
  );
}

// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 하이라이트 = 카테고리 구분 없이 한 줄(식당·쇼핑만 제외).
export function cityHighlightWhere(cityId: number) {
  return and(
    eq(placeSeedRaw.cityId, cityId),
    notInArray(placeSeedRaw.seedCategory, ["restaurant", "shopping"]),
  );
}

// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 얼굴·하이라이트 공통 정렬 1벌 = 베스트 언어수 → RC → id.
export const cityRepresentativeOrder = (lang?: string) => [
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
