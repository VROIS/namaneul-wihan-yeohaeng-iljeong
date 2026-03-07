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
import { eq, ilike, sql, inArray } from 'drizzle-orm';
import type { AG1Output, AG3PreOutput, AG3Output, PlaceResult, ScheduleSlot } from './types';
import { findCityUnified, addPlaceAlias, type CityResolveResult } from '../city-resolver';

/** <img>로 사용 가능한 URL인지 (인스타 post URL, 네이버/티스토리 등 차단 도메인 제외) */
function isUsableImageUrl(url: string): boolean {
  const u = url.toLowerCase().trim();
  if (!u) return false;
  if (u.includes('example.com')) return false;
  // 🚫 전멸 확인된 소스 차단 (0013 DB 정리와 동일)
  if (u.includes('places.googleapis.com') || u.includes('maps.googleapis.com')) return false;
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

    // 2. 해당 도시의 모든 장소 사전 로드 (rating 컬럼 제외 - Supabase 미존재)
    let dbPlaces: { id: number; name: string }[] = [];
    if (cityId) {
      dbPlaces = await db.select({
        id: places.id,
        name: places.name,
        displayNameKo: places.displayNameKo,
        aliases: places.aliases,
        type: places.type,
        latitude: places.latitude,
        longitude: places.longitude,
        googlePlaceId: places.googlePlaceId,
        googleMapsUri: places.googleMapsUri,
        photoUrls: places.photoUrls,
        instagramPhotoUrls: places.instagramPhotoUrls,
        vibeScore: places.vibeScore,
        buzzScore: places.buzzScore,
        finalScore: places.finalScore,
        editorialSummary: places.editorialSummary,
        userRatingCount: places.userRatingCount,
        vibeKeywords: places.vibeKeywords,
        cityId: places.cityId,
        priceLevel: places.priceLevel,
        address: places.address,
      }).from(places)
        .where(eq(places.cityId, cityId));

      for (const p of dbPlaces) {
        // name 키 (소문자)
        dbPlacesMap.set(p.name.toLowerCase(), p);
        // googlePlaceId 키
        if (p.googlePlaceId) {
          dbPlacesMap.set(p.googlePlaceId.toLowerCase(), p);
        }
        // displayNameKo 키 (한국어)
        if ((p as any).displayNameKo) {
          dbPlacesMap.set((p as any).displayNameKo.toLowerCase(), p);
        }
        // aliases 키 (별칭 배열)
        const placeAliases: string[] = (p as any).aliases || [];
        for (const alias of placeAliases) {
          if (alias) dbPlacesMap.set(alias.toLowerCase(), p);
        }
      }

      // 셀럽 인스타 이미지 (최상순위 노출)
      if (dbPlaces.length > 0 && db) {
        try {
          const placeIds = dbPlaces.map((p) => p.id);
          const evidence = await db
            .select({ placeId: celebrityPlaceEvidence.placeId, imageUrl: celebrityPlaceEvidence.imageUrl })
            .from(celebrityPlaceEvidence)
            .where(inArray(celebrityPlaceEvidence.placeId, placeIds));
          for (const e of evidence) {
            if (e.imageUrl && !celebrityImageMap.has(e.placeId)) {
              celebrityImageMap.set(e.placeId, e.imageUrl);
            }
          }
          if (celebrityImageMap.size > 0) {
            console.log(`[AG3-pre] 🌟 셀럽 인스타 이미지 ${celebrityImageMap.size}곳`);
          }
        } catch (e) {
          console.warn(`[AG3-pre] 셀럽 이미지 조회 실패:`, (e as Error)?.message);
        }
      }

      const cityLabel = cityResult ? `${cityResult.name}/${cityResult.nameEn}` : destination;
      console.log(`[AG3-pre] ✅ 도시 "${cityLabel}" (ID: ${cityId}) 장소 ${dbPlaces.length}곳 사전 로드, 매칭키 ${dbPlacesMap.size}개 (${Date.now() - _t0}ms)`);
    } else {
      console.log(`[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`);
    }

    // place_images 통합 테이블 (인스타 우선) — 장소별 sort_order 최상 1개
    if (cityId && dbPlaces && dbPlaces.length > 0) {
      try {
        const placeIds = dbPlaces.map((p) => p.id);
        const imgRows = await db
          .select({ placeId: placeImages.placeId, url: placeImages.url, sortOrder: placeImages.sortOrder })
          .from(placeImages)
          .where(inArray(placeImages.placeId, placeIds))
          .orderBy(placeImages.sortOrder);
        let skippedUnusable = 0;
        for (const row of imgRows) {
          if (!row.placeId || !row.url || placeImageMap.has(row.placeId)) continue;
          if (!isUsableImageUrl(row.url)) {
            skippedUnusable++;
            continue;
          }
          placeImageMap.set(row.placeId, row.url);
        }
        if (skippedUnusable > 0) {
          console.log(`[AG3-pre] 📷 place_images: img 불가 URL ${skippedUnusable}건 제외`);
        }
        if (placeImageMap.size > 0) {
          console.log(`[AG3-pre] 📷 place_images ${placeImageMap.size}곳`);
        }
      } catch (e) {
        console.warn(`[AG3-pre] place_images 조회 실패:`, (e as Error)?.message);
      }
    }

    // 3. place_seed_raw 통합본(전시 매장) 사전 로드 (15초 쿼리 대체용)
    if (cityId) {
      try {
        const _t1 = Date.now();
        const seeds = await db.select({
          id: placeSeedRaw.id,
          nameEn: placeSeedRaw.nameEn,
          nameKo: placeSeedRaw.nameKo,
          nameLocal: placeSeedRaw.nameLocal,
          googlePlaceId: placeSeedRaw.googlePlaceId,
          imageUrl: placeSeedRaw.imageUrl,
          bestImageUrl: placeSeedRaw.bestImageUrl,
          evidenceUrl: placeSeedRaw.evidenceUrl,
          nubiReason: placeSeedRaw.nubiReason,
          sourceType: placeSeedRaw.sourceType,
          priceEur: placeSeedRaw.priceEur,
          priceSource: placeSeedRaw.priceSource,
          instagramPostUrl: placeSeedRaw.instagramPostUrl,
          tiktokPostUrl: placeSeedRaw.tiktokPostUrl
        }).from(placeSeedRaw).where(eq(placeSeedRaw.cityId, cityId));
        for (const s of seeds) {
          const makeKey = (name: string | null) => name ? name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
          const keyEn = makeKey(s.nameEn);
          const keyKo = makeKey(s.nameKo);
          if (keyEn) seedRawMap.set(keyEn, s);
          if (keyKo) seedRawMap.set(keyKo, s);
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
  cityName: string
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

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos,places.googleMapsUri,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: `${placeName} ${cityName}`,
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

    // 1. 정확 매칭
    let dbMatch = dbPlacesMap.size > 0 ? dbPlacesMap.get(nameLower) : undefined;

    // 2. 부분 매칭 (포함 관계)
    if (!dbMatch && dbPlacesMap.size > 0) {
      for (const [key, val] of dbPlacesMap) {
        if (key.includes(nameLower) || nameLower.includes(key)) {
          dbMatch = val;
          break;
        }
      }
    }

    // 3. Fuzzy 매칭
    if (!dbMatch && dbPlacesMap.size > 0) {
      const nameWords = nameLower.replace(/[^a-z0-9가-힣\s]/gi, '').split(/\s+/).filter(w => w.length > 2);
      let bestScore = 0;
      let bestMatch: any = undefined;

      for (const [key, val] of dbPlacesMap) {
        if (key.startsWith('chij') || key.startsWith('place')) continue;
        const keyWords = key.replace(/[^a-z0-9가-힣\s]/gi, '').split(/\s+/).filter(w => w.length > 2);
        if (keyWords.length === 0) continue;
        const commonWords = nameWords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
        const score = commonWords.length / Math.max(nameWords.length, keyWords.length);
        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestMatch = val;
        }
      }

      const FUZZY_THRESHOLD = 0.7;
      if (bestMatch && bestScore >= FUZZY_THRESHOLD) {
        dbMatch = bestMatch;
        console.log(`[AG3] 🔗 Fuzzy: "${place.name}" → "${dbMatch.name}" (Score: ${bestScore.toFixed(2)})`);
      } else if (bestMatch) {
        console.log(`[AG3] ⚠️ Fuzzy reject: "${place.name}" vs "${bestMatch.name}" (Score: ${bestScore.toFixed(2)} < ${FUZZY_THRESHOLD})`);
      }
    }

    const needsGoogle = !dbMatch && (!place.lat || !place.lng || place.lat === 0 || place.lng === 0);
    matchResults.push({ place, dbMatch: dbMatch || null, needsGoogle });
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
      const batchPromises = batch.map(r =>
        Promise.race([
          searchPlaceByName(r.place.name, cityName),
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
      matched++;
      if (dbMatch.id && nameLower !== dbMatch.name.toLowerCase()) {
        addPlaceAlias(dbMatch.id, place.name).catch(() => { });
      }
      // rating 컬럼은 DB에서 제외됨 → buzzScore/finalScore 기반 신뢰도 산출
      const dbBuzz = dbMatch.buzzScore ?? 0;
      const dbFinal = dbMatch.finalScore ?? 0;
      const dbReviewCount = dbMatch.userRatingCount ?? 0;

      // place_seed_raw 데이터 우선 조회 (1, 2, 3순위)
      const seedData = getSeedData(place.name, dbMatch);
      const seedEvid = seedData?.evidenceUrl;
      const seedBest = seedData?.bestImageUrl;
      const seedImg = seedData?.imageUrl;

      enriched.push({
        ...place,
        sourceType: 'Gemini AI + DB Enriched',
        description: (seedData?.nubiReason || dbMatch.editorialSummary || place.description) ?? '',
        image: resolvePlaceImage(
          seedEvid,                          // 1순위: evidence_url
          seedBest,                          // 2순위: best_image_url
          seedImg,                           // 3순위: image_url
          placeImageMap?.get(dbMatch.id),    // 4-1순위: place_images
          dbMatch.photoUrls,                 // 4-2순위: photoUrls
          place.image                        // 5순위: Gemini
        ) ?? place.image ?? '',
        vibeScore: dbMatch.vibeScore || place.vibeScore,
        finalScore: dbFinal || place.finalScore || 0,
        buzzScore: dbBuzz,
        userRatingCount: dbReviewCount,
        confidenceScore: Math.max(place.confidenceScore, dbBuzz ? Math.min(10, dbBuzz) : 0),
        googleMapsUrl: dbMatch.googleMapsUri || place.googleMapsUrl,
        lat: dbMatch.latitude || place.lat,
        lng: dbMatch.longitude || place.lng,
        ...(dbMatch.priceLevel != null && { priceLevel: dbMatch.priceLevel }),
        selectionReasons: [
          ...(place.selectionReasons || []),
          dbFinal > 0
            ? `📊 Nubi 점수 ${dbFinal.toFixed(1)} (buzz: ${dbBuzz.toFixed(1)}, 리뷰 ${dbReviewCount.toLocaleString()}개) | DB 검증`
            : `📊 DB 검증 완료 (buzzScore: ${dbBuzz.toFixed(1)})`,
        ],
        confidenceLevel: (dbFinal > 5) ? 'high' as const :
          (dbBuzz > 3) ? 'medium' as const :
            place.confidenceLevel || 'low' as const,
      });
    } else if (needsGoogle) {
      const googleResult = googleResults.get(place.name);
      if (googleResult) {
        googleFetched++;

        // gid 역매칭 시도
        if (googleResult.googlePlaceId && dbPlacesMap.size > 0) {
          const gidMatch = dbPlacesMap.get(googleResult.googlePlaceId.toLowerCase());
          if (gidMatch) {
            console.log(`[AG3] 🔗 gid 역매칭: "${place.name}" → "${gidMatch.name}"`);
            if (gidMatch.id) addPlaceAlias(gidMatch.id, place.name).catch(() => { });
            matched++;
            const seedDataGid = getSeedData(place.name, gidMatch);
            enriched.push({
              ...place,
              sourceType: 'Gemini AI + DB Enriched (gid)',
              lat: gidMatch.latitude || googleResult.lat,
              lng: gidMatch.longitude || googleResult.lng,
              image: resolvePlaceImage(
                seedDataGid?.evidenceUrl,
                seedDataGid?.bestImageUrl,
                seedDataGid?.imageUrl,
                placeImageMap?.get(gidMatch.id),
                gidMatch.photoUrls,
                googleResult.photoUrl,
                place.image
              ) ?? place.image ?? '',
              googleMapsUrl: gidMatch.googleMapsUri || googleResult.googleMapsUri || place.googleMapsUrl,
              confidenceScore: Math.max(place.confidenceScore, gidMatch.buzzScore ? Math.min(10, gidMatch.buzzScore) : 5),
              buzzScore: gidMatch.buzzScore ?? 0,
              userRatingCount: gidMatch.userRatingCount || googleResult.userRatingCount || 0,
              finalScore: gidMatch.finalScore ?? 0,
              ...(gidMatch.priceLevel != null && { priceLevel: gidMatch.priceLevel }),
            });
            continue;
          }
        }

        // Google만 매칭된 경우도 seed 데이터 시도
        const seedDataGoogle = getSeedData(place.name);
        enriched.push({
          ...place,
          sourceType: 'Gemini AI + Google Places',
          lat: googleResult.lat,
          lng: googleResult.lng,
          image: resolvePlaceImage(
            seedDataGoogle?.evidenceUrl,
            seedDataGoogle?.bestImageUrl,
            seedDataGoogle?.imageUrl,
            null,
            null,
            googleResult.photoUrl,
            place.image
          ) || googleResult.photoUrl || place.image,
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
  if (!db || !cityId) return;

  // DB에 이미 있는 장소('DB Enriched')를 제외한 나머지 저장
  const toSave = newPlaces.filter(p =>
    p.sourceType === 'Gemini AI (New)' ||
    p.sourceType === 'Gemini AI + Google Places'
  );
  if (toSave.length === 0) return;

  // 🔗 백그라운드 저장 (응답 속도에 영향 없음, aliases 포함)
  setTimeout(async () => {
    let saved = 0;
    for (const place of toSave) {
      // 좌표가 없는 장소는 저장하지 않음 (의미 없음)
      if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) continue;

      try {
        // 🔗 Agent Protocol: aliases에 원래 이름 저장 (다음번 매칭용)
        const aliases: string[] = [];
        if (place.name) aliases.push(place.name);

        await db!.insert(places).values({
          cityId: cityId,
          name: place.name,
          aliases: aliases,
          type: place.tags?.includes('restaurant') ? 'restaurant' as const :
            place.tags?.includes('cafe') ? 'cafe' as const :
              place.tags?.includes('landmark') ? 'landmark' as const :
                'attraction' as const,
          latitude: place.lat,
          longitude: place.lng,
          editorialSummary: place.description || place.personaFitReason,
          vibeKeywords: place.vibeTags || place.tags || [],
          vibeScore: place.vibeScore || 0,
          buzzScore: 0,
          googleMapsUri: place.googleMapsUrl || undefined,
          photoUrls: place.image ? [place.image] : [],
        }).onConflictDoNothing();
        saved++;
      } catch (e) {
        // 저장 실패 무시
      }
    }
    if (saved > 0) {
      console.log(`[AG3] 🆕 ${saved}곳 DB 자동 저장 (aliases 포함, 다음번 활용)`);
    }
  }, 100);
}
