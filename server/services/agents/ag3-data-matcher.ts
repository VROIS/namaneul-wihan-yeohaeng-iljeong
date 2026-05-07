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

import { db } from '../../db';
import { places, cities, celebrityPlaceEvidence, placeImages, placeSeedRaw } from '@shared/schema';
import { eq, ilike, sql, inArray, and } from 'drizzle-orm';
import type { AG1Output, AG3PreOutput, AG3Output, PlaceResult, ScheduleSlot } from './types';
import { findCityUnified, addPlaceAlias, type CityResolveResult } from '../city-resolver';

/** <img>로 사용 가능한 URL인지 (인스타 post URL, 네이버/티스토리 등 차단 도메인 제외) */
function isUsableImageUrl(url: string): boolean {
  const u = url.toLowerCase().trim();
  if (!u) return false;
  if (u.includes('example.com')) return false;
  // 🚫 전멸 확인된 소스 차단 (0013 DB 정리와 동일)
  // ⚠️ 수정금지(승인필요) 2026-05-06 = 사용자 SSOT 통합 = Google CDN URL 허용
  // = 메인앱이 직접 로드 (Google Cloud Console HTTP referrer 제한 = 우리 도메인 만)
  // = Storage 다운로드/업로드 우회 = Cached Egress 0
  // (옛 차단 룰: places.googleapis.com / maps.googleapis.com 해제됨)
  if (u.includes('fbcdn.net') || u.includes('cdninstagram') || u.includes('cdn.fbsbx.com')) return false;
  // 🚫 모바일 앱에서 Referer 체크로 렌더링 차단되는 도메인 제외
  if (u.includes('naver.com') || u.includes('tistory.com') || u.includes('daum.net')) return false;
  // instagram.com/p/xxx 또는 /reel/xxx (HTML) — /media/?size= 는 리다이렉트로 이미지 가능
  if ((u.includes('instagram.com/p/') || u.includes('instagram.com/reel/')) && !u.includes('/media/'))
    return false;
  // ✅ 영구 유효 소스
  if (u.includes('wikimedia.org') || u.includes('wikipedia.org')) return true;
  if (u.includes('i.ytimg.com') || u.includes('unsplash.com')) return true;
  return true; // 기타는 시도
}

/**
 * 일정 이미지 우선순위 (NUBI Handoff 규격):
 * 1순위: place_seed_raw.evidence_url (추천 근거이자 인스타 증거 사진)
 * 2순위: place_seed_raw.best_image_url (검증된 초고화질 마스터 이미지)
 * 3순위: place_seed_raw.image_url (1단계 기본 수집 이미지)
 * 4순위: places.photoUrls 및 place_images 통합 테이블
 */
function resolvePlaceImage(
  evidenceUrl?: string | null,         // 1순위: place_seed_raw.evidence_url
  seedBestImageUrl?: string | null,    // 2순위: place_seed_raw.best_image_url
  seedImageUrl?: string | null,        // 3순위: place_seed_raw.image_url
  placeImageUrl?: string | null,       // 4-1순위: place_images 통합 테이블
  photoUrls?: string[] | null,         // 4-2순위: places.photoUrls (구글)
  ...fallbacks: (string | undefined | null)[]
): string | undefined {
  const pick = (url: string | undefined | null) => (url && isUsableImageUrl(url) ? url : undefined);
  const pickFirst = (arr: string[] | null | undefined) => arr?.find((u) => isUsableImageUrl(u));

  const e1 = pick(evidenceUrl);
  if (e1) return e1;
  const s1 = pick(seedBestImageUrl);
  if (s1) return s1;
  const s2 = pick(seedImageUrl);
  if (s2) return s2;
  const p1 = pick(placeImageUrl);
  if (p1) return p1;
  const photo = pickFirst(photoUrls || []);
  if (photo) return photo;
  for (const f of fallbacks) {
    const v = pick(f);
    if (v) return v;
  }
  return undefined;
}

// Google Places API 키 + 💰 비용 보호
import { apiCallTracker } from '../google-places';

function getGoogleMapsApiKey(): string {
  return process.env.Google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || '';
}

/**
 * AG3-pre: 도시 DB 데이터 사전 로드
 * 🔗 Agent Protocol v1.0: findCityUnified로 도시 매칭 (영어/한국어/별칭 모두 OK)
 * AG2(Gemini)와 병렬 실행하여 대기시간 활용
 */
export async function preloadCityData(
  destination: string,
  geminiPlaces?: PlaceResult[]
): Promise<AG3PreOutput> {
  const _t0 = Date.now();

  if (!db) {
    console.log('[AG3-pre] DB 미연결');
    return { cityId: null, dbPlacesMap: new Map(), cityName: destination, placeImageMap: new Map(), celebrityImageMap: new Map(), seedRawMap: new Map() };
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
      const validPlaces = geminiPlaces.filter(p => p.lat && p.lng && p.lat !== 0);
      if (validPlaces.length > 0) {
        const avgLat = validPlaces.reduce((s, p) => s + p.lat, 0) / validPlaces.length;
        const avgLng = validPlaces.reduce((s, p) => s + p.lng, 0) / validPlaces.length;

        const allCities = await db.select().from(cities);
        let closestCity: typeof allCities[0] | null = null;
        let closestDist = Infinity;

        for (const city of allCities) {
          const dist = Math.sqrt(
            Math.pow(city.latitude - avgLat, 2) + Math.pow(city.longitude - avgLng, 2)
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestCity = city;
          }
        }

        if (closestCity && closestDist < 0.5) {
          cityId = closestCity.id;
          console.log(`[AG3-pre] 📍 좌표 기반 매칭: "${destination}" → ${closestCity.name} (거리: ${closestDist.toFixed(3)})`);
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
      const cityLabel = cityResult ? `${cityResult.name}/${cityResult.nameEn}` : destination;
      console.log(`[AG3-pre] ✅ 도시 "${cityLabel}" (ID: ${cityId}) — places/place_images/celebrity 차단 (사용자 SSOT)`);
    } else {
      console.log(`[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`);
    }

    // 3. place_seed_raw = 단일 SSOT — ⚠️ 수정금지(승인필요) 2026-05-06 사용자 통합 결정
    //    필수 조건 = collection_phase='gemini3-2026-05' AND rank BETWEEN 1 AND 20
    //    + auto-learn-2026-05 phase (Google fallback 자동 학습 결과)
    //    옛 france30/europe30/etc phase = 검증 X = 매칭 대상 X
    if (cityId) {
      try {
        const _t1 = Date.now();
        // 사용자 SSOT 만 = top 20 검증 + 자동 학습 결과
        const seeds = await db.select({
          id: placeSeedRaw.id,
          nameEn: placeSeedRaw.nameEn,
          nameKo: placeSeedRaw.nameKo,
          nameLocal: placeSeedRaw.nameLocal,
          googlePlaceId: placeSeedRaw.googlePlaceId,
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
          photoUrls: placeSeedRaw.photoUrls,
          rank: placeSeedRaw.rank,
          seedCategory: placeSeedRaw.seedCategory,
          collectionPhase: placeSeedRaw.collectionPhase,
        }).from(placeSeedRaw).where(and(
          eq(placeSeedRaw.cityId, cityId),
          sql`${placeSeedRaw.collectionPhase} IN ('gemini3-2026-05', 'auto-learn-2026-05')`,
          // gemini3 = top 20 만, auto-learn = 9000+ 모두 매칭 가능
          sql`(${placeSeedRaw.collectionPhase} = 'auto-learn-2026-05' OR ${placeSeedRaw.rank} BETWEEN 1 AND 20)`
        ));
        for (const s of seeds) {
          const makeKey = (name: string | null) => name ? name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
          const keyEn = makeKey(s.nameEn);
          const keyKo = makeKey(s.nameKo);
          if (keyEn) seedRawMap.set(keyEn, s);
          if (keyKo) seedRawMap.set(keyKo, s);
          // ⚠️ 수정금지(승인필요) 사용자 의도 = google_place_id 기반 직접 매칭 키 추가
          if (s.googlePlaceId) seedRawMap.set(`pid:${s.googlePlaceId}`, s);
          // ⚠️ 수정금지(승인필요) 사용자 의도 = address 기반 매칭 키 추가 (= 식당 동명 충돌 회피)
          if (s.address) {
            const addrKey = `addr:${s.address.toLowerCase().replace(/\s+/g, ' ').trim()}`;
            seedRawMap.set(addrKey, s);
          }
        }
        console.log(`[AG3-pre] 🏭 통합 전시매장(place_seed_raw) ${seeds.length}건 사전 로드 (${Date.now() - _t1}ms)`);
      } catch (e) {
        console.warn(`[AG3-pre] seedData 로드 실패:`, (e as Error)?.message);
      }
    }

    // 도시 중심 좌표 (숙소 미입력 시 출발 기점으로 사용)
    const cityCoords = (cityResult?.latitude && cityResult?.longitude)
      ? { lat: cityResult.latitude, lng: cityResult.longitude }
      : undefined;
    if (cityCoords) {
      console.log(`[AG3-pre] 📍 도시 중심 좌표: ${cityCoords.lat.toFixed(4)}, ${cityCoords.lng.toFixed(4)}`);
    }

    return {
      cityId,
      dbPlacesMap,
      cityName: cityResult?.nameEn || destination,
      cityCoords,
      placeImageMap,
      celebrityImageMap,
      seedRawMap
    };
  } catch (error) {
    console.error('[AG3-pre] DB 사전 로드 실패:', error);
    return { cityId: null, dbPlacesMap: new Map(), cityName: destination, placeImageMap: new Map(), celebrityImageMap: new Map(), seedRawMap: new Map() };
  }
}

/**
 * Google Places Text Search로 장소명 → 좌표/사진/URL 확보
 * DB에 없는 장소의 실제 데이터를 수집하여 DB에 저장 (다음번 활용)
 */
async function searchPlaceByName(
  placeName: string,
  cityName: string,
  address?: string  // ⚠️ 수정금지(승인필요) 사용자 의도 = address 추가 = 식당 동명 충돌 회피
): Promise<{ lat: number; lng: number; photoUrl: string; googleMapsUri: string; googlePlaceId: string; rating?: number; userRatingCount?: number } | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  // 💰 비용 보호: 일일 Places API 한도 체크 (google-places.ts와 공유)
  if (!apiCallTracker.canMakeRequest()) {
    apiCallTracker.recordBlocked();
    console.warn(`[AG3] ⚠️ Places API 일일 한도 초과 — ${placeName} 건너뜀`);
    return null;
  }
  apiCallTracker.recordCall();

  // ⚠️ 수정금지(승인필요) address 있으면 textQuery 에 포함 = Google 정확도 ↑
  const textQuery = address && address.trim().length > 0
    ? `${placeName} ${address} ${cityName}`
    : `${placeName} ${cityName}`;

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos,places.googleMapsUri,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.places?.[0];
    if (!result?.location) return null;

    const photoUrl = result.photos?.[0]?.name
      ? `https://places.googleapis.com/v1/${result.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
      : '';

    return {
      lat: result.location.latitude,
      lng: result.location.longitude,
      photoUrl,
      googleMapsUri: result.googleMapsUri || '',
      googlePlaceId: result.id || '',
      userRatingCount: result.userRatingCount,
    };
  } catch (error) {
    console.warn(`[AG3] Google Places 검색 실패 (${placeName}):`, error);
    return null;
  }
}

/**
 * AG3 메인: DB 매칭 + 좌표 보강 + Google Places 보충
 * 
 * AG2가 반환한 장소명을 DB와 매칭하여 실제 데이터를 삽입
 * DB에 없는 장소는 Google Places API로 좌표/사진 확보
 */
export async function matchPlacesWithDB(
  geminiPlaces: PlaceResult[],
  preloaded: AG3PreOutput
): Promise<PlaceResult[]> {
  const { dbPlacesMap, cityName, placeImageMap, celebrityImageMap, seedRawMap } = preloaded;
  const _t0 = Date.now();

  let matched = 0;
  let googleFetched = 0;
  let unmatchedCount = 0;

  // === 1단계: DB 매칭 (동기, 빠름) ===
  type MatchResult = { place: PlaceResult; dbMatch: any | null; needsGoogle: boolean };
  const matchResults: MatchResult[] = [];

  for (const place of geminiPlaces) {
    const nameLower = place.name.toLowerCase().trim();

    // ⚠️ 수정금지(승인필요) 사용자 의도 = 4-단계 매칭 (place_id → address → name → Google)
    // 0. place_id 직접 매칭 (= place_seed_raw 우선, 100% 정확)
    let seedDirectMatch: any = null;
    const geminiPlaceId = (place as any).geminiPlaceId;
    console.log(`[AG3-DEBUG] "${place.name}" geminiPlaceId="${geminiPlaceId || ''}" geminiAddress="${((place as any).geminiAddress || '').slice(0,60)}" seedMapSize=${seedRawMap.size}`);
    if (geminiPlaceId && seedRawMap.size > 0) {
      seedDirectMatch = seedRawMap.get(`pid:${geminiPlaceId}`);
      if (seedDirectMatch) console.log(`[AG3] 🎯 place_id 매칭: "${place.name}" (${geminiPlaceId})`);
    }

    // ⚠️ 수정금지(승인필요) 2026-05-06 = name 매칭을 address 보다 먼저 (= DB 중복 주소 사고 회피)
    // 0.5. name 매칭 = place_seed_raw 정규화 키 (= 가장 유일성 높음, 랜드마크 정확)
    if (!seedDirectMatch && seedRawMap.size > 0) {
      const nameKey = nameLower.replace(/[\s\p{P}\p{S}]+/gu, "");
      seedDirectMatch = seedRawMap.get(nameKey);
      if (seedDirectMatch) console.log(`[AG3] 🏷 name 매칭: "${place.name}"`);
    }

    // 0.75. address 매칭 = name 실패 시만 (= 우편번호 거부 + name 유사성 검증)
    const geminiAddress = (place as any).geminiAddress;
    const isSpecificAddress = (a: string) => {
      const trimmed = a.trim();
      if (trimmed.length < 15) return false;
      if (/^\d{5}\s/.test(trimmed)) return false;
      return /(rue|av\.|bd\.|pl\.|place|avenue|boulevard|street|road|st\.|quai|pont|chemin|passage|allee|champ|cour)/i.test(trimmed);
    };
    if (!seedDirectMatch && geminiAddress && seedRawMap.size > 0 && isSpecificAddress(geminiAddress)) {
      const addrLower = geminiAddress.toLowerCase().replace(/\s+/g, ' ').trim();
      // 정확한 address 매칭 + name 유사성 검증 (= 동일 주소 다른 가게 회피)
      const nameSimilar = (rowNameEn: string | null) => {
        if (!rowNameEn) return true; // 비교 X = 통과
        const rn = rowNameEn.toLowerCase();
        const gn = nameLower;
        // 한 단어 이상 공유 (= 길이 3+) 또는 한 쪽이 다른 쪽 포함
        if (rn.includes(gn) || gn.includes(rn)) return true;
        const rWords = rn.split(/\s+/).filter(w => w.length >= 3);
        const gWords = gn.split(/\s+/).filter(w => w.length >= 3);
        return rWords.some(w => gWords.includes(w));
      };
      const exact = seedRawMap.get(`addr:${addrLower}`);
      if (exact && nameSimilar(exact.nameEn)) {
        seedDirectMatch = exact;
        console.log(`[AG3] 🏠 address 정확 매칭: "${place.name}"`);
      }
      if (!seedDirectMatch) {
        for (const [key, val] of seedRawMap) {
          if (!key.startsWith('addr:')) continue;
          const dbAddr = key.slice(5);
          if (!isSpecificAddress(dbAddr)) continue;
          if (dbAddr.includes(addrLower) || addrLower.includes(dbAddr)) {
            if (!nameSimilar(val.nameEn)) continue; // name 다름 = skip
            seedDirectMatch = val;
            console.log(`[AG3] 🏠 address 매칭: "${place.name}" (${geminiAddress.slice(0, 40)})`);
            break;
          }
        }
      }
    }

    // ⚠️ 수정금지(승인필요) 2026-05-06 사용자 SSOT = dbPlacesMap (places 테이블) 매칭 차단
    // = 옛 부패 데이터 (= WIKI 잘못된 사진, 동명 가게 잘못된 매칭) 사용 X
    // = seedDirectMatch (= place_seed_raw place_id/address) 만 신뢰
    // 1~3. 옛 dbPlacesMap fuzzy/partial 매칭 = 모두 폐기
    let dbMatch: any = undefined;

    // ⚠️ 수정금지(승인필요) seedDirectMatch 적용 = 좌표 + 이미지 즉시 채움 (Google 호출 회피)
    if (seedDirectMatch) {
      // 시드의 좌표 즉시 주입 (= needsGoogle 회피)
      if (seedDirectMatch.latitude && seedDirectMatch.longitude) {
        place.lat = parseFloat(String(seedDirectMatch.latitude));
        place.lng = parseFloat(String(seedDirectMatch.longitude));
      }
      // 사용자 의도 = 정확한 우리 큐레이션 이미지 우선
      if (seedDirectMatch.imageUrl) place.image = seedDirectMatch.imageUrl;
      // 별도 marker 로 후속 enrichment 가 인식하도록
      (place as any).__seedDirectMatch = seedDirectMatch;
    }

    // ⚠️ 수정금지(승인필요) 2026-05-06 = seedDirectMatch 만 신뢰 = 매칭 X 시 즉시 Google
    const needsGoogle = !seedDirectMatch;
    matchResults.push({ place, dbMatch: seedDirectMatch || null, needsGoogle });
  }

  console.log(`[AG3] DB 매칭 완료 (${Date.now() - _t0}ms): ${matchResults.filter(r => r.dbMatch).length}곳 매칭, ${matchResults.filter(r => r.needsGoogle).length}곳 Google 필요`);

  // === 2단계: Google Places API 병렬 호출 (최대 5개 동시, 5초 타임아웃) ===
  const googleNeeded = matchResults.filter(r => r.needsGoogle);
  const googleResults = new Map<string, any>();

  if (googleNeeded.length > 0) {
    const _gt0 = Date.now();
    // 일정 내 모든 장소에 좌표 확보 필수 (좌표 없으면 이동경로 계산 불가)
    // 동시 5개씩 배치로 호출, 3초 타임아웃
    const BATCH_SIZE = 5;
    for (let i = 0; i < googleNeeded.length; i += BATCH_SIZE) {
      const batch = googleNeeded.slice(i, i + BATCH_SIZE);
      // ⚠️ 수정금지(승인필요) Google searchText = address 포함 = 동명 가게 충돌 회피
      const batchPromises = batch.map(r =>
        Promise.race([
          searchPlaceByName(r.place.name, cityName, (r.place as any).geminiAddress || ''),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]).then(result => {
          if (result) googleResults.set(r.place.name, result);
        }).catch(() => { })
      );
      await Promise.all(batchPromises);
    }
    console.log(`[AG3] Google Places 완료 (${Date.now() - _gt0}ms): ${googleResults.size}/${googleNeeded.length}곳 확보`);
  }

  // === 3단계: 결과 조합 ===
  const enriched: PlaceResult[] = [];

  // place_seed_raw에서 장소명으로 데이터를 찾는 헬퍼
  const getSeedData = (placeName: string, dbMatch?: any): any | null => {
    const nameKey = placeName.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
    const seed = seedRawMap?.get(nameKey);
    if (seed) return seed;
    // dbMatch의 googlePlaceId로도 검색
    if (dbMatch?.googlePlaceId) {
      for (const [, s] of (seedRawMap || new Map())) {
        if (s.googlePlaceId === dbMatch.googlePlaceId) return s;
      }
    }
    return null;
  };

  for (const { place, dbMatch, needsGoogle } of matchResults) {
    const nameLower = place.name.toLowerCase().trim();

    if (dbMatch) {
      // ⚠️ 수정금지(승인필요) 2026-05-06 = dbMatch = seedDirectMatch (= place_seed_raw 행)
      // place_seed_raw shape 만 사용 = places 테이블 필드 (buzzScore, finalScore, priceLevel) 폐기
      matched++;
      const seed = dbMatch;
      const reviewCount = seed.googleReviewCount ?? 0;

      enriched.push({
        ...place,
        sourceType: 'Gemini AI + DB Enriched',
        description: (seed.summaryKo || seed.editorialSummary || place.description) ?? '',
        image: seed.imageUrl || place.image || '',
        userRatingCount: reviewCount,
        confidenceScore: Math.max(place.confidenceScore, 7),
        googleMapsUrl: place.googleMapsUrl,
        lat: parseFloat(String(seed.latitude)) || place.lat,
        lng: parseFloat(String(seed.longitude)) || place.lng,
        selectionReasons: [
          ...(place.selectionReasons || []),
          `📊 사용자 검증 SSOT (rank ${seed.rank ?? '-'}, ${seed.collectionPhase}, 리뷰 ${reviewCount.toLocaleString()}개)`,
        ],
        confidenceLevel: 'high' as const,
      });
    } else if (needsGoogle) {
      const googleResult = googleResults.get(place.name);
      if (googleResult) {
        googleFetched++;

        // ⚠️ 수정금지(승인필요) 2026-05-06 = gid 역매칭 (= dbPlacesMap) 폐기
        // = sole SSOT = place_seed_raw → Google fallback 결과 그대로 사용
        enriched.push({
          ...place,
          sourceType: 'Gemini AI + Google Places',
          lat: googleResult.lat,
          lng: googleResult.lng,
          image: googleResult.photoUrl || place.image || '',
          googleMapsUrl: googleResult.googleMapsUri || place.googleMapsUrl,
          confidenceScore: Math.max(place.confidenceScore, (googleResult.userRatingCount || 0) > 0 ? Math.min(10, 5 + (googleResult.userRatingCount || 0) / 500) : 5),
          userRatingCount: googleResult.userRatingCount || 0,
        });
      } else {
        // 매칭 실패
        const seedDataFallback = getSeedData(place.name);
        unmatchedCount++;
        const finalImg = (seedDataFallback?.evidenceUrl || seedDataFallback?.bestImageUrl || seedDataFallback?.imageUrl || place.image) ?? '';
        console.log(`[AG3-MATCH] ❌ Unmatched: "${place.name}" (Used seed image: ${finalImg ? 'Yes' : 'No'})`);
        enriched.push({
          ...place,
          sourceType: 'Gemini AI (New)',
          image: finalImg,
        });
      }
    } else {
      const seedDataFallback = getSeedData(place.name);
      unmatchedCount++;
      const finalImg = (seedDataFallback?.evidenceUrl || seedDataFallback?.bestImageUrl || seedDataFallback?.imageUrl || place.image) ?? '';
      console.log(`[AG3-MATCH] ❌ No DB/Google: "${place.name}" (Used seed image: ${finalImg ? 'Yes' : 'No'})`);
      enriched.push({
        ...place,
        sourceType: 'Gemini AI (New)',
        image: finalImg,
      });
    }
  }

  // === 4단계: 이미지 빈칸 방지 — 선정된 장소는 반드시 사진 있어야 함 ===
  // Instagram 깨진 URL 사전 필터: instagram.com/p/xxx 형식은 실제 이미지 아님
  for (let i = 0; i < enriched.length; i++) {
    const img = enriched[i].image || '';
    if (img && img.includes('instagram.com/p/') && !img.includes('cdninstagram') && !img.includes('fbcdn.net')) {
      enriched[i] = { ...enriched[i], image: '' };
    }
  }

  const needsPhoto = enriched.filter((p) => !p.image || p.image.trim() === '');
  if (needsPhoto.length > 0) {
    const _pt0 = Date.now();
    // Wikipedia REST API: 무료, 영구 URL — 유명 관광지 대부분 커버
    const fetchWikipediaImage = async (placeName: string): Promise<string | null> => {
      try {
        const normalized = placeName.normalize('NFC').replace(/ /g, '_');
        const encoded = encodeURIComponent(normalized);
        const langs = ['en', 'ko']; // 영어 먼저, 없으면 한국어 시도
        for (const lang of langs) {
          const res = await Promise.race([
            fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
              headers: { 'User-Agent': 'NubiApp/1.0 (travel app; contact@nubi.app)' }
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)), // 타임아웃 5초로 증대
          ]) as any;
          if (res?.ok) {
            const data = await res.json();
            const url = data.thumbnail?.source || data.originalimage?.source;
            // Wikipedia 이미지 해상도 업그레이드: /320px- → /800px-
            const finalUrl = url ? url.replace(/\/\d+px-/, '/800px-') : null;
            if (finalUrl && isUsableImageUrl(finalUrl)) return finalUrl;
          }
        }
        return null;
      } catch { return null; }
    };

    // 병렬 처리 (Wikipedia 5개 + Google Places 2개 동시)
    const BATCH_SIZE = 5;
    for (let i = 0; i < needsPhoto.length; i += BATCH_SIZE) {
      const batch = needsPhoto.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (p) => {
          // 1차: Wikipedia (빠름, 무료, 영구)
          const wikiUrl = await fetchWikipediaImage(p.name);
          if (wikiUrl && isUsableImageUrl(wikiUrl)) {
            const idx = enriched.findIndex((e) => e.name === p.name && e.lat === p.lat);
            if (idx >= 0) enriched[idx] = { ...enriched[idx], image: wikiUrl };
            return;
          }
          // 2차: Google Places API (비용 발생, 한도 내에서만)
          const res = await Promise.race([
            searchPlaceByName(p.name, cityName),
            new Promise<Awaited<ReturnType<typeof searchPlaceByName>>>((r) => setTimeout(() => r(null), 2500)),
          ]);
          if (res?.photoUrl) {
            const idx = enriched.findIndex((e) => e.name === p.name && e.lat === p.lat);
            if (idx >= 0) enriched[idx] = { ...enriched[idx], image: res.photoUrl };
          }
        })
      );
    }
    const filled = enriched.filter((p) => p.image?.trim()).length;
    console.log(`[AG3] 📷 이미지 보강: ${needsPhoto.length}곳 시도 → ${filled}/${enriched.length}곳 확보 (${Date.now() - _pt0}ms)`);
  }

  console.log(`[AG3] 최종: ${matched}곳 DB, ${googleFetched}곳 Google, ${unmatchedCount}곳 원본 (${Date.now() - _t0}ms)`);
  return enriched;
}

/**
 * AG3: 미등록 장소 DB 자동 저장 (백그라운드)
 * Gemini AI (New) + Gemini AI + Google Places 모두 저장 대상
 */
export async function saveNewPlacesToDB(
  newPlaces: PlaceResult[],
  cityId: number | null
): Promise<void> {
  if (!db || !cityId) {
    console.log(`[AG3-SAVE] skip cityId=${cityId} db=${!!db} count=${newPlaces.length}`);
    return;
  }

  // 디버그: sourceType 분포
  const srcTypes: Record<string, number> = {};
  for (const p of newPlaces) srcTypes[p.sourceType || 'undef'] = (srcTypes[p.sourceType || 'undef'] || 0) + 1;
  console.log(`[AG3-SAVE] cityId=${cityId} count=${newPlaces.length} sourceTypes=${JSON.stringify(srcTypes)}`);

  // DB에 이미 있는 장소('DB Enriched')를 제외한 나머지 저장
  const toSave = newPlaces.filter(p =>
    p.sourceType === 'Gemini AI (New)' ||
    p.sourceType === 'Gemini AI + Google Places'
  );
  if (toSave.length === 0) {
    console.log(`[AG3-SAVE] toSave=0 (= 모두 DB Enriched 또는 다른 type)`);
    return;
  }

  console.log(`[AG3-SAVE] toSave=${toSave.length} 행 = setTimeout 100ms 후 INSERT 시작`);
  // 🔗 백그라운드 저장 (응답 속도에 영향 없음, aliases 포함)
  setTimeout(async () => {
    let saved = 0, skipped = 0;
    let error = '';
    for (const place of toSave) {
      // 좌표가 없는 장소는 저장하지 않음 (의미 없음)
      if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) { skipped++; continue; }

      try {
        // ⚠️ 수정금지(승인필요) 2026-05-06 = SSOT 통합 = place_seed_raw 자동 학습
        // collection_phase='auto-learn-2026-05'
        // rank = 9000+ 순차 (= 사용자 검증 top 20 영역 X = 후보 풀)
        // 카테고리 추론 = tags 기반 (= seed_category 와 일치)
        const seedCategory = place.tags?.includes('restaurant') ? 'restaurant'
          : place.tags?.includes('food') ? 'restaurant'
          : 'attraction';

        // 다음 rank 번호 = (city, cat, auto-learn) 최대 + 1, 없으면 9000
        const nextRankRow = await db!.execute(
          sql`SELECT COALESCE(MAX(rank), 8999) + 1 AS next_rank FROM place_seed_raw
              WHERE city_id = ${cityId} AND seed_category = ${seedCategory}
              AND collection_phase = 'auto-learn-2026-05'`
        );
        const nextRank = (nextRankRow as any).rows?.[0]?.next_rank ?? 9000;

        await db!.insert(placeSeedRaw).values({
          cityId: cityId,
          seedCategory,
          collectionPhase: 'auto-learn-2026-05',
          rank: nextRank,
          nameEn: place.name,
          nameKo: null,
          address: (place as any).geminiAddress || null,
          latitude: place.lat,
          longitude: place.lng,
          imageUrl: place.image || null,
          googlePlaceId: (place as any).googlePlaceId || null,
          editorialSummary: place.description || place.personaFitReason || null,
          summaryKo: null,
          googleReviewCount: place.userRatingCount || 0,
        }).onConflictDoNothing();
        saved++;
      } catch (e) {
        if (!error) error = (e as Error).message;
      }
    }
    console.log(`[AG3] 🆕 saved=${saved} skipped=${skipped} error="${error}"`);
  }, 100);
}
