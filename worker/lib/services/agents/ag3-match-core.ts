import type { AG3PreOutput, PlaceResult } from "./types";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage, loadImagePidMap } from "../shared/place-image";

export async function matchPlacesWithDB(
  geminiPlaces: PlaceResult[],
  preloaded: AG3PreOutput,
): Promise<PlaceResult[]> {
  const { seedRawMap, cityId } = preloaded;
  const _t0 = Date.now();
  // ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = PID공유 폴백 목록 = 요청도시 + 풀에 섞인 크로스도시 전부(60초 캐시).
  const imagePidMap = cityId
    ? await loadImagePidMap([
        cityId,
        ...[...(seedRawMap?.values() ?? [])].map((s: any) => s.cityId),
      ])
    : undefined;

  // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 SSOT = 매칭 3벌(ag3·upsertPlace·트리거) 폐기 = 코드는 INSERT만, 매칭은 트리거 1벌(100km 단일판정).
  const enriched: PlaceResult[] = geminiPlaces.map((place) => {
    const nameKey = place.name
      ? place.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")
      : "";
    const seed = seedRawMap?.get(nameKey);
    const finalImg =
      place.image || (seed ? pickPlaceImage(seed, imagePidMap) || "" : "");
    return { ...place, sourceType: "Gemini AI (New)", image: finalImg };
  });
  console.log(
    `[AG3] 매칭 폐기(트리거 단일) = ${enriched.length}곳 place 통과 (${Date.now() - _t0}ms)`,
  );

  return enriched;
}
