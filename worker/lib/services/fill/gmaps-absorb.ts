// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 흡수(알아보는 문이 "있음"으로 본 곳을 그 행에 합치기) 1벌 = §0 700줄 가드로 gmaps-shared 에서 분리 (정본 §2026-10-24)
import { decidePrice } from "../shared/price-eur";
import { writeBestRankUnion } from "../shared/best-rank";
import {
  codeOf,
  inTxn,
  koCopyOf,
  upsertTranslations,
  type NewEntry,
  type Stat,
} from "./gmaps-shared";

// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 알아보는 문이 "있음"으로 본 곳 = 구글맵은 안 열고 그 행에 흡수 = 제미니 1차 응답을 바탕으로 입힌다(한국어·현지어 이름·한국어 요약·묘사·가격·도심 거리·분류 태그·출처) + 베스트 언어 합치기 + 번역. 구글 페이지가 증명한 몫(영어 이름·주소·좌표·리뷰수·영업 상태·사진·CID)은 안 건드린다. 식당·비식당이 엇갈리면 흡수 안 함 (정본 §2026-10-24)
export const crossKind = (n: NewEntry): boolean =>
  !n.psrHint?.psrTags?.includes(n.cat) &&
  (n.cat === "restaurant") !== (n.psrHint?.psrCat === "restaurant");
export async function absorbInto(
  c: any,
  upsertPlace: any,
  n: NewEntry,
  opts: { cityId: number; provenanceTag: string },
  stat: Stat,
): Promise<void> {
  const hint = n.psrHint!;
  if (crossKind(n)) {
    stat.skipped++;
    console.log(
      `  ⏭ 식당·비식당 엇갈림 = 흡수 안 함: ${n.name}(${n.cat}) ↛ #${hint.psrId} ${hint.psrName}(${hint.psrCat})`,
    );
    return;
  }
  const ko = koCopyOf(n.copies);
  const res = await upsertPlace({
    targetRowId: hint.psrId,
    followTriggerDup: true,
    cityId: opts.cityId,
    seedCategory: n.cat,
    nameEn: hint.psrName,
    nameKo: n.nameKo,
    nameLocal: n.nameLocal,
    priceEur: decidePrice({ base: true, geminiPrice: n.price }),
    distanceKmFromCenter: n.distanceKm ?? null,
    selectionReasonKo: ko?.summary || null,
    shortformKo: ko?.editorial || null,
    phaseTags: [opts.provenanceTag],
  });
  if (res.action !== "updated") {
    stat.skipped++;
    console.log(
      `  ⚠️ 흡수 이상(${res.action}${res.reason ? `: ${res.reason}` : ""}): ${n.name} → #${hint.psrId}`,
    );
    return;
  }
  const code = codeOf(n.name, n.langs, n.copies);
  const br = await inTxn(c, async () => {
    const x = await writeBestRankUnion(c, hint.psrId, code);
    await upsertTranslations(c, hint.psrId, n.copies);
    return x;
  });
  stat.absorbedHint++;
  console.log(
    `  🧲 #${hint.psrId} ${hint.psrName} ← ${n.name} (흡수, langs=${n.langs}, best_rank ${br.cur} ∪ ${code} → ${br.result})`,
  );
}
