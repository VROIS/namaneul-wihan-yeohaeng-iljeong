// DB 매칭(9조합) + 이미지 보강 = ag3-data-matcher 분리(2026-07-16 §0 슬림화, 순수 이동)
// ⚠️ 이 파일 = 매칭 SSOT(9조합 매칭) 로직/정규화/문자열 1글자도 변경 금지(§19 박제 금지 준수 이동)

import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";
import type {
  AG3PreOutput,
  PlaceResult,
  SeedCategory,
} from "./types";
// ⚠️ 수정금지(승인필요) §16 = 동일장소 7단계 매칭 = 공용 matcher.ts 단일 (= URI veto)
// ⚠️ 2026-07-09 = 후보 사전인덱스(pre-bucket) = 도시무관 전체PSR 매칭 4.3초→0.1초 (§16 matcher SSOT).
import { matchCandidate, buildCandidateIndex, candidatesFor } from "../shared/matcher";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from "../shared/place-image";
import { isUsableImageUrl } from "./ag3-image-utils";

// 🗑️ 2026-07-05 삭제 = getGoogleMapsApiKey() = 호출 0곳 데드코드 §0/§19. 이미지 폴백은 pickPlaceImage 단일 SSOT 담당.

// 🗑️ 2026-07-05 삭제 = PD getPlaceDetailsById 폐기 인용 3중복 = 박제 §19. 신규장소 좌표/사진/PID = saveNewPlacesToDB TS searchText 담당.

/**
 * AG3 메인: DB 매칭 + 좌표 보강 + Google Places 보충
 *
 * AG2가 반환한 장소명을 DB와 매칭하여 실제 데이터를 삽입
 * DB에 없는 장소는 Google Places API로 좌표/사진 확보
 */
export async function matchPlacesWithDB(
  geminiPlaces: PlaceResult[],
  preloaded: AG3PreOutput,
  // ⚠️ 수정금지(승인필요) 2026-05-31 = 사용자 SSOT = 이미지 보강 background 화 옵션
  // = skipImageEnrich=true = Wikipedia 이미지 보강(= 동기 ~9초) skip = FE 우선 노출
  // = 이미지 = fill/image-backfill(사후 일괄) 이 DB 저장 = 다음 trip = DB hit (2026-07-11 사진 분리 수술)
  opts?: { skipImageEnrich?: boolean },
): Promise<PlaceResult[]> {
  // 🗑️ 2026-07-05 삭제 = dbPlacesMap/placeImageMap/celebrityImageMap/cityName 구조분해 = 본문 미사용 죽은변수 §0/§19. seedRawMap 단일.
  const { seedRawMap } = preloaded;
  const _t0 = Date.now();

  let matched = 0;
  // 🗑️ 2026-07-05 삭제 = googleFetched 카운터 = 죽은 googleResults 분기 전용(항상 0) §0/§19
  let unmatchedCount = 0;

  // === 1단계: DB 매칭 (동기, 빠름) ===
  type MatchResult = {
    place: PlaceResult;
    dbMatch: any | null;
    needsGoogle: boolean;
  };
  const matchResults: MatchResult[] = [];

  // ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 매칭 후보 = 전체 PSR 글로벌(도시무관) = place-upsert.ts:128 동일 방식(§16).
  //   = 옛 "seedRawMap(도시한정) + cityId 강제주입" 폐기 2026-07-09 §19: 같은 장소가 다른 도시 여정에서 재발굴되던 재과금 근본.
  //   = 매칭용 후보(식별 9컬럼)는 글로벌, 슬롯표시용 seedRawMap 은 도시한정 그대로(메모리·표시 분리). 병합 rowId 는 아래 stage 에서 slot 으로 전달.
  //   식별 9컬럼(매칭) + 표시 4컬럼(RC·요약·이미지 = 매칭직후 place 채움용, 도시무관 재활용 = stranded 해소).
  const _cid = (preloaded.cityId ?? -1) as number;
  const seedCands: any[] = db
    ? await db.select({
        id: placeSeedRaw.id, cityId: placeSeedRaw.cityId,
        googlePlaceId: placeSeedRaw.googlePlaceId, googleMapsUri: placeSeedRaw.googleMapsUri,
        address: placeSeedRaw.address, latitude: placeSeedRaw.latitude, longitude: placeSeedRaw.longitude,
        nameEn: placeSeedRaw.nameEn, nameLocal: placeSeedRaw.nameLocal, nameKo: placeSeedRaw.nameKo,
        googleReviewCount: placeSeedRaw.googleReviewCount, editorialSummary: placeSeedRaw.editorialSummary,
        summaryKo: placeSeedRaw.summaryKo, imageUrl: placeSeedRaw.imageUrl,
        priceEur: placeSeedRaw.priceEur, rank: placeSeedRaw.rank, seedCategory: placeSeedRaw.seedCategory,
      }).from(placeSeedRaw)
    : [];

  // ⚠️ 2026-07-09 사장님 SSOT = 후보 1회 사전인덱스 = place 마다 전체 filter(12,769행×24곳) 회피 → 관련 후보 서브셋만 matchCandidate 에 전달(§16).
  //   = 도시무관화 부작용(매칭 4.3초) 근본해소. 매칭 결과 불변(7단계 키 합집합 = 보수적 후보).
  const candIndex = buildCandidateIndex(seedCands);

  for (const place of geminiPlaces) {
    // ⚠️ 수정금지(승인필요) 2026-05-20 = DB-only path skip = AG2 가 이미 place_seed_raw 직접 = 매칭 불필요 (= 사용자 SSOT 병렬 극대화)
    // ⚠️ 2026-05-20 = 여기서 matched++ 안 함 (= line 466 if(dbMatch) 와 이중 증가 방지)
    if (place.sourceType === "DB Direct (Place Seed Raw)") {
      matchResults.push({ place, dbMatch: place as any, needsGoogle: false });
      continue;
    }

    // ⚠️ 수정금지(승인필요) — PID veto 제거 텍스트 정합(2026-06-15 SSOT)
    // ⚠️ 2026-06-03 = 5 단계 매칭 = 공용 matcher.ts 단일 (= 자체 0~4순위 폐기 = upsertPlace/트리거와 동일 검증 + URI veto(PID veto 제거))
    //   = PID > URI > 풀주소+이름9조합 > 좌표10m > 로컬네임9조합. 단계 통과 시 다음 자동 스킵. 다른 URI = 다른 장소(PID 차이는 veto 아님, 2026-06-15 SSOT).
    // ⚠️ 수정금지(승인필요) 2026-07-05 사장님 SSOT = 좌표(10m 앵커)는 매칭에 반드시 넘김.
    //   = 이유: 도시가 아닌 오지·풀주소가 명확히 정립 안 된 곳에서 좌표 = 이름/주소가 안 맞아도 통하는 만국 통용 매칭키.
    //   = matcher 5순위 좌표(10m)는 name_local/PID/URI/주소 다 실패 시에만 도달 + URI veto 로 오병합 차단 = 안전. 임의 제거 금지.
    const matchInput = {
      cityId: _cid,
      googlePlaceId: (place as any).geminiPlaceId || (place as any).googlePlaceId || null,
      googleMapsUri: (place as any).googleMapsUri || null,
      address: (place as any).geminiAddress || (place as any).address || null,
      latitude: (place as any).lat != null ? parseFloat(String((place as any).lat)) : null,
      longitude: (place as any).lng != null ? parseFloat(String((place as any).lng)) : null,
      nameEn: place.name || null,
      nameLocal: (place as any).nameLocal || null,
      nameKo: (place as any).nameKo || null,
    };
    // ⚠️ 2026-07-09 = 전체 seedCands 대신 사전인덱스로 좁힌 후보 서브셋만 전달(매칭결과 불변, 4.3초→0.1초).
    const seedDirectMatch: any = matchCandidate(matchInput, candidatesFor(candIndex, matchInput)).match || null;
    if (seedDirectMatch)
      console.log(`[AG3] ✅ matcher 매칭: "${place.name}" → "${seedDirectMatch.nameEn}"`);

    // 🧠 2026-07-05 새철학 = 모든 정보 무조건 새것(Gemini) 우선 = seed 는 빈칸 폴백만 = seed우선 방식 폐기 §14갱신/§19.
    //   = 매칭 = 같은 장소 확인 = Gemini 최신값을 살리고, place 가 비었을 때만 seed 로 채움(PID/리뷰수 포함).
    //   = __seedDirectMatch marker 만 뼈대로 남겨 후속 enrichment(job upsert)가 매칭 원행을 인식.
    if (seedDirectMatch) {
      // 좌표 = Gemini 있으면 유지, 없을(0) 때만 seed 폴백
      if ((!place.lat || place.lat === 0) && seedDirectMatch.latitude && seedDirectMatch.longitude) {
        place.lat = parseFloat(String(seedDirectMatch.latitude));
        place.lng = parseFloat(String(seedDirectMatch.longitude));
      }
      // 이미지 = place 비었을 때만 seed (= Google 1 > WK 2)
      if (!place.image) {
        const seedImg = pickPlaceImage(seedDirectMatch);
        if (seedImg) place.image = seedImg;
      }
      // PID/리뷰수 = place(Gemini/TS 새값) 있으면 유지, 없을 때만 seed 폴백 = 새것 우선 §14갱신
      if (!(place as any).googlePlaceId && seedDirectMatch.googlePlaceId)
        (place as any).googlePlaceId = seedDirectMatch.googlePlaceId;
      if (!(place as any).userRatingCount && seedDirectMatch.googleReviewCount)
        (place as any).userRatingCount = seedDirectMatch.googleReviewCount;
      // 요약/이유 = Gemini 있으면 유지, 없을 때만 seed 폴백(§20 = Gemini 최신 큐레이션 우선).
      if (!(place as any).editorialSummary && seedDirectMatch.editorialSummary)
        (place as any).editorialSummary = seedDirectMatch.editorialSummary;
      if (!place.description)
        place.description = seedDirectMatch.editorialSummary || seedDirectMatch.summaryKo || place.description;
      if (!place.personaFitReason && seedDirectMatch.summaryKo)
        place.personaFitReason = seedDirectMatch.summaryKo;
      (place as any).__seedDirectMatch = seedDirectMatch;
    }

    // ⚠️ 수정금지(승인필요) 2026-05-06 = seedDirectMatch 만 신뢰 = 매칭 X 시 즉시 Google
    const needsGoogle = !seedDirectMatch;
    matchResults.push({ place, dbMatch: seedDirectMatch || null, needsGoogle });
  }

  console.log(
    `[AG3] DB 매칭 완료 (${Date.now() - _t0}ms): ${matchResults.filter((r) => r.dbMatch).length}곳 매칭, ${matchResults.filter((r) => r.needsGoogle).length}곳 미매칭(→ saveNewPlacesToDB TS)`,
  );

  // 🗑️ 2026-07-05 삭제 = googleNeeded/googleResults 빈맵 병렬섹션(.set 0곳=영구빈맵) + PD폐기 인용 = 죽은코드·박제 §0/§19.
  //   = 미매칭 장소의 좌표/사진/PID = saveNewPlacesToDB 의 TS searchText 가 일괄 확보(여기선 원본만 유지).

  // === 결과 조합 ===
  const enriched: PlaceResult[] = [];

  // place_seed_raw에서 장소명으로 데이터를 찾는 헬퍼
  const getSeedData = (placeName: string, dbMatch?: any): any | null => {
    const nameKey = placeName.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
    const seed = seedRawMap?.get(nameKey);
    if (seed) return seed;
    // dbMatch의 googlePlaceId로도 검색
    if (dbMatch?.googlePlaceId) {
      for (const [, s] of seedRawMap || new Map()) {
        if (s.googlePlaceId === dbMatch.googlePlaceId) return s;
      }
    }
    return null;
  };

  for (const { place, dbMatch } of matchResults) {
    // 🗑️ 2026-07-05 삭제 = nameLower 죽은변수 + needsGoogle 구조분해(본문 미사용, 분기는 dbMatch 유무로 통일) §0/§19
    if (dbMatch) {
      // dbMatch = seedDirectMatch(place_seed_raw 행). DB Direct path = dbMatch === place(PlaceResult shape) = 별도 처리
      matched++;
      const isDbDirect = place.sourceType === "DB Direct (Place Seed Raw)";
      const seed = dbMatch;
      // 🧠 2026-07-05 새철학 = 리뷰수 = place(Gemini/TS 새값) 우선, 없을 때만 seed 폴백 §14갱신/§19 (DB Direct 는 place 가 곧 검증행).
      const reviewCount = isDbDirect
        ? ((place as any).userRatingCount ?? 0)
        : ((place as any).userRatingCount || seed.googleReviewCount || 0);

      // 🧠 2026-07-05 새철학 = priceEur = place(Gemini 새값) 우선, 없을 때만 seed 폴백 §14갱신/§19 (옛 "seed 검증값 우선" 폐기).
      const estimatedPriceEur = isDbDirect
        ? (place.estimatedPriceEur != null ? Number(place.estimatedPriceEur) : undefined)
        : (place.estimatedPriceEur != null
            ? Number(place.estimatedPriceEur)
            : (seed.priceEur != null ? Number(seed.priceEur) : undefined));

      // 🧠 2026-07-05 새철학 = 모든 정보 무조건 새것(Gemini) 우선 + seed 빈칸 폴백 §14갱신/§19.
      //   = description/image/lat/lng/seedCategory/RC/price 전부 place(Gemini) 우선. DB Direct 는 seed 가 곧 검증행 = place 그대로.
      enriched.push({
        ...place,
        sourceType: isDbDirect ? place.sourceType : "Gemini AI + DB Enriched",
        description: isDbDirect
          ? (place.description ?? "")
          : ((place.description || seed.summaryKo || seed.editorialSummary) ?? ""),
        // 이미지 = place(Gemini/Google) 우선, 없으면 seed (= Google 1 > WK 2)
        image: isDbDirect
          ? place.image || ""
          : place.image || pickPlaceImage(seed) || "",
        userRatingCount: reviewCount,
        googleMapsUrl: place.googleMapsUrl,
        // 좌표 = Gemini 우선(있으면), 없을 때만 seed
        lat: isDbDirect
          ? place.lat
          : (place.lat && place.lat !== 0 ? place.lat : parseFloat(String(seed.latitude)) || place.lat),
        lng: isDbDirect
          ? place.lng
          : (place.lng && place.lng !== 0 ? place.lng : parseFloat(String(seed.longitude)) || place.lng),
        estimatedPriceEur,
        // ⚠️ 2026-07-06 사장님 SSOT = 매칭행 카테고리 = 식사슬롯이면 restaurant 강제(DB-only ag4:286 동형), 아니면 DB 발굴 검증값(seed.seedCategory) 우선 = 마커 정확.
        //   = Gemini seedCategory 는 편향(shopping/healing 쏠림, 6/7 불일치)이라 마커 부정확 근본 → 검증행 있으면 그 분류가 SSOT. 식당은 검증값이 attraction이어도 식당 마커 보존.
        //   = seedCategory 만 §14(Gemini 우선) 예외 = "id(발굴검증)에 분류" 원칙([[feedback_no_category_to_gemini_price]]). 신규(미매칭)만 Gemini값.
        seedCategory: (isDbDirect
          ? place.seedCategory
          : ((place as any).seedCategory === "restaurant"
              ? "restaurant"
              : (seed.seedCategory || (place as any).seedCategory))) as SeedCategory,
        selectionReasons: isDbDirect
          ? place.selectionReasons || []
          : [
              ...(place.selectionReasons || []),
              `📊 사용자 검증 SSOT (rank ${seed.rank ?? "-"}, 리뷰 ${reviewCount.toLocaleString()}개${estimatedPriceEur ? `, €${estimatedPriceEur}/인` : ""})`,
            ],
        // ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 도시무관 매칭 = 매칭행 표시필드(editorialSummary·summaryKo)를 enrichedPlace 에 실음.
        //   = 타도시 병합행은 슬롯빌드의 seedRawMap(도시한정)에 없어 못 읽음(stranded) → enrichedPlace 폴백으로 도시무관 노출(degrade 해소). place(Gemini) 우선, seed 폴백.
        editorialSummary: isDbDirect ? (place as any).editorialSummary : ((place as any).editorialSummary || seed.editorialSummary || null),
        summaryKo: isDbDirect ? (place as any).summaryKo : ((place as any).summaryKo || seed.summaryKo || null),
        confidenceLevel: "high" as const,
      } as any);
    } else {
      // 🗑️ 2026-07-05 삭제 = 죽은 googleResults.get 분기(영구 undefined) + 100% 동일했던 unmatched 2갈래 = 1벌로 합침 §0/§19.
      //   = 미매칭 = 원본 place 유지 + seed 이미지 폴백. 좌표/사진/PID = saveNewPlacesToDB TS 가 확보.
      const seedDataFallback = getSeedData(place.name);
      unmatchedCount++;
      const finalImg = (pickPlaceImage(seedDataFallback || {}) || place.image) ?? "";
      console.log(
        `[AG3-MATCH] ❌ Unmatched: "${place.name}" (Used seed image: ${finalImg ? "Yes" : "No"})`,
      );
      enriched.push({ ...place, sourceType: "Gemini AI (New)", image: finalImg });
    }
  }

  // === 4단계: 이미지 빈칸 방지 — 선정된 장소는 반드시 사진 있어야 함 ===
  // Instagram 깨진 URL 사전 필터: instagram.com/p/xxx 형식은 실제 이미지 아님
  for (let i = 0; i < enriched.length; i++) {
    const img = enriched[i].image || "";
    if (
      img &&
      img.includes("instagram.com/p/") &&
      !img.includes("cdninstagram") &&
      !img.includes("fbcdn.net")
    ) {
      enriched[i] = { ...enriched[i], image: "" };
    }
  }

  // ⚠️ 2026-05-31 = 사용자 SSOT = skipImageEnrich = Wikipedia 이미지 보강(동기 ~9초) skip = FE 우선
  // = 이미지 = saveNewPlacesToDB (background) 가 확보 + DB 저장 (= 다음 trip = DB hit)
  const needsPhoto = opts?.skipImageEnrich
    ? []
    : enriched.filter((p) => !p.image || p.image.trim() === "");
  if (needsPhoto.length > 0) {
    const _pt0 = Date.now();
    // Wikipedia REST API: 무료, 영구 URL — 유명 관광지 대부분 커버
    const fetchWikipediaImage = async (
      placeName: string,
    ): Promise<string | null> => {
      try {
        const normalized = placeName.normalize("NFC").replace(/ /g, "_");
        const encoded = encodeURIComponent(normalized);
        const langs = ["en", "ko"]; // 영어 먼저, 없으면 한국어 시도
        for (const lang of langs) {
          const res = (await Promise.race([
            fetch(
              `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
              {
                headers: {
                  "User-Agent": "NubiApp/1.0 (travel app; contact@nubi.app)",
                },
              },
            ),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 5000),
            ), // 타임아웃 5초로 증대
          ])) as any;
          if (res?.ok) {
            const data = await res.json();
            const url = data.thumbnail?.source || data.originalimage?.source;
            // Wikipedia 이미지 해상도 업그레이드: /320px- → /800px-
            const finalUrl = url ? url.replace(/\/\d+px-/, "/800px-") : null;
            if (finalUrl && isUsableImageUrl(finalUrl)) return finalUrl;
          }
        }
        return null;
      } catch {
        return null;
      }
    };

    // ⚠️ 수정금지(승인필요) 2026-05-15 = 이미지 fallback = Wikipedia 만 (= PD 폐기 SSOT §16)
    // = Wikipedia 만 (= TS saveNewPlacesToDB 가 이미지 확보 담당).
    const BATCH_SIZE = 5;
    for (let i = 0; i < needsPhoto.length; i += BATCH_SIZE) {
      const batch = needsPhoto.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (p) => {
          const wikiUrl = await fetchWikipediaImage(p.name);
          if (wikiUrl && isUsableImageUrl(wikiUrl)) {
            const idx = enriched.findIndex(
              (e) => e.name === p.name && e.lat === p.lat,
            );
            if (idx >= 0) enriched[idx] = { ...enriched[idx], image: wikiUrl };
          }
        }),
      );
    }
    const filled = enriched.filter((p) => p.image?.trim()).length;
    console.log(
      `[AG3] 📷 이미지 보강: ${needsPhoto.length}곳 시도 → ${filled}/${enriched.length}곳 확보 (${Date.now() - _pt0}ms)`,
    );
  }

  console.log(
    `[AG3] 최종: ${matched}곳 DB, ${unmatchedCount}곳 원본(→ saveNewPlacesToDB TS) (${Date.now() - _t0}ms)`,
  );
  return enriched;
}
