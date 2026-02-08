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
import { places, cities } from '@shared/schema';
import { eq, ilike, sql } from 'drizzle-orm';
import type { AG1Output, AG3PreOutput, AG3Output, PlaceResult, ScheduleSlot } from './types';
import { findCityUnified, addPlaceAlias, type CityResolveResult } from '../city-resolver';

// Google Places API 키
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
    return { cityId: null, dbPlacesMap: new Map(), cityName: destination };
  }

  try {
    // 1. 🔗 통합 도시 검색 (영어 "Paris" → 한국어 "파리" DB 모두 매칭)
    const cityResult = await findCityUnified(destination);
    let cityId: number | null = cityResult?.cityId || null;
    const dbPlacesMap = new Map<string, any>();

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

    // 2. 해당 도시의 모든 장소 사전 로드 (name + aliases + googlePlaceId 모두 키로)
    if (cityId) {
      const dbPlaces = await db.select().from(places)
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

      const cityLabel = cityResult ? `${cityResult.name}/${cityResult.nameEn}` : destination;
      console.log(`[AG3-pre] ✅ 도시 "${cityLabel}" (ID: ${cityId}) 장소 ${dbPlaces.length}곳 사전 로드, 매칭키 ${dbPlacesMap.size}개 (${Date.now() - _t0}ms)`);
    } else {
      console.log(`[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`);
    }

    return { cityId, dbPlacesMap, cityName: cityResult?.nameEn || destination };
  } catch (error) {
    console.error('[AG3-pre] DB 사전 로드 실패:', error);
    return { cityId: null, dbPlacesMap: new Map(), cityName: destination };
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

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos,places.googleMapsUri,places.rating,places.userRatingCount',
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
      rating: result.rating,
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
  const { dbPlacesMap, cityName } = preloaded;

  let matched = 0;
  let googleFetched = 0;
  let unmatchedCount = 0;

  const enriched: PlaceResult[] = [];

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

    // 3. 💰 Fuzzy 매칭 (비용 절감: DB 매칭률 극대화)
    // "Eiffel Tower" vs "Tour Eiffel", 공백/특수문자 무시, 단어 순서 무관
    if (!dbMatch && dbPlacesMap.size > 0) {
      const nameWords = nameLower.replace(/[^a-z0-9가-힣\s]/gi, '').split(/\s+/).filter(w => w.length > 2);
      let bestScore = 0;
      let bestMatch: any = undefined;

      for (const [key, val] of dbPlacesMap) {
        // Google Place ID는 스킵 (이름 비교만)
        if (key.startsWith('chij') || key.startsWith('place')) continue;

        const keyWords = key.replace(/[^a-z0-9가-힣\s]/gi, '').split(/\s+/).filter(w => w.length > 2);
        if (keyWords.length === 0) continue;

        // 공통 단어 수 계산
        const commonWords = nameWords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
        const score = commonWords.length / Math.max(nameWords.length, keyWords.length);

        if (score > bestScore && score >= 0.5) { // 50% 이상 단어 일치
          bestScore = score;
          bestMatch = val;
        }
      }

      if (bestMatch) {
        dbMatch = bestMatch;
        console.log(`[AG3] 🔗 Fuzzy 매칭: "${place.name}" → "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
      }
    }

    if (dbMatch) {
      // ✅ DB 매칭 성공 → DB 데이터로 보강 + 🔗 별칭 자동 학습
      matched++;
      
      // 별칭 자동 학습: AG2가 준 이름이 DB name과 다르면 aliases에 추가
      if (dbMatch.id && nameLower !== dbMatch.name.toLowerCase()) {
        addPlaceAlias(dbMatch.id, place.name).catch(() => {});
      }

      // DB에서 가져올 수 있는 모든 필수 데이터 활용
      const dbRating = dbMatch.rating ?? 0;
      const dbReviewCount = dbMatch.userRatingCount ?? 0;
      const dbDescription = dbMatch.editorialSummary || place.description;
      
      enriched.push({
        ...place,
        sourceType: 'Gemini AI + DB Enriched',
        description: dbDescription,
        image: (dbMatch.photoUrls?.length > 0) ? dbMatch.photoUrls[0] : place.image,
        vibeScore: dbMatch.vibeScore || place.vibeScore,
        finalScore: dbMatch.finalScore || place.finalScore || 0,
        confidenceScore: Math.max(place.confidenceScore, dbRating ? dbRating * 2 : (dbMatch.buzzScore ? Math.min(10, dbMatch.buzzScore) : 0)),
        googleMapsUrl: dbMatch.googleMapsUri || place.googleMapsUrl,
        lat: dbMatch.latitude || place.lat,
        lng: dbMatch.longitude || place.lng,
        selectionReasons: [
          ...(place.selectionReasons || []),
          dbRating > 0 
            ? `⭐ Google ${dbRating.toFixed(1)}점 (${dbReviewCount.toLocaleString()}리뷰) | DB 검증` 
            : `📊 DB 검증 완료 (buzzScore: ${(dbMatch.buzzScore || 0).toFixed(1)})`,
        ],
        confidenceLevel: (dbMatch.finalScore && dbMatch.finalScore > 5) ? 'high' as const :
          (dbRating >= 4.0) ? 'high' as const :
          (dbMatch.buzzScore && dbMatch.buzzScore > 3) ? 'medium' as const :
          place.confidenceLevel || 'low' as const,
      });
    } else if (!place.lat || !place.lng || place.lat === 0 || place.lng === 0) {
      // ❌ DB 미등록 + 좌표 없음 → Google Places API로 좌표 + gid 확보
      const googleResult = await searchPlaceByName(place.name, cityName);
      if (googleResult) {
        googleFetched++;

        // 🔗 gid 획득 후 DB에서 역매칭 시도 (이미 다른 이름으로 저장되어 있을 수 있음)
        if (googleResult.googlePlaceId && dbPlacesMap.size > 0) {
          const gidMatch = dbPlacesMap.get(googleResult.googlePlaceId.toLowerCase());
          if (gidMatch) {
            console.log(`[AG3] 🔗 gid 역매칭 성공: "${place.name}" → DB "${gidMatch.name}" (gid: ${googleResult.googlePlaceId.slice(0, 20)}...)`);
            // 별칭 자동 학습
            if (gidMatch.id) addPlaceAlias(gidMatch.id, place.name).catch(() => {});
            matched++;
            enriched.push({
              ...place,
              sourceType: 'Gemini AI + DB Enriched (gid)',
              lat: gidMatch.latitude || googleResult.lat,
              lng: gidMatch.longitude || googleResult.lng,
              image: (gidMatch.photoUrls?.length > 0) ? gidMatch.photoUrls[0] : googleResult.photoUrl || place.image,
              googleMapsUrl: gidMatch.googleMapsUri || googleResult.googleMapsUri || place.googleMapsUrl,
              confidenceScore: Math.max(place.confidenceScore, gidMatch.rating ? gidMatch.rating * 2 : 5),
            });
            continue;
          }
        }

        enriched.push({
          ...place,
          sourceType: 'Gemini AI + Google Places',
          lat: googleResult.lat,
          lng: googleResult.lng,
          image: googleResult.photoUrl || place.image,
          googleMapsUrl: googleResult.googleMapsUri || place.googleMapsUrl,
          confidenceScore: Math.max(place.confidenceScore, googleResult.rating ? googleResult.rating * 2 : 5),
        });
        console.log(`[AG3] 🔍 Google Places 확보: ${place.name} (gid: ${googleResult.googlePlaceId?.slice(0, 20) || 'none'})`);
      } else {
        unmatchedCount++;
        enriched.push({
          ...place,
          sourceType: 'Gemini AI (New)',
        });
      }
    } else {
      // DB 미등록이지만 좌표는 있음 → Gemini 원본 유지
      unmatchedCount++;
      enriched.push({
        ...place,
        sourceType: 'Gemini AI (New)',
      });
    }
  }

  console.log(`[AG3] DB 매칭 완료: ${matched}곳 DB보강, ${googleFetched}곳 Google확보, ${unmatchedCount}곳 원본`);
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
