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
// ⚠️ 수정금지(승인필요) 2026-05-09 = AG3 saveNewPlacesToDB = 어제 21 식당 패턴 그대로 (= 자체 fetch = googlePlacesFetcher 사용 X)

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
          // ⚠️ 수정금지(승인필요) 2026-05-08 = 사용자 의도 = 자연 확대 식당 매칭 포함
          // = restaurant = phase 무관 = 모든 곳 (= bts2026 정정 + 어제 INSERT rank 9100+ 또는 70345+ 포함)
          // = 명소 = gemini3-2026-05 + auto-learn-2026-05 phase 만 (= top 20 또는 9000+)
          sql`(
            ${placeSeedRaw.seedCategory} = 'restaurant'
            OR (
              ${placeSeedRaw.collectionPhase} IN ('gemini3-2026-05', 'auto-learn-2026-05')
              AND (${placeSeedRaw.collectionPhase} = 'auto-learn-2026-05' OR ${placeSeedRaw.rank} BETWEEN 1 AND 20)
            )
          )`
        ));
        for (const s of seeds) {
          // ⚠️ 수정금지(승인필요) 2026-05-09 = 이름 매칭 보강 = 정규화 + 악센트 제거 (= 사용자 SSOT = 좌표 X, 이름+address ✓)
          // = 정규화 키 = 공백/문장부호 제거 + 소문자
          // = 악센트 제거 키 = "Sacré-Cœur" ↔ "Sacre Coeur" 호환
          const norm = (name: string | null) => name ? name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
          const noAccent = (name: string | null) => name ? name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
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
 * ⚠️ 수정금지(승인필요) 2026-05-08 = 사용자 명시 = searchText fallback 폐기
 * Google Place Details (Get Place) = place_id 직접 → 좌표 + photo + 리뷰 1 회
 * = AG2 Gemini 응답의 place_id (= googleSearch grounding = 환각 0 검증) 활용
 * = SKU 단가 = $0.017/req (= searchText $0.032 대비 47% 절감)
 */
async function getPlaceDetailsById(
  placeId: string,
  placeName: string  // 로깅용
): Promise<{ lat: number; lng: number; photoUrl: string; googleMapsUri: string; googlePlaceId: string; userRatingCount?: number } | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;
  if (!placeId || !placeId.startsWith('ChIJ')) return null;

  // 💰 비용 보호: 일일 Places API 한도 체크 (google-places.ts와 공유)
  if (!apiCallTracker.canMakeRequest()) {
    apiCallTracker.recordBlocked();
    console.warn(`[AG3] ⚠️ Places API 일일 한도 초과 — ${placeName} 건너뜀`);
    return null;
  }
  apiCallTracker.recordCall();

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        // ⚠️ 수정금지(승인필요) fieldMask 항상 명시 = Pro SKU = Atmosphere 차단
        'X-Goog-FieldMask': 'id,displayName,location,photos.name,googleMapsUri,userRatingCount',
      },
    });

    if (!response.ok) return null;

    const result = await response.json();
    if (!result?.location) return null;

    const photoUrl = result.photos?.[0]?.name
      ? `https://places.googleapis.com/v1/${result.photos[0].name}/media?maxHeightPx=400&key=${apiKey}`
      : '';

    return {
      lat: result.location.latitude,
      lng: result.location.longitude,
      photoUrl,
      googleMapsUri: result.googleMapsUri || '',
      googlePlaceId: result.id || placeId,
      userRatingCount: result.userRatingCount,
    };
  } catch (error) {
    console.warn(`[AG3] Place Details 실패 (${placeName}, ${placeId}):`, error);
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

    // ⚠️ 수정금지(승인필요) 2026-05-14 = 사용자 SSOT 통합 매칭 = 행정주소 > 이름 > 좌표 10m
    // = 4 순위 = TS+PM (= matchResults 의 needsGoogle = true 시 = 별도 단계)
    // = place_id 매칭 = v3 prompt 에서 제거됨 (= Gemini 가짜 위험 = TS 이후만 신뢰)
    let seedDirectMatch: any = null;
    const geminiAddress = (place as any).geminiAddress || (place as any).address;
    console.log(`[AG3-DEBUG] "${place.name}" geminiAddress="${(geminiAddress || '').slice(0,60)}" seedMapSize=${seedRawMap?.size ?? 0}`);

    // 1 순위 = 행정주소 일치 (= 사용자 SSOT)
    const isSpecificAddress = (a: string) => {
      const trimmed = a.trim();
      if (trimmed.length < 15) return false;
      if (/^\d{5}\s/.test(trimmed)) return false;
      return /(rue|av\.|bd\.|pl\.|place|avenue|boulevard|street|road|st\.|quai|pont|chemin|passage|allee|champ|cour|coulée|coulee|cours|jardin|parc|park|garden|esplanade|promenade|sentier|piste|berge|impasse|porte|port|via|piazza|strasse|str\.)/i.test(trimmed);
    };
    if (geminiAddress && seedRawMap && seedRawMap.size > 0 && isSpecificAddress(geminiAddress)) {
      const addrLower = geminiAddress.toLowerCase().replace(/\s+/g, ' ').trim();
      const nameSimilar = (rowNameEn: string | null) => {
        if (!rowNameEn) return true;
        const rn = rowNameEn.toLowerCase();
        const gn = nameLower;
        if (rn.includes(gn) || gn.includes(rn)) return true;
        const rWords = rn.split(/\s+/).filter(w => w.length >= 3);
        const gWords = gn.split(/\s+/).filter(w => w.length >= 3);
        return rWords.some(w => gWords.includes(w));
      };
      const exact = seedRawMap.get(`addr:${addrLower}`);
      if (exact && nameSimilar(exact.nameEn)) {
        seedDirectMatch = exact;
        console.log(`[AG3] 🏠 1순위 행정주소 정확 매칭: "${place.name}"`);
      }
      if (!seedDirectMatch) {
        for (const [key, val] of seedRawMap) {
          if (!key.startsWith('addr:')) continue;
          const dbAddr = key.slice(5);
          if (!isSpecificAddress(dbAddr)) continue;
          if (dbAddr.includes(addrLower) || addrLower.includes(dbAddr)) {
            if (!nameSimilar(val.nameEn)) continue;
            seedDirectMatch = val;
            console.log(`[AG3] 🏠 1순위 행정주소 부분 매칭: "${place.name}"`);
            break;
          }
        }
      }
    }

    // 2 순위 = 이름 매칭 (= name_en + name_local + 악센트 제거)
    if (!seedDirectMatch && seedRawMap && seedRawMap.size > 0) {
      const nameEn = nameLower;
      const nameLocal = ((place as any).nameLocal || '').toLowerCase().trim();
      const norm = (s: string) => s.replace(/[\s\p{P}\p{S}]+/gu, "");
      const noAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\p{P}\p{S}]+/gu, "");
      const tries: string[] = [];
      if (nameEn) { tries.push(norm(nameEn)); tries.push(noAccent(nameEn)); }
      if (nameLocal) { tries.push(norm(nameLocal)); tries.push(noAccent(nameLocal)); }
      for (const k of tries) {
        if (!k) continue;
        const hit = seedRawMap.get(k);
        if (hit) { seedDirectMatch = hit; console.log(`[AG3] 🏷 2순위 이름 매칭: "${place.name}" (key=${k.slice(0,30)})`); break; }
      }
    }

    // 3 순위 = 좌표 10m 매칭 (= 도심 밀집 = 100m 잘못 매칭 회피)
    if (!seedDirectMatch && (place as any).lat && (place as any).lng && seedRawMap && seedRawMap.size > 0) {
      const pLat = parseFloat(String((place as any).lat));
      const pLng = parseFloat(String((place as any).lng));
      if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) {
        for (const [key, val] of seedRawMap) {
          if (!key.startsWith('addr:')) continue;
          const vLat = parseFloat(String(val.latitude));
          const vLng = parseFloat(String(val.longitude));
          if (isNaN(vLat) || isNaN(vLng)) continue;
          // haversine < 10m
          const R = 6371, toRad = (d: number) => d * Math.PI / 180;
          const dLat = toRad(vLat - pLat), dLng = toRad(vLng - pLng);
          const h = Math.sin(dLat/2)**2 + Math.cos(toRad(pLat))*Math.cos(toRad(vLat))*Math.sin(dLng/2)**2;
          const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
          if (km < 0.01) {
            seedDirectMatch = val;
            console.log(`[AG3] 📍 3순위 좌표 10m 매칭: "${place.name}"`);
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

    // ⚠️ 수정금지(승인필요) seedDirectMatch 적용 = 좌표 + 이미지 + pid 즉시 채움 (Google 호출 회피)
    if (seedDirectMatch) {
      // 시드의 좌표 즉시 주입 (= needsGoogle 회피)
      if (seedDirectMatch.latitude && seedDirectMatch.longitude) {
        place.lat = parseFloat(String(seedDirectMatch.latitude));
        place.lng = parseFloat(String(seedDirectMatch.longitude));
      }
      // 사용자 의도 = 정확한 우리 큐레이션 이미지 우선
      if (seedDirectMatch.imageUrl) place.image = seedDirectMatch.imageUrl;
      // ⚠️ 수정금지(승인필요) 2026-05-14 = 모달 정확도 = 검증된 google_place_id 매핑 (= 핫픽스 3)
      // = 누락 시 = 모달 = name+city 검색 fallback = 인근 잘못된 장소 매칭 위험
      if (seedDirectMatch.googlePlaceId) (place as any).googlePlaceId = seedDirectMatch.googlePlaceId;
      if (seedDirectMatch.googleReviewCount) (place as any).userRatingCount = seedDirectMatch.googleReviewCount;
      // ⚠️ 수정금지(승인필요) 2026-05-14 = v3 SSOT = 위트 카피 우선 (= shortform_ko = editorial_summary)
      // = description = editorialSummary 우선 → summary_ko 폴백 (= "프사각" "MZ들" 노출)
      if (seedDirectMatch.editorialSummary) place.description = seedDirectMatch.editorialSummary;
      else if (seedDirectMatch.summaryKo) place.description = seedDirectMatch.summaryKo;
      if (seedDirectMatch.summaryKo) place.personaFitReason = seedDirectMatch.summaryKo;
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
    // ⚠️ 수정금지(승인필요) 2026-05-08 = 사용자 명시 = searchText fallback 폐기
    // = Place Details (place_id 직접) = 단가 47% 절감 + 이름/주소 검색 우회
    // = AG2 Gemini 응답에 place_id 가 있어야 매칭 가능 (= googleSearch grounding = 환각 0 검증)
    // = place_id 없으면 = 매칭 실패 = 카드 placeholder
    const BATCH_SIZE = 5;
    let pidMissing = 0;
    for (let i = 0; i < googleNeeded.length; i += BATCH_SIZE) {
      const batch = googleNeeded.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(r => {
        const pid = (r.place as any).geminiPlaceId;
        if (!pid || !pid.startsWith('ChIJ')) {
          pidMissing++;
          return Promise.resolve();
        }
        return Promise.race([
          getPlaceDetailsById(pid, r.place.name),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]).then(result => {
          if (result) googleResults.set(r.place.name, result);
        }).catch(() => { });
      });
      await Promise.all(batchPromises);
    }
    console.log(`[AG3] Place Details 완료 (${Date.now() - _gt0}ms): ${googleResults.size}/${googleNeeded.length}곳 확보`
      + (pidMissing > 0 ? ` (place_id 없음 skip = ${pidMissing})` : ''));
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

      // ⚠️ 수정금지(승인필요) 2026-05-08 = 가격 필터 활성화
      // editorial_summary 텍스트 "Max €N/person." 첫머리 = estimatedPriceEur 추출
      const priceMatch = String(seed.editorialSummary || '').match(/max\s*€\s*(\d+)/i);
      const estimatedPriceEur = priceMatch ? parseInt(priceMatch[1], 10) : undefined;

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
        estimatedPriceEur,  // ← 가격 필터 활성화
        selectionReasons: [
          ...(place.selectionReasons || []),
          `📊 사용자 검증 SSOT (rank ${seed.rank ?? '-'}, ${seed.collectionPhase}, 리뷰 ${reviewCount.toLocaleString()}개${estimatedPriceEur ? `, €${estimatedPriceEur}/인` : ''})`,
        ],
        confidenceLevel: 'high' as const,
      } as any);
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

    // ⚠️ 수정금지(승인필요) 2026-05-08 = 사용자 명시 = searchText fallback 폐기
    // = 이미지 fallback = Wikipedia (무료) + place_id 있으면 Place Details
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
          // 2차: place_id 있으면 Place Details (= 단가 $0.017 = searchText 대비 47% 절감)
          const pid = (p as any).geminiPlaceId;
          if (!pid || !pid.startsWith('ChIJ')) return;
          const res = await Promise.race([
            getPlaceDetailsById(pid, p.name),
            new Promise<Awaited<ReturnType<typeof getPlaceDetailsById>>>((r) => setTimeout(() => r(null), 2500)),
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

  console.log(`[AG3-SAVE] toSave=${toSave.length} 행 = 즉시 await searchText + PhotoMedia + Storage upload + INSERT 시작`);

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 도시 좌표 사전 조회 (= searchText locationBias 용)
  let cityLat = 0, cityLng = 0, cityName = '';
  try {
    const cityRow = await db!.execute(
      sql`SELECT name_en, latitude, longitude FROM cities WHERE id = ${cityId} LIMIT 1`
    );
    const c = (cityRow as any).rows?.[0];
    if (c) {
      cityLat = parseFloat(c.latitude) || 0;
      cityLng = parseFloat(c.longitude) || 0;
      cityName = c.name_en || '';
    }
  } catch (e) {
    console.warn(`[AG3-SAVE] 도시 좌표 조회 실패`, (e as Error).message);
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = 사용자 명시 = 어제 신규 21 식당 INSERT 패턴 그대로 클론
  // = scripts/_tmp_paris-rest-insert-21new.mjs:95-127 = 헌법 (memory: feedback_image_matching_polite_failure.md)
  // = searchText (7 필드 + maxResultCount=1 + timeout 20s + textQuery 안에 도시명)
  // = PhotoMedia binary 다운로드 + Supabase Storage 업로드 = 메인앱 안전 URL
  const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
  const SUPA_ANON = process.env.SUPABASE_ANON_KEY || '';
  const SUPA_PUB = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';

  // 어제 21 식당 패턴 = searchText (= 7 필드 + maxResultCount=1 + timeout 20s)
  async function searchText(name: string, addr: string | undefined): Promise<any | null> {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos,places.googleMapsUri,places.userRatingCount,places.formattedAddress',
        },
        body: JSON.stringify({ textQuery: addr ? `${name} ${addr}` : `${name} ${cityName}`, maxResultCount: 1 }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return null;
      const d = await r.json() as any;
      return d.places?.[0] || null;
    } catch { return null; }
  }

  // 어제 21 식당 패턴 = PhotoMedia binary 다운로드 + Storage 업로드
  async function uploadPhoto(photoName: string, placeId: string, seedCategory: string): Promise<string | null> {
    const phUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${GOOGLE_KEY}&maxHeightPx=800&maxWidthPx=1200`;
    const phResp = await fetch(phUrl, { signal: AbortSignal.timeout(30000) });
    if (!phResp.ok) return null;
    const ab = await phResp.arrayBuffer();
    const binary = Buffer.from(ab);
    const fileName = `${cityId}/${seedCategory}/${placeId}.jpg`;
    const upResp = await fetch(`${SUPA_PUB}/storage/v1/object/place-images/${fileName}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${SUPA_ANON}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: binary,
    });
    if (!upResp.ok) return null;
    return `${SUPA_PUB}/storage/v1/object/public/place-images/${fileName}`;
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = Promise.all 병렬화 (= simplify HIGH 권장)
  // = 순차 14~21 초 → 병렬 ~3.5 초 (= 4~6 배 단축)
  // = Google API rate limit (= 분당 600) = 4~6 호출 = 충분 여유
  // = race-safe rank = 카테고리별 base + 인덱스 (= MAX(rank) 사전 1 회)

  // 1. nextRank base 사전 계산 (= 카테고리별 1 회 = race condition 차단)
  const baseRanks: Record<string, number> = {};
  for (const cat of ['restaurant', 'attraction']) {
    const r = await db!.execute(
      sql`SELECT COALESCE(MAX(rank), 8999) + 1 AS next_rank FROM place_seed_raw
          WHERE city_id = ${cityId} AND seed_category = ${cat}
          AND collection_phase = 'auto-learn-2026-05'`
    );
    baseRanks[cat] = (r as any).rows?.[0]?.next_rank ?? 9000;
  }
  const today = new Date().toISOString().slice(0, 10);

  // 2. 병렬 처리 (= searchText + PhotoMedia + Storage + INSERT)
  const results = await Promise.all(toSave.map(async (place, i) => {
    try {
      const result = await searchText(place.name, (place as any).geminiAddress);
      if (!result || !result.id || !result.location) return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0 };

      const placeId: string = result.id;
      const lat: number = result.location.latitude;
      const lng: number = result.location.longitude;
      if (!lat || !lng) return { saved: 0, skipped: 1, enrichedByApi: 0, photoOk: 0 };

      const seedCategory: string = place.tags?.includes('restaurant') ? 'restaurant'
        : place.tags?.includes('food') ? 'restaurant'
        : 'attraction';

      let imageUrl: string | null = null;
      const photoName = result.photos?.[0]?.name;
      if (photoName) {
        imageUrl = await uploadPhoto(photoName, placeId, seedCategory);
      }

      // ⚠️ place 객체 직접 갱신 (= 호출자 baseline 반영, race X = 각 호출 자기 place 만)
      place.lat = lat;
      place.lng = lng;
      place.image = imageUrl || '';
      (place as any).googlePlaceId = placeId;
      (place as any).geminiAddress = result.formattedAddress || (place as any).geminiAddress;
      place.userRatingCount = result.userRatingCount || 0;
      console.log(`[AG3-SAVE] 📡 "${place.name}" → (${lat}, ${lng}) img=${imageUrl ? 'Storage' : 'NULL'}`);

      const nextRank = baseRanks[seedCategory] + i;
      // ⚠️ 수정금지(승인필요) 2026-05-14 = v3 컬럼 매핑 = 사용자 SSOT 분리
      // = editorialSummary ← place.description (= shortform_ko = 코믹/위트 후킹)
      // = summaryKo ← place.personaFitReason (= selection_reason_ko = 인스타/FOMO)
      await db!.insert(placeSeedRaw).values({
        cityId: cityId,
        seedCategory,
        collectionPhase: 'auto-learn-2026-05',
        rank: nextRank,
        nameEn: place.name,
        nameKo: (place as any).nameKo || null,
        nameLocal: (place as any).nameLocal || null,
        address: result.formattedAddress || (place as any).geminiAddress || null,
        latitude: lat,
        longitude: lng,
        imageUrl: imageUrl,
        googlePlaceId: placeId,
        editorialSummary: place.description || null,  // = shortform_ko
        summaryKo: place.personaFitReason || place.description || null,  // = selection_reason_ko
        googleReviewCount: result.userRatingCount || 0,
        categoryTags: [seedCategory],
        phaseTags: [`auto-learn-${today}`],
      } as any).onConflictDoNothing();

      return { saved: 1, skipped: 0, enrichedByApi: 1, photoOk: imageUrl ? 1 : 0 };
    } catch (e) {
      return { saved: 0, skipped: 0, enrichedByApi: 0, photoOk: 0, error: (e as Error).message };
    }
  }));

  // 3. 카운터 집계
  const totals = results.reduce((acc, r: any) => ({
    saved: acc.saved + r.saved,
    skipped: acc.skipped + r.skipped,
    enrichedByApi: acc.enrichedByApi + r.enrichedByApi,
    photoOk: acc.photoOk + r.photoOk,
    error: acc.error || r.error || '',
  }), { saved: 0, skipped: 0, enrichedByApi: 0, photoOk: 0, error: '' });

  console.log(`[AG3] 🆕 saved=${totals.saved} skipped=${totals.skipped} apiEnriched=${totals.enrichedByApi} photoOk=${totals.photoOk} error="${totals.error}"`);
}
