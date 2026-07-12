/**
 * AG3: Data Matcher & Scorer (데이터 매칭/확정)
 * 🔗 Agent Protocol v1.0: 번역기 역할
 *
 * 소요: 1~2초
 *
 * 역할:
 * 1. AG3-pre: findCityUnified로 도시 매칭 + DB 장소 사전 로드 (병렬)
 * 2. AG2 추천 장소명(영어) → DB 매칭 (aliases 포함)
 * 3. 매칭 성공 → DB 데이터(좌표, 사진, 리뷰, 점수, 가격) 삽입
 * 4. 매칭 실패 → Google Places API → gid 획득 → DB 저장 + 별칭 자동 학습
 * 5. 한국인 인기도, TripAdvisor, 포토스팟 점수 계산
 * 6. 동적 가중치 기반 최종 점수 산출
 * 7. 슬롯별 장소 확정 + 동선 최적화
 *
 * 핵심: AG3 이후 모든 장소는 googlePlaceId(gid)로 식별
 *
 * 의존: itinerary-generator.ts의 enrichment 함수들 사용
 */

import { db } from "../../db";
// 🗑️ 2026-07-05 삭제 = 미사용 import 정리내역 주석(celebrityPlaceEvidence·places·placeImages·addPlaceAlias) = 박제 §19
import { placeSeedRaw } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm"; // eq = seed SELECT where / sql = raw 좌표·rank 쿼리 / inArray = ②-b 매칭행 PID 배치판정
import type {
  AG3PreOutput,
  PlaceResult,
  ScheduleSlot,
  SeedCategory,
} from "./types";
import { findCityUnified } from "../city-resolver";
// ⚠️ 수정금지(승인필요) §18·§20 = TS 호출 단일 관문(tsSearch) = raw 2곳 자동저장 + 9요소·SKU 자체강제
//   (tsPhoto import 삭제 = 2026-07-11 사진 분리 수술 §19 = 생성 중 PM 0, 이미지 = fill/image-backfill 전담)
import { tsSearch } from "../shared/ts-client";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from "../shared/place-image";
// ⚠️ 수정금지(승인필요) §16 = 동일장소 7단계 매칭 = 공용 matcher.ts 단일 (= URI veto)
// ⚠️ 2026-07-09 = 후보 사전인덱스(pre-bucket) = 도시무관 전체PSR 매칭 4.3초→0.1초 (§16 matcher SSOT).
import { matchCandidate, buildCandidateIndex, candidatesFor } from "../shared/matcher";
// ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = TS raw 모음 1파일(#45 방식) 저장 = 도시id 폴더 로컬+Storage 2곳(§18).
import { saveCollectedRaw } from "../shared/save-collected-raw";

/** <img>로 사용 가능한 URL인지 (인스타 post URL, 네이버/티스토리 등 차단 도메인 제외) */
function isUsableImageUrl(url: string): boolean {
  const u = url.toLowerCase().trim();
  if (!u) return false;
  if (u.includes("example.com")) return false;
  // 🚫 전멸 확인된 소스 차단 (0013 DB 정리와 동일)
  // ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 SSOT 통합 = Google CDN URL 허용
  // = 메인앱이 직접 로드 (Google Cloud Console HTTP referrer 제한 = 우리 도메인 만)
  // = Storage 다운로드/업로드 우회 = Cached Egress 0
  if (
    u.includes("fbcdn.net") ||
    u.includes("cdninstagram") ||
    u.includes("cdn.fbsbx.com")
  )
    return false;
  // 🚫 모바일 앱에서 Referer 체크로 렌더링 차단되는 도메인 제외
  if (
    u.includes("naver.com") ||
    u.includes("tistory.com") ||
    u.includes("daum.net")
  )
    return false;
  // instagram.com/p/xxx 또는 /reel/xxx (HTML) — /media/?size= 는 리다이렉트로 이미지 가능
  if (
    (u.includes("instagram.com/p/") || u.includes("instagram.com/reel/")) &&
    !u.includes("/media/")
  )
    return false;
  // ✅ 영구 유효 소스
  if (u.includes("wikimedia.org") || u.includes("wikipedia.org")) return true;
  if (u.includes("i.ytimg.com") || u.includes("unsplash.com")) return true;
  return true; // 기타는 시도
}

// 🗑️ 2026-07-05 삭제 = getGoogleMapsApiKey() = 호출 0곳 데드코드 §0/§19. 이미지 폴백은 pickPlaceImage 단일 SSOT 담당.

/**
 * ⚠️ 2026-07-07 사장님 SSOT = place_seed_raw 도시 전체를 seedRawMap 으로 로드(§16 단일 SSOT).
 *   = preloadCityData(최초 1회) + saveNewPlacesToDB 1차저장 후 재조회(신규 반영) 공통 사용.
 *   = 슬롯을 저장된 PSR 에서 구성(DB-only 동형)하려면 1차저장 후 이 함수로 재조회해 신규 23곳 포함된 최신 맵 확보.
 */
export async function loadSeedRawMap(cityId: number): Promise<Map<string, any>> {
  const seedRawMap = new Map<string, any>();
  if (!db) return seedRawMap;
  const seeds = await db
    .select({
      id: placeSeedRaw.id,
      nameEn: placeSeedRaw.nameEn,
      nameKo: placeSeedRaw.nameKo,
      nameLocal: placeSeedRaw.nameLocal,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      googleMapsUri: placeSeedRaw.googleMapsUri,
      imageUrl: placeSeedRaw.imageUrl,
      address: placeSeedRaw.address,
      latitude: placeSeedRaw.latitude,
      longitude: placeSeedRaw.longitude,
      googleReviewCount: placeSeedRaw.googleReviewCount,
      googlePrimaryType: placeSeedRaw.googlePrimaryType,
      editorialSummary: placeSeedRaw.editorialSummary,
      summaryKo: placeSeedRaw.summaryKo,
      dayZone: placeSeedRaw.dayZone,
      distanceKmFromCenter: placeSeedRaw.distanceKmFromCenter,
      imageAttribution: placeSeedRaw.imageAttribution,
      priceEur: placeSeedRaw.priceEur,
      rank: placeSeedRaw.rank,
      seedCategory: placeSeedRaw.seedCategory,
    })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, cityId));
  for (const s of seeds) {
    // ⚠️ 수정금지(승인필요) 2026-05-09 = 이름 매칭 보강 = 정규화 + 악센트 제거 (좌표 X, 이름+address ✓)
    const norm = (name: string | null) =>
      name ? name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
    const noAccent = (name: string | null) =>
      name ? name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
    const keyEn = norm(s.nameEn);
    const keyKo = norm(s.nameKo);
    const keyLocal = norm((s as any).nameLocal);
    const keyEnNoAcc = noAccent(s.nameEn);
    const keyLocalNoAcc = noAccent((s as any).nameLocal);
    if (keyEn) seedRawMap.set(keyEn, s);
    if (keyKo) seedRawMap.set(keyKo, s);
    if (keyLocal && !seedRawMap.has(keyLocal)) seedRawMap.set(keyLocal, s);
    if (keyEnNoAcc && !seedRawMap.has(keyEnNoAcc)) seedRawMap.set(keyEnNoAcc, s);
    if (keyLocalNoAcc && !seedRawMap.has(keyLocalNoAcc)) seedRawMap.set(keyLocalNoAcc, s);
    if (s.googlePlaceId) seedRawMap.set(`pid:${s.googlePlaceId}`, s);
    if (s.googleMapsUri) seedRawMap.set(`uri:${s.googleMapsUri}`, s);
    if (s.address) seedRawMap.set(`addr:${s.address.toLowerCase().replace(/\s+/g, " ").trim()}`, s);
  }
  return seedRawMap;
}

/**
 * AG3-pre: 도시 DB 데이터 사전 로드
 * 🔗 Agent Protocol v1.0: findCityUnified로 도시 매칭 (영어/한국어/별칭 모두 OK)
 * AG2(Gemini)와 병렬 실행하여 대기시간 활용
 */
export async function preloadCityData(
  destination: string,
  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 도시중심좌표(불변키) 전달 = findCityUnified 좌표10m 매칭 최우선(중복도시·재발굴 차단).
  destinationCoords?: { lat: number; lng: number } | null,
): Promise<AG3PreOutput> {
  const _t0 = Date.now();

  if (!db) {
    console.log("[AG3-pre] DB 미연결");
    return { cityId: null, cityName: destination, seedRawMap: new Map() };
  }

  try {
    // 1. 🔗 통합 도시 검색 = 좌표(불변키) 10m 최우선 → 이름 유사어 순 (findCityUnified 단일 SSOT §16)
    const cityResult = await findCityUnified(destination, destinationCoords);
    const cityId: number | null = cityResult?.cityId || null;
    // 🗑️ 2026-07-07 = seed SELECT+맵구성 = loadSeedRawMap 단일 SSOT 추출(§16/§19) = preload·1차저장후 재조회 공용.
    let seedRawMap = new Map<string, any>();
    if (cityId) {
      console.log(`[AG3-pre] ✅ 도시 (ID: ${cityId}) 매칭 = place_seed_raw 단일 SSOT`);
      try {
        const _t1 = Date.now();
        seedRawMap = await loadSeedRawMap(cityId);
        console.log(`[AG3-pre] 🏭 통합 전시매장(place_seed_raw) ${seedRawMap.size}키 사전 로드 (${Date.now() - _t1}ms)`);
      } catch (e) {
        console.warn(`[AG3-pre] seedData 로드 실패:`, (e as Error)?.message);
      }
    } else {
      console.log(`[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`);
    }

    // 도시 중심 좌표 (숙소 미입력 시 출발 기점으로 사용)
    const cityCoords =
      cityResult?.latitude && cityResult?.longitude
        ? { lat: cityResult.latitude, lng: cityResult.longitude }
        : undefined;
    if (cityCoords) {
      console.log(
        `[AG3-pre] 📍 도시 중심 좌표: ${cityCoords.lat.toFixed(4)}, ${cityCoords.lng.toFixed(4)}`,
      );
    }

    return {
      cityId,
      cityName: cityResult?.nameEn || destination,
      cityCoords,
      seedRawMap,
    };
  } catch (error) {
    console.error("[AG3-pre] DB 사전 로드 실패:", error);
    return { cityId: null, cityName: destination, seedRawMap: new Map() };
  }
}

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

/**
 * AG3: 미등록 장소 DB 자동 저장 (백그라운드)
 * Gemini AI (New) + Gemini AI + Google Places 모두 저장 대상
 */
export async function saveNewPlacesToDB(
  newPlaces: PlaceResult[],
  cityId: number | null,
  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = deferPersist=true 시 = fetch(TS) await 완료 후 = DB write(upsertPlace)만 곳별 즉시 X, 함수 끝에서 한꺼번에 await. (PM 제거 = 2026-07-11 사진 분리 수술 §19)
  // = 첫 trip 이미지 FE 노출 최우선 / DB write 는 뒤로 미루되 함수 반환 전 await Promise.allSettled 로 완료(증발 0, 대안2 2026-07-09). false(기본)=fetch+write 모두 곳별 즉시 await.
  opts?: { deferPersist?: boolean },
): Promise<void> {
  if (!db || !cityId) {
    console.log(
      `[AG3-SAVE] skip cityId=${cityId} db=${!!db} count=${newPlaces.length}`,
    );
    return;
  }

  // 디버그: sourceType 분포
  const srcTypes: Record<string, number> = {};
  for (const p of newPlaces)
    srcTypes[p.sourceType || "undef"] =
      (srcTypes[p.sourceType || "undef"] || 0) + 1;
  console.log(
    `[AG3-SAVE] cityId=${cityId} count=${newPlaces.length} sourceTypes=${JSON.stringify(srcTypes)}`,
  );

  // 🧠 2026-07-05 새철학 = 매칭 여부 무관 Gemini 전체를 저장 대상에 포함 = 무조건 새덮기(버리지마=유료정보) §14갱신/§19.
  //   = 완전매칭행 skip·isBareMatch 조건·ENRICH_BARE_MATCHES 롤백플래그 방식 폐기 = 2026-07-05 §19.
  //   = 단 "DB Direct(AG2-DB place_seed_raw 직행)"는 이미 저장된 우리 검증행 = 제외(재저장 불필요).
  //   = 매칭된 행도 upsertPlace 7단계로 같은 행에 새값 COALESCE = 중복 INSERT 없음(§14).
  const toSave = newPlaces.filter(
    (p) => p.sourceType !== "DB Direct (Place Seed Raw)",
  );
  if (toSave.length === 0) {
    console.log(`[AG3-SAVE] toSave=0 (= 모두 DB Direct = 이미 저장됨)`);
    return;
  }

  console.log(
    `[AG3-SAVE] toSave=${toSave.length} 행 = 즉시 await searchText + INSERT 시작 (사진 = 사후 일괄 2026-07-11)`,
  );

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 도시 좌표 사전 조회 (= tsSearch 좌표앵커 latitude/longitude 용)
  // ⚠️ 2026-06-24 §19 = cityName 지역변수 삭제(옛 inline searchText 의 textQuery 도시명 fallback 전용 = 외과교체로 불필요)
  let cityLat = 0,
    cityLng = 0;
  try {
    const cityRow = await db!.execute(
      sql`SELECT latitude, longitude FROM cities WHERE id = ${cityId} LIMIT 1`,
    );
    const c = (cityRow as any).rows?.[0];
    if (c) {
      cityLat = parseFloat(c.latitude) || 0;
      cityLng = parseFloat(c.longitude) || 0;
    }
  } catch (e) {
    console.warn(`[AG3-SAVE] 도시 좌표 조회 실패`, (e as Error).message);
  }

  // ⚠️ 수정금지(승인필요) = tsSearch 호출 인자로 넘기는 env 직독 (= 출입증 GAP2 안 건드림 = 그대로 유지)
  const GOOGLE_KEY =
    process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
  // SUPA_ANON·SUPA_PUB 상수 삭제 = tsPhoto 제거 후 사용처 0 = 2026-07-11 사진 분리 수술 §19

  // ⚠️ 수정금지(승인필요) §18·§20 = TS 호출은 단일 관문 tsSearch()(shared/ts-client) 경유 (= raw 2곳 자동저장, 9요소·SKU 헬퍼 자체강제)

  // ⚠️ 수정금지(승인필요) 2026-05-09 = Promise.all 병렬화 (= simplify HIGH 권장)
  // = 순차 14~21 초 → 병렬 ~3.5 초 (= 4~6 배 단축)
  // = Google API rate limit (= 분당 600) = 4~6 호출 = 충분 여유

  // 🗑️ 2026-07-07 개정헌법(사장님) = rank(랭킹) 사전계산 블록 완전삭제 §19. 코드는 랭킹 한 자도 안 넣음 = 받은 응답만 저장 = 랭킹은 이후 DB autorank 트리거(RC순)가 알아서.
  const today = new Date().toISOString().slice(0, 10);

  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 순서 = ① Gemini 전체 upsert → ② TS 대상 = 신규(inserted) + PID 없는 매칭행(updated) → ③ TS → 저장. (PM = 사후 일괄 2026-07-11)
  //   = Gemini가 채운 슬롯 전부 검증 보장(옛 "신규만" = 흡수건 검증누락 = 폐기 2026-07-08 §19). PID 보유 매칭행만 skip = 재과금 원천차단(니스 €17 사고 코드원인 해소) 유지.
  const { upsertPlace, loadMatchCandidates } = await import("../place-upsert");

  // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 매칭 후보 명단 = 배치 시작 때 1회만 읽고 전 곳 재사용.
  //   = 옛 "upsertPlace 가 곳마다 전행 재SELECT(1회 3.0초 실측 = 24곳 ~17초)" = 매칭·저장 지연 근본 = 폐기 2026-07-10 §19.
  //   = 신규 INSERT 는 아래 루프에서 명단에 즉시 추가 = 같은 배치 안 중복 인지(옛 매회 재조회와 동일 결과) 보존.
  const batchCands = await loadMatchCandidates();

  // ── ① Gemini 전체 upsert(TS/PM 0회) = 셀렉없이 전체 새덮어쓰기. 매칭행=UPDATE / 진짜 신규=INSERT ──
  //   = job 은 Gemini/매칭행(seedDirectMatch 주입) 값만 = 받은 응답 그대로 저장.
  //   🗑️ 2026-07-07 개정헌법(사장님) = 랭킹(rank) 코드 한 자도 안 넣음 §19. 받은 응답만 저장하면 알아서 컬럼에 들어가고, 랭킹은 이후 DB autorank 트리거(RC순)가 함.
  const stage1: Array<{ place: any; seedCategory: string; action: string; rowId: number | null; error?: string }> = [];
  for (let i = 0; i < toSave.length; i++) {
    const place = toSave[i];
    const seedCategory: string = (place as any).seedCategory
      || (place.tags?.includes("restaurant") || place.tags?.includes("food") ? "restaurant" : "attraction");
    const slotCat: string | null = (place as any).slotCategory ?? null; // 취향 슬롯 카테고리(파이프라인 2a 화이트리스트 통과분)
    // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = Gemini 좌표는 job 에 그대로 실어 매칭(좌표10m 재식별)에는 쓰되,
    //   쓰기 보호는 관문 플래그(preserveExistingCoords)가 담당(§16 1벌 = ag3 매칭·관문 자체매칭·트리거흡수 세 문 모두 동일 보호).
    //   = 옛 "job 좌표 제거 게이트" = 폐기 2026-07-11 §19(좌표로만 재식별되는 레거시 행의 매칭을 부숨 = 리뷰 적발).
    const gLat = (place as any).lat && (place as any).lat !== 0 ? (place as any).lat : null;
    const gLng = (place as any).lng && (place as any).lng !== 0 ? (place as any).lng : null;
    const job = {
      cityId,
      seedCategory,
      nameEn: (place as any).__seedDirectMatch?.nameEn || place.name,
      nameKo: (place as any).nameKo ?? null,
      nameLocal: (place as any).nameLocal ?? null,
      address: (place as any).geminiAddress ?? null,
      latitude: gLat,
      longitude: gLng,
      imageUrl: place.image || null,
      googlePlaceId: (place as any).googlePlaceId ?? null,
      shortformKo: place.description ?? null,                                  // → editorial_summary
      selectionReasonKo: place.personaFitReason ?? place.description ?? null,  // → summary_ko
      priceEur: (place as any).estimatedPriceEur || 0,
      // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 취향 슬롯 카테고리(slotCategory)도 태그로 축적(UNION §14) = 장소 다면성(앙부아즈=heritage+hotspot).
      categoryTags: slotCat && slotCat !== seedCategory ? [seedCategory, slotCat] : [seedCategory],
      phaseTags: [`auto-learn-${today}`],
      distanceKmFromCenter: (place as any).distanceKmFromCenter ?? null,
      // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = ① Gemini 쓰기 = 좌표 보호 플래그 = 행에 검증좌표 있으면 유지(빈칸·0만 채움).
      //   = Gemini 환각좌표(식당에 정원좌표, 투르 78796 실증)가 행에 박혀 다음 판 좌표10m이 딴 장소를 흡수하던 오염 연쇄 차단.
      preserveExistingCoords: true,
    };
    try {
      // 명단 갱신(신규 추가·병합 반영)은 관문(upsertPlace syncCandidateList)이 소유 = 호출자는 넘기기만(§16).
      const r = await upsertPlace({ ...job, candidates: batchCands } as any);
      stage1.push({ place, seedCategory, action: r.action, rowId: r.rowId });
    } catch (e) {
      console.error(`[AG3-SAVE] ❌ "${place.name}" Gemini upsert 실패:`, (e as Error).message);
      stage1.push({ place, seedCategory, action: "skipped", rowId: null, error: (e as Error).message });
    }
  }
  const g1 = stage1.reduce((a, r: any) => { a[r.action] = (a[r.action] || 0) + 1; return a; }, {} as Record<string, number>);
  console.log(`[AG3-SAVE] ① Gemini 전체 upsert = ins=${g1.inserted || 0} upd=${g1.updated || 0} skip=${g1.skipped || 0} (${stage1.length}행)`);

  // ── ② TS 대상 추출 = 신규(inserted) + PID 결손 매칭행(updated) ──
  //   🧠 2026-07-08 사장님 SSOT = Gemini가 채운 슬롯 전부 검증 보장. 옛 "inserted만" = 형제 좌표흡수(updated)된 멀쩡한 곳이 TS 누락(안도라 사고) = 완전삭제 §19.
  //   ⚠️ 수정금지(승인필요) 2026-07-12 사장님 SSOT(3회 강조) = 흡수행 결손 판정 = **PID 없음만**. 이미지 결손 조건 완전삭제 §19.
  //     = 옛 "PID 또는 이미지(place-images) 결손"(2026-07-09) 폐기 = 2026-07-12: 사진 분리 수술로 생성 중 이미지 항상 없음 → 흡수행 전부 "이미지 결손"으로 오판 →
  //       완비 흡수행도 매판 TS 재호출(랭스 실증: 흡수16곳 전부 TS = 재과금+속도 안 빨라진 근본). 이미지는 fill/image-backfill(사후 일괄) 전담 = TS 대상 판정과 무관.
  const newRows = stage1.filter((r: any) => r.action === "inserted" && r.rowId != null);
  const updatedRows = stage1.filter((r: any) => r.action === "updated" && r.rowId != null);
  let absorbedRows: typeof updatedRows = [];
  if (updatedRows.length > 0 && db) {
    const ids = [...new Set(updatedRows.map((r: any) => r.rowId))];
    const chk = await db.select({ id: placeSeedRaw.id, googlePlaceId: placeSeedRaw.googlePlaceId })
      .from(placeSeedRaw).where(inArray(placeSeedRaw.id, ids as number[]));
    const missById = new Map(chk.map((r: any) => [r.id, !r.googlePlaceId])); // 결손 = PID 없음만(이미지 무관)
    absorbedRows = updatedRows.filter((r: any) => missById.get(r.rowId));
  }
  // mode = raw 산출물(tsResults, §18) 에 실리는 신규/흡수 구분 라벨 전용(사장님 눈검수용). 처리 로직은 신규·흡수 동일(자기 rowId 직행) = 분기 안 함.
  const tsTargets = [
    ...newRows.map((r: any) => ({ ...r, mode: "new" as const })),
    ...absorbedRows.map((r: any) => ({ ...r, mode: "absorbed" as const })),
  ];
  console.log(`[AG3-SAVE] ② TS 대상 = 신규 ${newRows.length} + 흡수(PID 결손) ${absorbedRows.length} = ${tsTargets.length}곳 (PID 완비 매칭행 ${updatedRows.length - absorbedRows.length}곳 = 유료호출 0, 이미지 = 사후 일괄)`);

  // ── ③ 대상(신규+흡수) 전부 TS = 자기 rowId 직행 UPDATE(신규·흡수 통일). ──
  //   = ①에서 이미 Gemini 요소로 id 확정(흡수는 트리거가 원행 id 로 UPDATE) → ③은 그 확정 id 칸의 결손(TS 9요소)만 targetRowId 직행으로 채움(§14 재매칭 실패 불가, 재매칭·중복재판별 안 함 = 사장님 SSOT).
  // ⚠️ 수정금지(승인필요) 2026-07-06 사장님 SSOT = TS raw 모음 1파일(#45 repair.ts:167 방식) = 건건 로컬skip + 끝에 06형태 results 배열 1파일(§18).
  const tsResults: any[] = [];
  const job2Promises: Promise<void>[] = [];                     // defer 모드 rowId 직행 UPDATE = 함수 끝에서 await Promise.allSettled 로 응답 전 완료(증발 0)
  const results = await Promise.all(
    tsTargets.map(async ({ place, seedCategory, rowId, mode }: any) => {
      try {
        // ⚠️ 2026-06-24 §18·§20 = 단일 관문 tsSearch (= raw 2곳 자동저장). Gemini 좌표 있으면 10m 앵커, 없으면 도시중심 폴백.
        const gLat = (place as any).lat && (place as any).lat !== 0 ? (place as any).lat : (cityLat || undefined);
        const gLng = (place as any).lng && (place as any).lng !== 0 ? (place as any).lng : (cityLng || undefined);
        const hasGeminiCoord = (place as any).lat && (place as any).lat !== 0;
        const tsArr = await tsSearch({
          apiKey: GOOGLE_KEY,
          method: "searchText",
          cityId,
          // 🧠 §20 = TS 힌트 = 로컬명(Gemini nameLocal)+주소+좌표앵커. name_local 없을 때만 name_en 폴백(빈 textQuery 방지).
          nameLocal: (place as any).nameLocal || place.name,
          address: (place as any).geminiAddress || undefined,
          latitude: gLat,
          longitude: gLng,
          // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 좌표 앵커 무조건 10m(repair.ts:36 ANCHOR_M 동일).
          anchorRadiusM: hasGeminiCoord ? 10 : undefined,
          rawTag: `ag3-${place.name}`,
          // ⚠️ 2026-07-06 §18 = 건건 raw 로컬 skip(Storage 건건은 관문이 보존) = 아래 tsResults 모음 1파일이 로컬 조회용(repair.ts:183 동일).
          localSkipRaw: true,
        });
        const result = tsArr?.[0];

        // 🧠 2026-07-06 = 06형태 모음 수집(#45 repair.ts:186-196) = 정제 9요소 + photo_name 1개(photos[0]). 원본 photos 통째 X.
        tsResults.push({
          id: rowId, name: place.name, category: seedCategory, mode, our_pid: (place as any).googlePlaceId ?? null,
          status: result ? "ok" : "no_match",
          ts: result ? {
            place_id: result.googlePlaceId, display_name_en: result.nameEn, address: result.address,
            lat: result.latitude, lng: result.longitude, review_count: result.googleReviewCount,
            price_eur: result.priceEur, photo_name: result.photoName, google_maps_uri: result.googleMapsUri,
            business_status: result.businessStatus,
          } : null,
        });

        // 🧠 2026-07-08 사장님 SSOT = 폐업 = 슬롯·행 유지 + TS 요소 전체 입력(§20) + PM(이미지)만 스킵 + phase_tags '영구폐업' 기록.
        //   (옛 "__closedPermanently 마커 + return 반쪽방치 + FE 슬롯 제거" = 슬롯 삭제 무권한 = 완전삭제 §19)
        const isClosedPermanently = result?.businessStatus === "CLOSED_PERMANENTLY";
        if (isClosedPermanently) console.log(`[AG3-SAVE] 🚫 "${place.name}" = 영구 폐업(TS) = 행·슬롯 유지, PM만 스킵`);
        if (!result) return { enrichedByApi: 0 };  // TS 미검색 = ① Gemini 저장분 유지

        const lat = (result.latitude && result.latitude !== 0) ? result.latitude : ((place as any).lat || null);
        const lng = (result.longitude && result.longitude !== 0) ? result.longitude : ((place as any).lng || null);
        const placeId: string | null = result.googlePlaceId || (place as any).googlePlaceId || null;

        // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 사진 분리 수술 = 생성 중 PM(사진 다운로드)+Storage 업로드 = 완전 제거.
        //   옛 "곳당 TS→PM await(대안2 2026-07-09)" 폐기 = 2026-07-11 §19. 이미지 = fill/image-backfill(사후 일괄 = 무료 재링크→raw photoName 재활용→PM) 전담.
        //   photoName 은 아래 tsResults raw 모음(§18 2곳 저장)에 남음 = 사후 PM 시 TS 재호출 0. FE = 아이콘+'구글맵 정보' 폴백(TripPlannerScreen).

        // ④ FE 배선 = place 객체 직접 갱신(신규·흡수건 공통) = TS 검증 좌표·PID·주소·RC 즉시 반영(이미지 제외 = 사후 일괄).
        if (lat && lng) { place.lat = lat; place.lng = lng; }
        if (placeId) (place as any).googlePlaceId = placeId;
        (place as any).geminiAddress = result.address || (place as any).geminiAddress;
        if (result.googleReviewCount != null) place.userRatingCount = result.googleReviewCount;
        console.log(
          `[AG3-SAVE] 📡 ${mode === "absorbed" ? "흡수" : "신규"} "${place.name}" → (${lat}, ${lng}) pid=${placeId ? "TS" : "NONE"} img=사후일괄`,
        );

        // ③-b 저장 = TS 검증값 전체(Gemini+TS = §20 깔대기) = 신규·흡수 공통 자기 rowId 직행 UPDATE(targetRowId, §14 재매칭 실패 불가). COALESCE 새우선.
        const newPriceEur = (result.priceEur || 0) > 0 ? result.priceEur : ((place as any).estimatedPriceEur || 0);
        const jobBase = {
          cityId,
          seedCategory,
          nameEn: result.nameEn || place.name,
          nameKo: (place as any).nameKo ?? null,
          nameLocal: (place as any).nameLocal ?? null,
          address: result.address ?? (place as any).geminiAddress ?? null,
          // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = DB 좌표 = TS 검증값만. TS 무좌표 시 null = 행 좌표 유지(COALESCE).
          //   = 옛 "Gemini 좌표 폴백을 DB에 기록" = 폐기 2026-07-11 §19(환각좌표가 targetRowId 직행으로 검증행 오염 = 리뷰 적발). Gemini 폴백(lat/lng)은 FE 표시 전용.
          latitude: (result.latitude && result.latitude !== 0) ? result.latitude : null,
          longitude: (result.longitude && result.longitude !== 0) ? result.longitude : null,
          // imageUrl 미포함 = §14 부분갱신(안 온 컬럼 = 뼈대 유지) = 매칭행 기존 이미지 보존 + 신규행 null(아이콘) = 사후 일괄이 채움 (2026-07-11 사진 분리 수술)
          googlePlaceId: placeId,
          googleMapsUri: result.googleMapsUri ?? null,
          shortformKo: place.description ?? null,
          selectionReasonKo: place.personaFitReason ?? place.description ?? null,
          googleReviewCount: result.googleReviewCount ?? 0,
          priceEur: newPriceEur,
          categoryTags: [seedCategory],
          // 폐업 = TS 응답 사실을 phase_tags 로 보존(응답요소 안 버림 §18/§20)
          phaseTags: isClosedPermanently ? [`auto-learn-${today}`, "영구폐업"] : [`auto-learn-${today}`],
          distanceKmFromCenter: (place as any).distanceKmFromCenter ?? null,
        };
        // ⚠️ 수정금지(승인필요) 2026-07-09 사장님 SSOT = 신규·흡수 통일 = 전부 자기 rowId 직행(targetRowId=rowId) = 재매칭·중복재판별 절대 안 함.
        //   사장님 SSOT(line 453·459): "신규든 병합이든 모든행 우리 id 상태에서 결손을 보강하여 해당 id 칸을 채움. 모든 TS+PM 요소는 어디로 갈지 아는 상태." (PM = 사후 일괄로 이동 2026-07-11)
        //   = ① Gemini upsert 단계에서 트리거가 이미 중복(흡수)을 판별해 그 원행 id 로 UPDATE 완료 → ① 이후 모든 행은 각자 확정된 id 보유. ②는 그 id 에 결손(TS 9요소)만 직행으로 채움.
        //   = dupOwner 재조회 폐기 2026-07-09 §19: 중복판별은 ① 트리거가 이미 함 → ②에서 또 dupOwner SELECT = 트리거 재발명(§16 위반) + 사장님 "②는 재매칭 아님" 정면위반.
        //     트리거 라이브면 같은 강매칭키 2행은 ①에서 애초에 못 생김 → ① 통과행은 정의상 dupOwner 없음 = 재조회는 항상 null = 죽은 코드였음.
        const job2 = { targetRowId: rowId, ...jobBase }; // 전부 자기 id 직행(§14 재매칭 실패 불가)
        const doUpdate = async () => {
          try { await upsertPlace(job2 as any); }
          catch (e) { console.log(`[AG3-SAVE] ⚠️ "${place.name}" 직행 실패(${(e as Error).message}) = 그 행 스킵`); }
        };
        // deferPersist = 재UPDATE(DB write)를 곳별로 즉시 await 하지 않고 job2Promises 에 모아 함수 끝에서 한꺼번에 await(FE 는 위 place mutate 로 이미 노출, DB write 는 응답 전 완료 = 증발 0). 기본(false) = 곳별 즉시 await.
        if (opts?.deferPersist) job2Promises.push(doUpdate());
        else await doUpdate();

        return { enrichedByApi: 1 };
      } catch (e) {
        console.error(`[AG3-SAVE] ❌ 신규 "${place.name}" TS 실패:`, (e as Error).message);
        tsResults.push({ id: rowId, name: place.name, category: seedCategory, status: "error", error: (e as Error).message });
        return { enrichedByApi: 0, error: (e as Error).message };
      }
    }),
  );

  // 🗑️ 2026-07-09 = ③-c 흡수건 퍼널 재투입 완전삭제 §19 = 흡수건도 위에서 rowId 직행(재매칭 X) 통일 = 별도 재투입 불필요(사장님 SSOT).
  //   deferPersist 모드 = job2Promises(DB write) 완료 대기(FE 는 place mutate 로 이미 노출). 사진은 위 Promise.all 안에서 이미 await 완료(증발 0).
  if (opts?.deferPersist && job2Promises.length > 0) {
    await Promise.allSettled(job2Promises);
  }

  // 🧠 2026-07-06 사장님 SSOT = TS raw 06형태 모음 1파일(#45 repair.ts:259-271) = 도시id 폴더 로컬+Storage 2곳(§18).
  //   ⚠️ 2026-07-06 근본수정 = 옛 fire-and-forget(void..catch) = 배포서버(Replit)서 응답 후 PUT 완료전 잘림 = TS raw 미저장(비용증발 §18) 근본.
  //     → await 로 전환(§18 자산보장). 이 함수는 상위(pipeline-v3)서 이미 await 호출 = FE 노출은 TS fetch 완료로 이미 보장 = raw 저장(수백ms)은 그 뒤 미미.
  if (tsResults.length) {
    await saveCollectedRaw({
      cityId, stepNum: 6, stepName: "ts-pm-enrich", content: "candidates", hashKey: "results",
      body: {
        meta: { city_id: cityId, called_at: new Date().toISOString(), input_rows: tsTargets.length, photo: "대표 1장(photo_name=photos[0])" },
        results: tsResults,
      },
    }).catch((e) => console.warn('[AG3] TS raw 저장 실패:', (e as Error)?.message));
  }

  // 집계 = ① upsert(ins/upd/skip) + ③ TS 성공수(apiEnriched). 이미지 = 사후 일괄(fill/image-backfill) = 집계 없음.
  const totals = results.reduce(
    (acc, r: any) => ({
      enrichedByApi: acc.enrichedByApi + (r.enrichedByApi || 0),
      error: acc.error || r.error || "",
    }),
    { enrichedByApi: 0, error: "" },
  );
  console.log(
    `[AG3] 🆕 TS ${tsTargets.length}곳(신규 ${newRows.length}+흡수 ${absorbedRows.length}) = apiEnriched=${totals.enrichedByApi} error="${totals.error}" (PID 보유 매칭행 = 유료호출 0, 이미지 = 사후 일괄)`,
  );
}
