// place 통과 + 이미지 폴백 = 매칭 폐기 슬림(2026-07-18 §0/§19: 코드 매칭 3벌 삭제, 매칭은 트리거 1벌). 옛 "매칭 SSOT" 폐기.
import type { AG3PreOutput, PlaceResult } from "./types";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage, loadImagePidMap } from "../shared/place-image";

/**
 * AG3 메인: DB 매칭 + 좌표 보강 + Google Places 보충
 *
 * AG2가 반환한 장소명을 DB와 매칭하여 실제 데이터를 삽입
 * DB에 없는 장소는 Google Places API로 좌표/사진 확보
 */
export async function matchPlacesWithDB(
  geminiPlaces: PlaceResult[],
  preloaded: AG3PreOutput,
): Promise<PlaceResult[]> {
  // 🗑️ 2026-07-05 삭제 = dbPlacesMap/placeImageMap/celebrityImageMap/cityName 구조분해 = 본문 미사용 죽은변수 §0/§19. seedRawMap 단일.
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
  //   = 옛 ag3 전체PSR SELECT(12,936행 2,800ms) + matchCandidate 판정 완전삭제 §19 = 기준 드리프트(중복 신규생성 사고) 근본 + 병목 근본.
  //   = 여기선 매칭 안 함 = place 원본 통과 + seed 이미지 폴백만(seedRawMap 100km 재조회). 재활용(RC·요약·PID)은 ag3-save 흡수(RETURNING)가 담당.
  //   = DB Direct(DB-only 경로) 는 이 함수 안 탐(MIX 전용) = 분기 삭제. matchCandidate/buildCandidateIndex import 도 제거.
  const enriched: PlaceResult[] = geminiPlaces.map((place) => {
    // 이미지 = place(Gemini) 우선, 없으면 seedRawMap(100km) 이름키 폴백. 좌표/PID/RC = 흡수(RETURNING) 또는 TS 가 확보.
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

  // 🗑️ 2026-07-18 §0/§19 = Instagram 깨진 URL 필터 + Wikipedia 실시간 이미지 보강 완전삭제.
  //   = Instagram = 완전 쓰레기(사장님 SSOT, DB 605건 옛 레거시) / Wikipedia 보강 = 죽은 코드(호출부 skipImageEnrich=true 고정).
  //   = 이미지 SSOT = Storage(place-images) + 사후 일괄 fill/image-backfill(무료재링크→raw photoName→PM). 생성 중 이미지 채우기 = 2026-07-11 사진 분리 수술로 폐기.
  return enriched;
}
