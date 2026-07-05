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
import { eq, sql } from "drizzle-orm"; // eq = seed SELECT where / sql = raw 좌표·rank 쿼리
import type {
  AG3PreOutput,
  PlaceResult,
  ScheduleSlot,
  SeedCategory,
} from "./types";
import { findCityUnified } from "../city-resolver";
// ⚠️ 수정금지(승인필요) §18·§20 = TS 호출 단일 관문(tsSearch·tsPhoto) = raw 2곳 자동저장 + 9요소·SKU 자체강제
import { tsSearch, tsPhoto } from "../shared/ts-client";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from "../shared/place-image";
// ⚠️ 수정금지(승인필요) §16 = 동일장소 7단계 매칭 = 공용 matcher.ts 단일 (= URI veto)
import { matchCandidate } from "../shared/matcher";

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
 * AG3-pre: 도시 DB 데이터 사전 로드
 * 🔗 Agent Protocol v1.0: findCityUnified로 도시 매칭 (영어/한국어/별칭 모두 OK)
 * AG2(Gemini)와 병렬 실행하여 대기시간 활용
 */
export async function preloadCityData(
  destination: string,
  // 🗑️ 2026-07-05 삭제 = geminiPlaces 인자 = 좌표평균 fallback 전용이었음(그 fallback 삭제) = 死파라미터 §0/§19
): Promise<AG3PreOutput> {
  const _t0 = Date.now();

  if (!db) {
    console.log("[AG3-pre] DB 미연결");
    return { cityId: null, cityName: destination, seedRawMap: new Map() };
  }

  try {
    // 1. 🔗 통합 도시 검색 (영어 "Paris" → 한국어 "파리" DB 모두 매칭)
    // 🗑️ 2026-07-05 삭제 = 도시 미발견시 전도시 좌표평균 최근접 fallback = findCityUnified 단일 SSOT §16/§19
    const cityResult = await findCityUnified(destination);
    const cityId: number | null = cityResult?.cityId || null;
    // 🗑️ 2026-07-05 삭제 = dbPlacesMap·placeImageMap·celebrityImageMap 빈맵 = §14가 places매칭 차단해 항상 빈맵 = 죽은뼈대 §0/§19
    const seedRawMap = new Map<string, any>();

    // 🗑️ 2026-07-05 삭제 = places/place_images/celebrity 3테이블 차단 인용 + dbPlaces 빈배열·cityLabel 죽은변수 = 박제 §19
    if (cityId) {
      console.log(`[AG3-pre] ✅ 도시 (ID: ${cityId}) 매칭 = place_seed_raw 단일 SSOT`);
    } else {
      console.log(
        `[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`,
      );
    }

    // 3. place_seed_raw = 단일 SSOT
    // 🧠 2026-07-05 새철학 = 후보풀 rank 1-20 제한 제거 = 완비행(rank 9000+, 유료자산)도 매칭 후보 포함 §14갱신
    if (cityId) {
      try {
        const _t1 = Date.now();
        const seeds = await db
          .select({
            id: placeSeedRaw.id,
            nameEn: placeSeedRaw.nameEn,
            nameKo: placeSeedRaw.nameKo,
            nameLocal: placeSeedRaw.nameLocal,
            googlePlaceId: placeSeedRaw.googlePlaceId,
            googleMapsUri: placeSeedRaw.googleMapsUri,
            imageUrl: placeSeedRaw.imageUrl, // ⚠️ 2026-06-11 = image_url(구글 PM) 1종
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
          // 🧠 2026-07-05 새철학 = rank 1-20 필터 제거 = city 전체 행이 매칭 후보 = 완비행(유료자산) 재활용 §14갱신/§19
          .where(eq(placeSeedRaw.cityId, cityId));
        for (const s of seeds) {
          // ⚠️ 수정금지(승인필요) 2026-05-09 = 이름 매칭 보강 = 정규화 + 악센트 제거 (= 사용자 SSOT = 좌표 X, 이름+address ✓)
          // = 정규화 키 = 공백/문장부호 제거 + 소문자
          // = 악센트 제거 키 = "Sacré-Cœur" ↔ "Sacre Coeur" 호환
          const norm = (name: string | null) =>
            name ? name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
          const noAccent = (name: string | null) =>
            name
              ? name
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "")
                  .toLowerCase()
                  .replace(/[\s\p{P}\p{S}]+/gu, "")
              : null;
          const keyEn = norm(s.nameEn);
          const keyKo = norm(s.nameKo);
          const keyLocal = norm((s as any).nameLocal);
          const keyEnNoAcc = noAccent(s.nameEn);
          const keyLocalNoAcc = noAccent((s as any).nameLocal);
          if (keyEn) seedRawMap.set(keyEn, s);
          if (keyKo) seedRawMap.set(keyKo, s);
          if (keyLocal && !seedRawMap.has(keyLocal))
            seedRawMap.set(keyLocal, s);
          if (keyEnNoAcc && !seedRawMap.has(keyEnNoAcc))
            seedRawMap.set(keyEnNoAcc, s);
          if (keyLocalNoAcc && !seedRawMap.has(keyLocalNoAcc))
            seedRawMap.set(keyLocalNoAcc, s);
          // ⚠️ 수정금지(승인필요) 사용자 의도 = google_place_id 기반 직접 매칭 키 추가
          if (s.googlePlaceId) seedRawMap.set(`pid:${s.googlePlaceId}`, s);
          // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT 5 단계 매칭 = google_maps_uri 추가 (= upsertPlace v2 §14 부합)
          if (s.googleMapsUri) seedRawMap.set(`uri:${s.googleMapsUri}`, s);
          // ⚠️ 수정금지(승인필요) 사용자 의도 = address 기반 매칭 키 추가 (= 식당 동명 충돌 회피)
          if (s.address) {
            const addrKey = `addr:${s.address.toLowerCase().replace(/\s+/g, " ").trim()}`;
            seedRawMap.set(addrKey, s);
          }
        }
        console.log(
          `[AG3-pre] 🏭 통합 전시매장(place_seed_raw) ${seeds.length}건 사전 로드 (${Date.now() - _t1}ms)`,
        );
      } catch (e) {
        console.warn(`[AG3-pre] seedData 로드 실패:`, (e as Error)?.message);
      }
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
  // = 이미지 = saveNewPlacesToDB (background = TS+PM) 가 DB 저장 = 다음 trip = DB hit
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

  // ⚠️ 2026-06-03 = 공용 matcher 후보 = seedRawMap 의 유니크 행(여러 키→같은 객체 참조) + cityId 주입(= 5순위 도시 강제)
  const _cid = (preloaded.cityId ?? -1) as number;
  const seedCands = Array.from(new Set(seedRawMap ? Array.from(seedRawMap.values()) : [])).map((r: any) => ({ ...r, cityId: _cid }));

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
    const seedDirectMatch: any =
      matchCandidate(
        {
          cityId: _cid,
          googlePlaceId: (place as any).geminiPlaceId || (place as any).googlePlaceId || null,
          googleMapsUri: (place as any).googleMapsUri || null,
          address: (place as any).geminiAddress || (place as any).address || null,
          // ⚠️ 수정금지(승인필요) 2026-07-05 사장님 SSOT = 좌표(10m 앵커)는 매칭에 반드시 넘김.
          //   = 이유: 도시가 아닌 오지·풀주소가 명확히 정립 안 된 곳에서 좌표 = 이름/주소가 안 맞아도 통하는 만국 통용 매칭키.
          //   = matcher 5순위 좌표(10m)는 name_local/PID/URI/주소 다 실패 시에만 도달 + URI veto 로 오병합 차단 = 안전. 임의 제거 금지.
          latitude: (place as any).lat != null ? parseFloat(String((place as any).lat)) : null,
          longitude: (place as any).lng != null ? parseFloat(String((place as any).lng)) : null,
          nameEn: place.name || null,
          nameLocal: (place as any).nameLocal || null,
          nameKo: (place as any).nameKo || null,
        },
        seedCands,
      ).match || null;
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
        // 카테고리 = Gemini seed_category(6종) 우선, 없을 때만 seed 폴백
        seedCategory: (isDbDirect
          ? place.seedCategory
          : ((place as any).seedCategory || seed.seedCategory)) as SeedCategory,
        selectionReasons: isDbDirect
          ? place.selectionReasons || []
          : [
              ...(place.selectionReasons || []),
              `📊 사용자 검증 SSOT (rank ${seed.rank ?? "-"}, 리뷰 ${reviewCount.toLocaleString()}개${estimatedPriceEur ? `, €${estimatedPriceEur}/인` : ""})`,
            ],
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
  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = deferPersist=true 시 = fetch(TS+PM+Storage) await 완료 후 = DB INSERT(upsertPlace) 만 background
  // = 첫 trip 이미지 FE 노출 최우선 / 백필(DB)은 background. false(기본)=fetch+INSERT 모두 inline. 롤백 = pipeline-v3 플래그 1줄
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
    `[AG3-SAVE] toSave=${toSave.length} 행 = 즉시 await searchText + PhotoMedia + Storage upload + INSERT 시작`,
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

  // ⚠️ 수정금지(승인필요) = tsSearch/tsPhoto 호출 인자로 넘기는 env 직독 (= 출입증 GAP2 안 건드림 = 그대로 유지)
  const GOOGLE_KEY =
    process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
  const SUPA_ANON = process.env.SUPABASE_ANON_KEY || "";
  const SUPA_PUB =
    process.env.SUPABASE_PUBLIC_URL ||
    "https://wxebceflvuythuodemro.supabase.co";

  // ⚠️ 수정금지(승인필요) §18·§20 = TS 호출·사진 업로드는 단일 관문 tsSearch()/tsPhoto()(shared/ts-client) 경유 (= raw 2곳 자동저장, 9요소·SKU 헬퍼 자체강제)

  // ⚠️ 수정금지(승인필요) 2026-05-09 = Promise.all 병렬화 (= simplify HIGH 권장)
  // = 순차 14~21 초 → 병렬 ~3.5 초 (= 4~6 배 단축)
  // = Google API rate limit (= 분당 600) = 4~6 호출 = 충분 여유
  // = race-safe rank = 카테고리별 base + 인덱스 (= MAX(rank) 사전 1 회)

  // 1. nextRank base 사전 계산 (= 카테고리별 1 회 = race condition 차단)
  // 🧠 2026-07-05 사장님 SSOT = 6종 카테고리 전부 rank base 계산(§20 = Gemini 6종 보존). 옛 "restaurant/attraction 2종"만 폐기(§19).
  // ⚠️ 2026-07-05 = review CONFIRMED 성능회귀 = 옛 for...of 순차 await(DB왕복 7회) → Promise.all 병렬(1왕복, §0 가벼움 정합)
  const CATS = ["restaurant", "attraction", "heritage", "healing", "hotspot", "adventure", "shopping"];
  const baseRankRows = await Promise.all(
    CATS.map((cat) =>
      // ⚠️ 2026-05-23 = phase_tags 'auto-learn%' 마커 기준 (= 자동 학습 결과)
      db!.execute(
        sql`SELECT COALESCE(MAX(rank), 8999) + 1 AS next_rank FROM place_seed_raw
            WHERE city_id = ${cityId} AND seed_category = ${cat}
            AND EXISTS (SELECT 1 FROM unnest(COALESCE(phase_tags, ARRAY[]::text[])) AS t WHERE t LIKE 'auto-learn%')`,
      ),
    ),
  );
  const baseRanks: Record<string, number> = {};
  CATS.forEach((cat, i) => {
    baseRanks[cat] = (baseRankRows[i] as any).rows?.[0]?.next_rank ?? 9000;
  });
  const today = new Date().toISOString().slice(0, 10);

  // 2. 병렬 처리 (= searchText + PhotoMedia + Storage + INSERT)
  const results = await Promise.all(
    toSave.map(async (place, i) => {
      try {
        // ⚠️ 2026-06-24 §18·§20 = 단일 관문 tsSearch (= raw 2곳 자동저장). 반환 = TsPlace[] = [0] 채택.
        // 🧠 2026-07-05 사장님 SSOT = Gemini 정확좌표를 TS 앵커 힌트로(§20). 옛 "도시중심(cityLat/cityLng) 단독" 폐기(§19)
        //   = 동명 다른도시 장소 오매칭(리모주→페르비냥 396km) 원천차단. Gemini 좌표 있으면 10km 앵커, 없으면 도시중심 폴백(repair.ts:181 정합).
        const gLat = (place as any).lat && (place as any).lat !== 0 ? (place as any).lat : (cityLat || undefined);
        const gLng = (place as any).lng && (place as any).lng !== 0 ? (place as any).lng : (cityLng || undefined);
        const hasGeminiCoord = (place as any).lat && (place as any).lat !== 0;
        const tsArr = await tsSearch({
          apiKey: GOOGLE_KEY,
          method: "searchText",
          cityId,
          // 🧠 2026-07-05 사장님 SSOT(§20) = TS 힌트 = 진짜 로컬명(Gemini nameLocal) 전달. 옛 place.name(name_en) 대체 폐기(§19 = 셀렉 제거).
          //   = name_local 없을 때만 name_en 폴백(빈 textQuery 방지). ts-client textQuery=[nameLocal,address] = 로컬명+주소+좌표앵커 3요소 다 넘김.
          nameLocal: (place as any).nameLocal || place.name,
          address: (place as any).geminiAddress || undefined,
          latitude: gLat,
          longitude: gLng,
          // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 좌표 앵커 무조건 10m(repair.ts:36 ANCHOR_M 동일 = 동명 다른장소 차단 기준 단일).
          //   = 2026-07-05 최초 반영 시 10000(10km)으로 오기(review 지적 CONFIRMED) → 10m 로 정정. §16 재발명 금지 = 값도 SSOT 그대로.
          anchorRadiusM: hasGeminiCoord ? 10 : undefined,
          rawTag: `ag3-${place.name}`,
        });
        const result = tsArr?.[0];

        // 🧠 2026-07-05 새철학 = Gemini 먼저 upsert = TS 실패해도 Gemini 유료값(좌표/name_local/주소/거리)으로 job 생성 §14갱신/§19.
        //   = TS 결과/좌표 없으면 return skip 방식(=Gemini 버림) 폐기 = 2026-07-05 §19. TS 성공 시 그 위에 검증값(PID·좌표·RC·priceRange) 덮음(새것 우선).
        // 🧠 2026-07-05 새철학 = 폐업 게이트도 TS 있을 때만 적용(TS 없으면 판단 불가 = Gemini 로 저장). PhotoMedia 는 TS photoName 있을 때만.
        if (result?.businessStatus === "CLOSED_PERMANENTLY") {
          (place as any).__closedPermanently = true;
          console.log(`[AG3-SAVE] 🚫 "${place.name}" = 영구 폐업(TS) = 백필·FE 제외`);
          return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0, closedPermanently: 1 };
        }

        // 좌표 = TS 검증값 우선, 없으면 Gemini(place.lat/lng). 둘 다 없으면 = 앵커 불가 = skip(진짜 저장할 게 없음).
        const lat = (result?.latitude && result.latitude !== 0) ? result.latitude
          : ((place as any).lat && (place as any).lat !== 0 ? (place as any).lat : null);
        const lng = (result?.longitude && result.longitude !== 0) ? result.longitude
          : ((place as any).lng && (place as any).lng !== 0 ? (place as any).lng : null);
        if (!lat || !lng)
          return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0 };

        // PID = TS 검증값 우선, 없으면 Gemini/매칭행(seedDirectMatch 주입값). null 가능(= URI/주소/좌표/이름 매칭에 위임).
        const placeId: string | null = result?.googlePlaceId || (place as any).googlePlaceId || null;

        // 🧠 2026-07-05 새철학 = Gemini seed_category(6종) 보존 = 없으면 식당태그→restaurant, 아니면 attraction 폴백.
        const seedCategory: string = (place as any).seedCategory
          || (place.tags?.includes("restaurant") || place.tags?.includes("food") ? "restaurant" : "attraction");

        // 이미지 = TS photoName 있을 때만 PM(구글 검증 이미지 새덮어쓰기), 없으면 Gemini/seed 이미지(place.image) 유지 = 유료값 안 버림.
        let imageUrl: string | null = null;
        const photoName = result?.photoName;
        if (photoName && placeId) {
          // ⚠️ §18·§20 = 단일 관문 tsPhoto (= PhotoMedia 다운 + Storage 업로드, maxWidthPx 800 = #45 정합)
          imageUrl = await tsPhoto({
            apiKey: GOOGLE_KEY,
            photoName,
            storageKey: SUPA_ANON,
            supaPublicUrl: SUPA_PUB,
            pathKey: `${cityId}/${seedCategory}/${placeId}`,
            maxWidthPx: 800,
          });
        }
        const finalImage = imageUrl || place.image || null;

        // ⚠️ place 객체 직접 갱신 (= 호출자 baseline 반영, race X = 각 호출 자기 place 만)
        place.lat = lat;
        place.lng = lng;
        place.image = finalImage || "";
        if (placeId) (place as any).googlePlaceId = placeId;
        (place as any).geminiAddress =
          result?.address || (place as any).geminiAddress;
        if (result?.googleReviewCount != null) place.userRatingCount = result.googleReviewCount;
        console.log(
          `[AG3-SAVE] 📡 "${place.name}" → (${lat}, ${lng}) pid=${placeId ? "TS/Gemini" : "NONE"} img=${imageUrl ? "Storage" : (place.image ? "Gemini" : "NULL")}`,
        );

        // 가격 = TS priceRange.endPrice(최신 검증) 우선, 없으면 Gemini = COALESCE 새 우선(최신최우선) §14.
        const tsPriceEur = result?.priceEur || 0;
        const geminiPriceEur = (place as any).estimatedPriceEur || 0;
        const newPriceEur = tsPriceEur > 0 ? tsPriceEur : geminiPriceEur;

        const nextRank = baseRanks[seedCategory] + i;
        // ⚠️ 수정금지(승인필요) §14 = upsertPlace() 통과 강제 = 7단계 매칭(PID>URI>풀주소>좌표10m>이름) + COALESCE 새 우선.
        //   = upsert 즉시 await X = job 수집만 (= 아래 runUpserts 가 deferPersist 에 따라 background/await).
        // 🧠 2026-07-05 새철학 = name_en = TS displayName(검증) 우선, 없으면 매칭행 nameEn, 없으면 place.name §14갱신.
        //   = name_local/name_ko 는 별도 컬럼 = 절대 교차대체 금지.
        const job = {
          cityId: cityId,
          seedCategory,
          rank: nextRank,
          nameEn: result?.nameEn || (place as any).__seedDirectMatch?.nameEn || place.name,
          nameKo: (place as any).nameKo ?? null,
          nameLocal: (place as any).nameLocal ?? null,
          address: result?.address ?? (place as any).geminiAddress ?? null,
          latitude: lat,
          longitude: lng,
          imageUrl: finalImage,
          googlePlaceId: placeId,
          googleMapsUri: result?.googleMapsUri ?? null,
          shortformKo: place.description ?? null, // → editorial_summary
          selectionReasonKo: place.personaFitReason ?? place.description ?? null, // → summary_ko
          googleReviewCount: result?.googleReviewCount ?? 0,
          priceEur: newPriceEur,
          categoryTags: [seedCategory],
          phaseTags: [`auto-learn-${today}`],
          // 🧠 2026-07-05 새철학 = Gemini 도심거리 저장(§20 전필드) = 결손컬럼 채움 = 동선재료 보존.
          distanceKmFromCenter: (place as any).distanceKmFromCenter ?? null,
        };

        return {
          saved: 1,
          skipped: 0,
          enrichedByApi: result ? 1 : 0,
          photoOk: imageUrl ? 1 : 0,
          job,
        };
      } catch (e) {
        // ⚠️ 2026-05-23 = silent fail 가시화 (= 사용자 SSOT = "5월 6일 백필 미작동" 진단 결과)
        console.error(
          `[AG3-SAVE] ❌ "${place.name}" 저장 실패:`,
          (e as Error).message,
        );
        return {
          saved: 0,
          skipped: 0,
          enrichedByApi: 0,
          photoOk: 0,
          error: (e as Error).message,
        };
      }
    }),
  );

  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = fetch(TS+PM+Storage) 완료 = place.image 세팅됨 (= FE 노출 준비 끝)
  // = DB INSERT 만 분리 = deferPersist 시 background(백필) / 기본 await(= 옛 동작 보존 = 롤백)
  // = upsertPlaces (= place-upsert.ts 배치 단일 진입점 = 순차 5단계 매칭 = 중복 방지 §14 + shared 재사용 §16)
  const { upsertPlaces } = await import("../place-upsert");
  const upsertJobs = results.map((r: any) => r.job).filter(Boolean);
  const runUpserts = async () => {
    const s = await upsertPlaces(upsertJobs);
    console.log(
      `[AG3-SAVE] 💾 DB INSERT 완료 = ins=${s.inserted} upd=${s.updated} skip=${s.skipped} (${upsertJobs.length}행)`,
    );
  };
  if (opts?.deferPersist) {
    // = FE 우선 = upsert background (await X). .catch = unhandled rejection 방어 (= upsertPlaces 자체는 per-row catch 라 throw X)
    runUpserts().catch((e) =>
      console.error("[AG3-SAVE] ⚠️ background upsert 실패:", (e as Error).message),
    );
  } else {
    await runUpserts(); // = 기본 = 응답 전 완료
  }

  // 3. 카운터 집계
  const totals = results.reduce(
    (acc, r: any) => ({
      saved: acc.saved + r.saved,
      skipped: acc.skipped + r.skipped,
      enrichedByApi: acc.enrichedByApi + r.enrichedByApi,
      photoOk: acc.photoOk + r.photoOk,
      error: acc.error || r.error || "",
    }),
    { saved: 0, skipped: 0, enrichedByApi: 0, photoOk: 0, error: "" },
  );

  console.log(
    `[AG3] 🆕 saved=${totals.saved} skipped=${totals.skipped} apiEnriched=${totals.enrichedByApi} photoOk=${totals.photoOk} error="${totals.error}"`,
  );
}
