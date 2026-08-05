// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = **그 도시의 "대표 장소" 고르는 기준 = 앱 전체 1벌.**
//   이 파일의 조건·정렬을 **두 곳이 그대로 가져다 쓴다**(각자 다시 적지 않는다 = §0·§16):
//     ① city-place-routes.ts = 도시 대표카드가 보여줄 장소(상위 3곳, 1위가 카드 얼굴)
//     ② guide-routes.ts      = 그 1위 장소의 해설 = **맛보기라 무료**(차감 면제 판정)
//   두 곳이 같은 기준을 봐야 "카드에 뜬 그 해설"과 "무료로 열리는 해설"이 어긋나지 않는다.
//   ⚠️ 어긋나면 = 카드가 보여준 장소를 눌렀는데 서버는 다른 장소를 대표로 봐서 **5크레딧이 깎인다**
//     (2026-08-05 사장님이 실제로 겪은 그 버그의 재발 경로 = §22 판단검증이 지적).
//
// 기준(2026-08-01 사장님 결정) = 그 도시에서
//   사진 있고 · 구글 리뷰수 있고 · 식당 아니고 · 도심(core 또는 미지정) 인 장소 중 **리뷰수 1위**.
//   ⚠️ 동점 해소 = 그다음 **큰 id(최신) 우선**(§14) — 이게 없으면 리뷰수가 같은 도시에서
//     LIMIT 1 조회와 LIMIT 3 조회가 서로 다른 행을 1위로 돌려줄 수 있다.
import { and, desc, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";

// 대표 장소 후보 걸러내는 조건 1벌
export function cityRepresentativeWhere(cityId: number) {
  return and(
    eq(placeSeedRaw.cityId, cityId),
    isNotNull(placeSeedRaw.imageUrl),
    isNotNull(placeSeedRaw.googleReviewCount),
    ne(placeSeedRaw.seedCategory, "restaurant"),
    or(eq(placeSeedRaw.dayZone, "core"), isNull(placeSeedRaw.dayZone)),
  );
}

// 순위 매기는 정렬 1벌 (리뷰수 내림 → 동점이면 최신 id)
export const cityRepresentativeOrder = [
  desc(placeSeedRaw.googleReviewCount),
  desc(placeSeedRaw.id),
];

// 이 장소가 자기 도시의 대표 장소인가 = **맛보기 해설(무료)** 여부.
//   장소번호만 받아 그 장소의 도시를 찾고, 그 도시 1위와 같은지 본다
//   = 화면이 무엇을 보내든 서버가 스스로 판정 → 파라미터로 무료를 흉내낼 수 없다.
export async function isCityRepresentativePlace(
  placeId: number,
): Promise<boolean> {
  // DB 미연결이면 "대표장소 아님"으로 = 무료 판정을 못 하니 종전대로 차감 경로로 보낸다(같은 폴더 pool-radius.ts 관례).
  if (!db) return false;
  const [place] = await db
    .select({ cityId: placeSeedRaw.cityId })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.id, placeId))
    .limit(1);
  if (!place?.cityId) return false;

  const [top] = await db
    .select({ id: placeSeedRaw.id })
    .from(placeSeedRaw)
    .where(cityRepresentativeWhere(place.cityId))
    .orderBy(...cityRepresentativeOrder)
    .limit(1);
  return top?.id === placeId;
}
