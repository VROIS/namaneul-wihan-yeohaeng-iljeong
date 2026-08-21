// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = **그 도시의 "대표 장소" 고르는 기준 = 앱 전체 1벌.**
//   쓰는 곳 = city-place-routes.ts (도시 대표카드의 사진·태그라인·하이라이트) 1곳.
//   ⚠️ 해설 무료 판정과의 결합은 끊었다 = 2026-08-21 §19 — 무료/차감은 **장소가 아니라 출발화면**으로
//     정한다(도시카드에서 열면 무료 / 여정 슬롯에서 열면 차감). 같은 장소라도 경로가 다르면 값이 다르므로
//     "장소가 도시 대표인가"로는 판정할 수 없었다(여정 슬롯에 대표장소가 들어오면 공짜가 되던 구멍).
//
// 기준(2026-08-01 사장님 결정 + 2026-08-21 보완) = 그 도시에서
//   사진 있고 · 구글 리뷰수 있고 · 식당 아니고 · 쇼핑은 멀티태그일 때만 · 격리행 아니고 ·
//   도심(core 또는 미지정) 인 장소 중 **리뷰수 1위**.
//   ⚠️ 동점 해소 = 그다음 **큰 id(최신) 우선**(§14) — 이게 없으면 리뷰수가 같은 도시에서
//     LIMIT 1 조회와 LIMIT 3 조회가 서로 다른 행을 1위로 돌려줄 수 있다.
import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { placeSeedRaw } from "@shared/schema";

// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 하이라이트 카테고리 순서 1벌(§16).
//   대표사진 아래 하이라이트는 이 4 CAT 에서 각 1위를 이 순서대로 뽑는다(식당·쇼핑 = 랜드마크가 거의
//   아니라 제외). 쇼핑은 멀티태그(category_tags 2개 이상 = 다른 성격도 겸함)일 때만 아래 조건이 살린다.
export const HIGHLIGHT_CATEGORIES = [
  "hotspot",
  "attraction",
  "healing",
  "adventure",
] as const;

// 대표 장소 후보 걸러내는 조건 1벌
export function cityRepresentativeWhere(cityId: number) {
  return and(
    eq(placeSeedRaw.cityId, cityId),
    isNotNull(placeSeedRaw.imageUrl),
    isNotNull(placeSeedRaw.googleReviewCount),
    ne(placeSeedRaw.seedCategory, "restaurant"),
    // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 쇼핑은 멀티태그(다른 성격 겸함)일 때만 인정.
    //   사유 = 일반 쇼핑몰은 랜드마크가 아닌데 리뷰수만 높아 도시 얼굴을 차지했다(나이로비 카드 = 쇼핑몰
    //   매장 내부 사진, 하이라이트 3칸 전부 쇼핑몰 = 2026-08-21 육안검수 실측).
    or(
      ne(placeSeedRaw.seedCategory, "shopping"),
      sql`array_length(${placeSeedRaw.categoryTags}, 1) > 1`,
    ),
    // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 격리(wrong-city-suspect) 행 제외.
    //   사유 = 격리 표식이 붙은 행이 그대로 카드에 노출됐다(시카고 "게이트웨이 아치" = 세인트루이스
    //   랜드마크, 토론토 "Warsaw" = 7,547km. 옛 day_zone 만 보던 구멍 = 2026-08-21 §19).
    sql`NOT (COALESCE(${placeSeedRaw.phaseTags}, '{}') && ARRAY['wrong-city-suspect'])`,
    or(eq(placeSeedRaw.dayZone, "core"), isNull(placeSeedRaw.dayZone)),
  );
}

// 순위 매기는 정렬 1벌 (리뷰수 내림 → 동점이면 최신 id)
export const cityRepresentativeOrder = [
  desc(placeSeedRaw.googleReviewCount),
  desc(placeSeedRaw.id),
];

// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 다국어 표시명 고르는 규칙 1벌(§16).
//   순서 = name_en → name_local → name_ko.
//   ⚠️ 다만 **칸 이름만 믿지 않고 값을 본다** = name_en 칸에 한국어가 들어간 오염 행이 실측 55건 있고
//     (그중 카드 후보 24건 = 파리 20·서울 4), 그 행들은 칸이 비어있지 않아 폴백이 발동하지 않았다.
//     그래서 한국어가 든 값은 건너뛰고 다음 칸을 본다(= 사장님 지시 "name_en 혹은 name_local 순차 입력").
//     오염 행 자체의 교정은 별건(창고 raw·name_local 로 채움) = 이 함수는 화면이 깨지지 않게 하는 안전망.
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
  // 전부 한국어거나 비었으면 = 있는 것 중 첫 값(한국어라도 이름은 보여야 한다)
  return (p.nameEn || p.nameLocal || p.nameKo || "").trim();
}

// 🗑️ isCityRepresentativePlace() 삭제 = 2026-08-21 사장님 승인 §19.
//   사유 = 해설 무료/차감은 **장소가 아니라 출발화면**으로 정한다(도시카드=무료 / 여정 슬롯=차감).
//   장소 기준 판정은 여정 슬롯에 그 도시 대표장소가 들어오면 차감이 안 되는 구멍이 있었다.
//   현행 판정 = guide-routes.ts 의 from=card 파라미터 1벌.
