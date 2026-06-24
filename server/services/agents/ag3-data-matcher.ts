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
// ⚠️ 수정금지(승인필요) 2026-05-21 = celebrityPlaceEvidence DROP (= 1 행 폐기 = 사용자 SSOT) = import 제거
// ⚠️ 2026-05-23 = places + placeImages import 제거 (= 사용자 SSOT = 보조 테이블 폐기 = PSR 단일)
import { cities, placeSeedRaw } from "@shared/schema";
import { eq, ilike, sql, inArray, and } from "drizzle-orm";
import type {
  AG1Output,
  AG3PreOutput,
  AG3Output,
  PlaceResult,
  ScheduleSlot,
  SeedCategory,
} from "./types";
// ⚠️ 2026-05-23 = addPlaceAlias import 제거 (= 폐기)
import { findCityUnified, type CityResolveResult } from "../city-resolver";
// ⚠️ 수정금지(승인필요) 2026-05-15 = Google Places SKU 가드 (= SSOT §16)
// = Enterprise+Atmosphere 33 필드 차단 = $40/1K 폭탄 방지
import { validateFieldMask, STANDARD_TS_FIELD_MASK } from "../shared/google-places-sku";
// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 폴백 단일 SSOT (= Google 1 > WK 2)
import { pickPlaceImage } from "../shared/place-image";
// ⚠️ 수정금지(승인필요) — PID veto 제거 텍스트 정합(2026-06-15 SSOT)
// ⚠️ 2026-06-03 = 동일장소 5단계 매칭 = 공용 matcher.ts 단일 (= 헌법 §16, ag3 자체 0~4순위 폐기 → 정본 통일 + URI veto(PID veto 제거))
import { matchCandidate } from "../shared/matcher";
// ⚠️ 수정금지(승인필요) 2026-05-09 = AG3 saveNewPlacesToDB = 어제 21 식당 패턴 그대로 (= 자체 fetch = googlePlacesFetcher 사용 X)

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

// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 이미지 = 2 컬럼만
// = bestImageUrl (WK) > imageUrl (Google) 인라인 = AG2-DB:233 + AG3:488

// ⚠️ 2026-05-23 = google-places.ts 파일 삭제 = apiCallTracker import 제거 (= 미사용)

function getGoogleMapsApiKey(): string {
  return (
    process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || ""
  );
}

/**
 * AG3-pre: 도시 DB 데이터 사전 로드
 * 🔗 Agent Protocol v1.0: findCityUnified로 도시 매칭 (영어/한국어/별칭 모두 OK)
 * AG2(Gemini)와 병렬 실행하여 대기시간 활용
 */
export async function preloadCityData(
  destination: string,
  geminiPlaces?: PlaceResult[],
): Promise<AG3PreOutput> {
  const _t0 = Date.now();

  if (!db) {
    console.log("[AG3-pre] DB 미연결");
    return {
      cityId: null,
      dbPlacesMap: new Map(),
      cityName: destination,
      placeImageMap: new Map(),
      celebrityImageMap: new Map(),
      seedRawMap: new Map(),
    };
  }

  try {
    // 1. 🔗 통합 도시 검색 (영어 "Paris" → 한국어 "파리" DB 모두 매칭)
    const cityResult = await findCityUnified(destination);
    let cityId: number | null = cityResult?.cityId || null;
    const dbPlacesMap = new Map<string, any>();
    let celebrityImageMap = new Map<number, string>();
    let placeImageMap = new Map<number, string>();
    let seedRawMap = new Map<string, any>();

    // 도시 미발견 시 좌표 기반 fallback
    if (!cityId && geminiPlaces && geminiPlaces.length > 0) {
      const validPlaces = geminiPlaces.filter(
        (p) => p.lat && p.lng && p.lat !== 0,
      );
      if (validPlaces.length > 0) {
        const avgLat =
          validPlaces.reduce((s, p) => s + p.lat, 0) / validPlaces.length;
        const avgLng =
          validPlaces.reduce((s, p) => s + p.lng, 0) / validPlaces.length;

        const allCities = await db.select().from(cities);
        let closestCity: (typeof allCities)[0] | null = null;
        let closestDist = Infinity;

        for (const city of allCities) {
          const dist = Math.sqrt(
            Math.pow(city.latitude - avgLat, 2) +
              Math.pow(city.longitude - avgLng, 2),
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestCity = city;
          }
        }

        if (closestCity && closestDist < 0.5) {
          cityId = closestCity.id;
          console.log(
            `[AG3-pre] 📍 좌표 기반 매칭: "${destination}" → ${closestCity.name} (거리: ${closestDist.toFixed(3)})`,
          );
        }
      }
    }

    // ⚠️ 수정금지(승인필요) 사용자 SSOT 통합 = 2026-05-06
    // places, place_images, celebrityPlaceEvidence 3 테이블 = 코드에서 차단
    // = 옛 부패 데이터 (= 거짓 WIKI URL, 동명 가게 잘못된 매칭) 제거
    // = AG3 = place_seed_raw 단일 SSOT (gemini3-2026-05 + rank 1~20)
    // ↳ 매칭 X = 즉시 Google fallback
    // ↳ 데이터 (places, place_images) = 보존 = 추후 정리 가능
    const dbPlaces: { id: number; name: string }[] = [];
    if (cityId) {
      const cityLabel = cityResult
        ? `${cityResult.name}/${cityResult.nameEn}`
        : destination;
      console.log(
        `[AG3-pre] ✅ 도시 "${cityLabel}" (ID: ${cityId}) — places/place_images/celebrity 차단 (사용자 SSOT)`,
      );
    } else {
      console.log(
        `[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`,
      );
    }

    // 3. place_seed_raw = 단일 SSOT — ⚠️ 수정금지(승인필요) 2026-05-06 사용자 통합 결정
    //    필수 조건 = collection_phase='gemini3-2026-05' AND rank BETWEEN 1 AND 20
    //    + auto-learn-2026-05 phase (Google fallback 자동 학습 결과)
    if (cityId) {
      try {
        const _t1 = Date.now();
        // 사용자 SSOT 만 = top 20 검증 + 자동 학습 결과
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
          .where(
            and(
              eq(placeSeedRaw.cityId, cityId),
              // ⚠️ 수정금지(승인필요) 2026-05-21 = 사용자 SSOT = collection_phase 완전 폐기
              // = 같은 장소 = 다른 phase 수집 = 같은 데이터 (= 사람 1 = 이름/별명/사는곳/묘사 = 한 사람)
              // = 비식당 = rank 1-20 (= 사용자 큐레이션 우선) / 식당 = 모든 행
              sql`(${placeSeedRaw.seedCategory} = 'restaurant' OR ${placeSeedRaw.rank} BETWEEN 1 AND 20)`,
            ),
          );
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
      dbPlacesMap,
      cityName: cityResult?.nameEn || destination,
      cityCoords,
      placeImageMap,
      celebrityImageMap,
      seedRawMap,
    };
  } catch (error) {
    console.error("[AG3-pre] DB 사전 로드 실패:", error);
    return {
      cityId: null,
      dbPlacesMap: new Map(),
      cityName: destination,
      placeImageMap: new Map(),
      celebrityImageMap: new Map(),
      seedRawMap: new Map(),
    };
  }
}

// ⚠️ 2026-05-15 = PD getPlaceDetailsById() 함수 = 완전 폐기 (= SSOT §16)
// 폐기 사유: TS searchText 와 중복 (= 같은 데이터 2 회 호출). 사용자 결정 = TS 단독 유지.
// 신규 장소 좌표/사진/PID = saveNewPlacesToDB 의 TS searchText 호출이 담당.

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
  const {
    dbPlacesMap,
    cityName,
    placeImageMap,
    celebrityImageMap,
    seedRawMap,
  } = preloaded;
  const _t0 = Date.now();

  let matched = 0;
  let googleFetched = 0;
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

    // ⚠️ 수정금지(승인필요) 2026-05-06 사용자 SSOT = dbPlacesMap (places 테이블) 매칭 차단
    // = seedDirectMatch (= place_seed_raw place_id/address) 만 신뢰
    let dbMatch: any = undefined;

    // ⚠️ 수정금지(승인필요) seedDirectMatch 적용 = 좌표 + 이미지 + pid 즉시 채움 (Google 호출 회피)
    if (seedDirectMatch) {
      // 시드의 좌표 즉시 주입 (= needsGoogle 회피)
      if (seedDirectMatch.latitude && seedDirectMatch.longitude) {
        place.lat = parseFloat(String(seedDirectMatch.latitude));
        place.lng = parseFloat(String(seedDirectMatch.longitude));
      }
      // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 2 컬럼 우선순위 = Google (imageUrl) 1순위 > WK (bestImageUrl) 2순위
      const seedImg = pickPlaceImage(seedDirectMatch);
      if (seedImg) place.image = seedImg;
      // ⚠️ 수정금지(승인필요) 2026-05-14 = 모달 정확도 = 검증된 google_place_id 매핑 (= 핫픽스 3)
      // = 누락 시 = 모달 = name+city 검색 fallback = 인근 잘못된 장소 매칭 위험
      if (seedDirectMatch.googlePlaceId)
        (place as any).googlePlaceId = seedDirectMatch.googlePlaceId;
      if (seedDirectMatch.googleReviewCount)
        (place as any).userRatingCount = seedDirectMatch.googleReviewCount;
      // ⚠️ 수정금지(승인필요) 2026-05-14 = v3 SSOT = 위트 카피 우선 (= shortform_ko = editorial_summary)
      // = description = editorialSummary 우선 → summary_ko 폴백 (= "프사각" "MZ들" 노출)
      if (seedDirectMatch.editorialSummary)
        place.description = seedDirectMatch.editorialSummary;
      else if (seedDirectMatch.summaryKo)
        place.description = seedDirectMatch.summaryKo;
      if (seedDirectMatch.summaryKo)
        place.personaFitReason = seedDirectMatch.summaryKo;
      // 별도 marker 로 후속 enrichment 가 인식하도록
      (place as any).__seedDirectMatch = seedDirectMatch;
    }

    // ⚠️ 수정금지(승인필요) 2026-05-06 = seedDirectMatch 만 신뢰 = 매칭 X 시 즉시 Google
    const needsGoogle = !seedDirectMatch;
    matchResults.push({ place, dbMatch: seedDirectMatch || null, needsGoogle });
  }

  console.log(
    `[AG3] DB 매칭 완료 (${Date.now() - _t0}ms): ${matchResults.filter((r) => r.dbMatch).length}곳 매칭, ${matchResults.filter((r) => r.needsGoogle).length}곳 Google 필요`,
  );

  // === 2단계: Google Places API 병렬 호출 (최대 5개 동시, 5초 타임아웃) ===
  const googleNeeded = matchResults.filter((r) => r.needsGoogle);
  const googleResults = new Map<string, any>();
  // ⚠️ 수정금지(승인필요) 2026-05-15 = PD getPlaceDetailsById() 폐기 (= SSOT §16)
  // = TS searchText 와 중복 = saveNewPlacesToDB 의 TS 호출만 사용 (= 사용자 명시 결정).
  // = 신규 장소 좌표/사진/PID = saveNewPlacesToDB 단계에서 일괄 확보.

  // === 3단계: 결과 조합 ===
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

  for (const { place, dbMatch, needsGoogle } of matchResults) {
    const nameLower = place.name.toLowerCase().trim();

    if (dbMatch) {
      // ⚠️ 수정금지(승인필요) 2026-05-06 = dbMatch = seedDirectMatch (= place_seed_raw 행)
      // ⚠️ 2026-05-20 = DB Direct path = dbMatch === place (PlaceResult shape) = 별도 처리
      matched++;
      const isDbDirect = place.sourceType === "DB Direct (Place Seed Raw)";
      const seed = dbMatch;
      // ⚠️ 2026-05-20 = shape 분기 = DB Direct = PlaceResult.userRatingCount / dbMatch path = placeSeedRaw.googleReviewCount
      const reviewCount = isDbDirect
        ? ((place as any).userRatingCount ?? 0)
        : (seed.googleReviewCount ?? 0);

      // ⚠️ 수정금지(승인필요) 2026-05-20 = shape 일치 강제 = priceEur 손실 버그 시정 (= 사용자 SSOT)
      // = DB Direct = AG2-DB 가 PlaceResult.estimatedPriceEur 채움 / dbMatch path = placeSeedRaw.priceEur
      const estimatedPriceEur = isDbDirect
        ? place.estimatedPriceEur != null
          ? Number(place.estimatedPriceEur)
          : undefined
        : seed.priceEur != null
          ? Number(seed.priceEur)
          : undefined;

      enriched.push({
        ...place,
        // ⚠️ 2026-05-20 = DB Direct = sourceType 유지 (= 'DB Direct (Place Seed Raw)') / dbMatch path = 'Gemini AI + DB Enriched'
        sourceType: isDbDirect ? place.sourceType : "Gemini AI + DB Enriched",
        description: isDbDirect
          ? (place.description ?? "")
          : ((seed.summaryKo || seed.editorialSummary || place.description) ??
            ""),
        // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = pickPlaceImage 단일 SSOT (= Google 1 > WK 2)
        image: isDbDirect
          ? place.image || ""
          : pickPlaceImage(seed) || place.image || "",
        userRatingCount: reviewCount,
        googleMapsUrl: place.googleMapsUrl,
        lat: isDbDirect
          ? place.lat
          : parseFloat(String(seed.latitude)) || place.lat,
        lng: isDbDirect
          ? place.lng
          : parseFloat(String(seed.longitude)) || place.lng,
        estimatedPriceEur, // ← shape 분기 적용 (= priceEur 보존)
        // ⚠️ 2026-05-20 = shape 분기 = DB Direct = AG2-DB 의 seedCategory / dbMatch path = placeSeedRaw.seedCategory
        seedCategory: (isDbDirect
          ? place.seedCategory
          : seed.seedCategory) as SeedCategory,
        selectionReasons: isDbDirect
          ? place.selectionReasons || []
          : [
              ...(place.selectionReasons || []),
              `📊 사용자 검증 SSOT (rank ${seed.rank ?? "-"}, 리뷰 ${reviewCount.toLocaleString()}개${estimatedPriceEur ? `, €${estimatedPriceEur}/인` : ""})`,
            ],
        confidenceLevel: "high" as const,
      } as any);
    } else if (needsGoogle) {
      const googleResult = googleResults.get(place.name);
      if (googleResult) {
        googleFetched++;

        // ⚠️ 수정금지(승인필요) 2026-05-06 = gid 역매칭 (= dbPlacesMap) 폐기
        // = sole SSOT = place_seed_raw → Google fallback 결과 그대로 사용
        enriched.push({
          ...place,
          sourceType: "Gemini AI + Google Places",
          lat: googleResult.lat,
          lng: googleResult.lng,
          image: googleResult.photoUrl || place.image || "",
          googleMapsUrl: googleResult.googleMapsUri || place.googleMapsUrl,
          userRatingCount: googleResult.userRatingCount || 0,
        });
      } else {
        // 매칭 실패
        const seedDataFallback = getSeedData(place.name);
        unmatchedCount++;
        // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = pickPlaceImage 단일 SSOT
        const finalImg =
          (pickPlaceImage(seedDataFallback || {}) || place.image) ?? "";
        console.log(
          `[AG3-MATCH] ❌ Unmatched: "${place.name}" (Used seed image: ${finalImg ? "Yes" : "No"})`,
        );
        enriched.push({
          ...place,
          sourceType: "Gemini AI (New)",
          image: finalImg,
        });
      }
    } else {
      const seedDataFallback = getSeedData(place.name);
      unmatchedCount++;
      // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = 2 컬럼 우선순위 (= Google 1 > WK 2)
      const finalImg =
        (pickPlaceImage(seedDataFallback || {}) || place.image) ?? "";
      console.log(
        `[AG3-MATCH] ❌ No DB/Google: "${place.name}" (Used seed image: ${finalImg ? "Yes" : "No"})`,
      );
      enriched.push({
        ...place,
        sourceType: "Gemini AI (New)",
        image: finalImg,
      });
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
    `[AG3] 최종: ${matched}곳 DB, ${googleFetched}곳 Google, ${unmatchedCount}곳 원본 (${Date.now() - _t0}ms)`,
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

  // ⚠️ 수정금지(승인필요) 2026-06-01 = 사용자 SSOT = bare 매칭(= DB Enriched 인데 PID/이미지/좌표 없음) = TS+PM 보강 포함
  // = 스샷 입증 = bare 레거시 행 매칭 시 Google 보강 건너뛰어 = 이미지/좌표/모달 PID 셋 다 누락 + 모달 fuzzy 동명 다중 노출
  // = searchText 가 풀주소로 정확한 장소 찾음 → upsertPlace COALESCE(옛 우선) = NULL 칸만 채움 = bare 행 영구 개선 (§14)
  // = 완전 매칭 행(PID+이미지+좌표 보유)은 제외 = 추가 호출 0. 롤백 = ENRICH_BARE_MATCHES = false
  const ENRICH_BARE_MATCHES = true;
  const isBareMatch = (p: PlaceResult) =>
    ENRICH_BARE_MATCHES &&
    p.sourceType === "Gemini AI + DB Enriched" &&
    (!(p as any).googlePlaceId || !p.image || !p.lat); // = 셋 중 하나라도 없으면 보강
  const toSave = newPlaces.filter(
    (p) =>
      p.sourceType === "Gemini AI (New)" ||
      p.sourceType === "Gemini AI + Google Places" ||
      isBareMatch(p),
  );
  if (toSave.length === 0) {
    console.log(`[AG3-SAVE] toSave=0 (= 모두 DB Enriched 또는 다른 type)`);
    return;
  }

  console.log(
    `[AG3-SAVE] toSave=${toSave.length} 행 = 즉시 await searchText + PhotoMedia + Storage upload + INSERT 시작`,
  );

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 도시 좌표 사전 조회 (= searchText locationBias 용)
  let cityLat = 0,
    cityLng = 0,
    cityName = "";
  try {
    const cityRow = await db!.execute(
      sql`SELECT name_en, latitude, longitude FROM cities WHERE id = ${cityId} LIMIT 1`,
    );
    const c = (cityRow as any).rows?.[0];
    if (c) {
      cityLat = parseFloat(c.latitude) || 0;
      cityLng = parseFloat(c.longitude) || 0;
      cityName = c.name_en || "";
    }
  } catch (e) {
    console.warn(`[AG3-SAVE] 도시 좌표 조회 실패`, (e as Error).message);
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 사용자 명시 = 어제 신규 21 식당 INSERT 패턴 그대로 클론
  // = scripts/_tmp_paris-rest-insert-21new.mjs:95-127 = 헌법 (memory: feedback_image_matching_polite_failure.md)
  // = searchText (7 필드 + maxResultCount=1 + timeout 20s + textQuery 안에 도시명)
  // = PhotoMedia binary 다운로드 + Supabase Storage 업로드 = 메인앱 안전 URL
  const GOOGLE_KEY =
    process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
  const SUPA_ANON = process.env.SUPABASE_ANON_KEY || "";
  const SUPA_PUB =
    process.env.SUPABASE_PUBLIC_URL ||
    "https://wxebceflvuythuodemro.supabase.co";

  // ⚠️ 수정금지(승인필요) 2026-06-02 = 전 앱 TS 호출 단일 표준 (= STANDARD_TS_FIELD_MASK §16)
  // = 9 필드 Enterprise (= businessStatus 폐업·rename 판정) = 표준화
  const SEARCH_TEXT_FIELD_MASK = STANDARD_TS_FIELD_MASK;
  validateFieldMask(SEARCH_TEXT_FIELD_MASK);
  async function searchText(
    name: string,
    addr: string | undefined,
  ): Promise<any | null> {
    try {
      const r = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": SEARCH_TEXT_FIELD_MASK,
          },
          // ⚠️ 수정금지(승인필요) 2026-05-15 = languageCode: 'ko' (= Gemini 한국어 ↔ TS 한국어 검증 가능)
          body: JSON.stringify({
            textQuery: addr ? `${name} ${addr}` : `${name} ${cityName}`,
            maxResultCount: 1,
            languageCode: "ko",
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok) return null;
      const d = (await r.json()) as any;
      return d.places?.[0] || null;
    } catch {
      return null;
    }
  }

  // 어제 21 식당 패턴 = PhotoMedia binary 다운로드 + Storage 업로드
  async function uploadPhoto(
    photoName: string,
    placeId: string,
    seedCategory: string,
  ): Promise<string | null> {
    const phUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_KEY}&maxHeightPx=800&maxWidthPx=1200`;
    const phResp = await fetch(phUrl, { signal: AbortSignal.timeout(30000) });
    if (!phResp.ok) return null;
    const ab = await phResp.arrayBuffer();
    const binary = Buffer.from(ab);
    const fileName = `${cityId}/${seedCategory}/${placeId}.jpg`;
    const upResp = await fetch(
      `${SUPA_PUB}/storage/v1/object/place-images/${fileName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPA_ANON}`,
          "Content-Type": "image/jpeg",
          "x-upsert": "true",
        },
        body: binary,
      },
    );
    if (!upResp.ok) return null;
    return `${SUPA_PUB}/storage/v1/object/public/place-images/${fileName}`;
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = Promise.all 병렬화 (= simplify HIGH 권장)
  // = 순차 14~21 초 → 병렬 ~3.5 초 (= 4~6 배 단축)
  // = Google API rate limit (= 분당 600) = 4~6 호출 = 충분 여유
  // = race-safe rank = 카테고리별 base + 인덱스 (= MAX(rank) 사전 1 회)

  // 1. nextRank base 사전 계산 (= 카테고리별 1 회 = race condition 차단)
  const baseRanks: Record<string, number> = {};
  for (const cat of ["restaurant", "attraction"]) {
    // ⚠️ 2026-05-23 = phase_tags 'auto-learn%' 마커 기준 (= 자동 학습 결과)
    const r = await db!.execute(
      sql`SELECT COALESCE(MAX(rank), 8999) + 1 AS next_rank FROM place_seed_raw
          WHERE city_id = ${cityId} AND seed_category = ${cat}
          AND EXISTS (SELECT 1 FROM unnest(COALESCE(phase_tags, ARRAY[]::text[])) AS t WHERE t LIKE 'auto-learn%')`,
    );
    baseRanks[cat] = (r as any).rows?.[0]?.next_rank ?? 9000;
  }
  const today = new Date().toISOString().slice(0, 10);

  // 2. 병렬 처리 (= searchText + PhotoMedia + Storage + INSERT)
  const results = await Promise.all(
    toSave.map(async (place, i) => {
      try {
        const result = await searchText(
          place.name,
          (place as any).geminiAddress,
        );
        if (!result || !result.id || !result.location)
          return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0 };

        const placeId: string = result.id;
        const lat: number = result.location.latitude;
        const lng: number = result.location.longitude;
        if (!lat || !lng)
          return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0 };

        // ⚠️ 수정금지(승인필요) 2026-06-02 = 사용자 SSOT = TS 최종 폐업 게이트 (= businessStatus)
        // = CLOSED_PERMANENTLY = 영구 폐업 = ① 백필 안 함(job 미수집 = INSERT X) ② PhotoMedia 비용 회피($0.007)
        //   ③ FE 여정 제외(__closedPermanently 마커 = place 참조 = pipeline-v3 가 scheduleMap scene 제거)
        // = PhotoMedia 호출 전 배치 = 폐업 식당엔 이미지 비용도 0
        if (result.businessStatus === "CLOSED_PERMANENTLY") {
          (place as any).__closedPermanently = true;
          console.log(`[AG3-SAVE] 🚫 "${place.name}" = 영구 폐업(TS) = 백필·FE 제외`);
          return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0, closedPermanently: 1 };
        }

        const seedCategory: string = place.tags?.includes("restaurant")
          ? "restaurant"
          : place.tags?.includes("food")
            ? "restaurant"
            : "attraction";

        let imageUrl: string | null = null;
        const photoName = result.photos?.[0]?.name;
        if (photoName) {
          imageUrl = await uploadPhoto(photoName, placeId, seedCategory);
        }

        // ⚠️ place 객체 직접 갱신 (= 호출자 baseline 반영, race X = 각 호출 자기 place 만)
        place.lat = lat;
        place.lng = lng;
        place.image = imageUrl || "";
        (place as any).googlePlaceId = placeId;
        (place as any).geminiAddress =
          result.formattedAddress || (place as any).geminiAddress;
        place.userRatingCount = result.userRatingCount || 0;
        console.log(
          `[AG3-SAVE] 📡 "${place.name}" → (${lat}, ${lng}) img=${imageUrl ? "Storage" : "NULL"}`,
        );

        // ⚠️ 수정금지(승인필요) 2026-06-20 = TS priceRange.endPrice(최신 검증) 우선, 없으면 Gemini = COALESCE 새 우선(최신최우선). 옛 "비싼 쪽 max"(2026-05-15) 폐기 = §14 정합(GREATEST 폐기 2026-06-10). place-upsert 가 이미 새우선이라 여기서 비싼쪽 강제 = §14 위반 잔재였음.
        const tsPriceEur = result.priceRange?.endPrice?.units
          ? parseFloat(result.priceRange.endPrice.units)
          : 0;
        const geminiPriceEur = (place as any).estimatedPriceEur || 0;
        const newPriceEur = tsPriceEur > 0 ? tsPriceEur : geminiPriceEur;

        const nextRank = baseRanks[seedCategory] + i;
        // ⚠️ 수정금지(승인필요) 2026-05-15 = 사용자 SSOT = upsertPlace() 통과 강제 (= CLAUDE.md 제14조)
        // = 7 단계 매칭 (PID > URI > 풀주소 > 좌표10m > 이름) + COALESCE 새 우선 + 가격 COALESCE 새 우선(최신최우선)
        // ⚠️ 2026-06-01 = upsert 즉시 await X = job 수집만 (= 아래 runUpserts 가 deferPersist 에 따라 background/await)
        const job = {
          cityId: cityId,
          seedCategory,
          rank: nextRank,
          // ⚠️ 수정금지(승인필요) 2026-06-01 = bare 매칭 = 매칭된 원행 이름으로 upsert
          // = matchPlacesWithDB(느슨 norm/noAccent) ↔ upsertPlace 5순위(엄격 normName) 정규화 불일치 = 새 INSERT 중복 위험
          // = 매칭된 원행 nameEn 사용 = upsertPlace 5순위 정확 재매칭 = 같은 행 UPDATE 보장 (= COALESCE 로 행 이름 보존)
          // = 신규(미매칭) 장소 = __seedDirectMatch 없음 = place.name 그대로 (= 정상 INSERT)
          nameEn: (place as any).__seedDirectMatch?.nameEn || place.name,
          nameKo: (place as any).nameKo || null,
          nameLocal: (place as any).nameLocal || null,
          address:
            result.formattedAddress || (place as any).geminiAddress || null,
          latitude: lat,
          longitude: lng,
          imageUrl: imageUrl,
          googlePlaceId: placeId,
          googleMapsUri: result.googleMapsUri || null, // ⚠️ 2026-05-15 = 13번째 SSOT
          shortformKo: place.description || null, // → editorial_summary
          selectionReasonKo:
            place.personaFitReason || place.description || null, // → summary_ko
          googleReviewCount: result.userRatingCount || 0,
          priceEur: newPriceEur,
          categoryTags: [seedCategory],
          phaseTags: [`auto-learn-${today}`],
        };

        return {
          saved: 1,
          skipped: 0,
          enrichedByApi: 1,
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
