/**
 * 🔗 Agent Protocol v1.0 - 통합 도시 검색 (City Resolver)
 * 
 * 모든 에이전트가 이 함수를 통해 도시를 찾습니다.
 * "Paris", "파리", "巴黎" → 모두 같은 cityId를 반환
 * 
 * 매칭 우선순위:
 * 1. nameEn 정확 매칭 (대소문자 무시)
 * 2. name 정확 매칭 (한국어)
 * 3. nameLocal 매칭
 * 4. aliases 배열 검색
 * 5. 좌표 기반 최근접 (fallback)
 */

import { db } from '../db';
import { cities, places } from '@shared/schema';
import { eq, ilike, sql } from 'drizzle-orm';

// ===== 도시 영한 매핑 테이블 (하드코드 fallback) =====
// DB에 nameEn이 아직 없을 때도 매칭 가능하도록
const CITY_NAME_MAP: Record<string, string> = {
  // 영어 → 한국어
  'paris': '파리',
  'nice': '니스',
  'marseille': '마르세유',
  'lyon': '리옹',
  'strasbourg': '스트라스부르',
  'rome': '로마',
  'florence': '피렌체',
  'venice': '베니스',
  'milan': '밀라노',
  'amalfi': '아말피',
  'barcelona': '바르셀로나',
  'madrid': '마드리드',
  'seville': '세비야',
  'granada': '그라나다',
  'london': '런던',
  'edinburgh': '에딘버러',
  'munich': '뮌헨',
  'berlin': '베를린',
  'frankfurt': '프랑크푸르트',
  'zurich': '취리히',
  'interlaken': '인터라켄',
  'vienna': '비엔나',
  'salzburg': '잘츠부르크',
  'amsterdam': '암스테르담',
  'brussels': '브뤼셀',
  'prague': '프라하',
  'budapest': '부다페스트',
  'lisbon': '리스본',
  'athens': '아테네',
  'dubrovnik': '두브로브니크',
  // 아시아
  'seoul': '서울',
  'tokyo': '도쿄',
  'osaka': '오사카',
  'bangkok': '방콕',
  'singapore': '싱가포르',
  'hong kong': '홍콩',
  'hongkong': '홍콩',
  'danang': '다낭',
  'da nang': '다낭',
  'hanoi': '하노이',
  // 미국
  'new york': '뉴욕',
  'newyork': '뉴욕',
};

// 한국어 → 영어 역매핑
const CITY_NAME_MAP_REVERSE: Record<string, string> = {};
for (const [en, ko] of Object.entries(CITY_NAME_MAP)) {
  CITY_NAME_MAP_REVERSE[ko] = en;
}

// 30개 유럽 도시 + 아시아 도시의 영어/현지어 매핑
const CITY_EN_LOCAL_MAP: Record<string, { nameEn: string; nameLocal: string }> = {
  '파리': { nameEn: 'Paris', nameLocal: 'Paris' },
  '니스': { nameEn: 'Nice', nameLocal: 'Nice' },
  '마르세유': { nameEn: 'Marseille', nameLocal: 'Marseille' },
  '리옹': { nameEn: 'Lyon', nameLocal: 'Lyon' },
  '스트라스부르': { nameEn: 'Strasbourg', nameLocal: 'Strasbourg' },
  '로마': { nameEn: 'Rome', nameLocal: 'Roma' },
  '피렌체': { nameEn: 'Florence', nameLocal: 'Firenze' },
  '베니스': { nameEn: 'Venice', nameLocal: 'Venezia' },
  '밀라노': { nameEn: 'Milan', nameLocal: 'Milano' },
  '아말피': { nameEn: 'Amalfi', nameLocal: 'Amalfi' },
  '바르셀로나': { nameEn: 'Barcelona', nameLocal: 'Barcelona' },
  '마드리드': { nameEn: 'Madrid', nameLocal: 'Madrid' },
  '세비야': { nameEn: 'Seville', nameLocal: 'Sevilla' },
  '그라나다': { nameEn: 'Granada', nameLocal: 'Granada' },
  '런던': { nameEn: 'London', nameLocal: 'London' },
  '에딘버러': { nameEn: 'Edinburgh', nameLocal: 'Edinburgh' },
  '뮌헨': { nameEn: 'Munich', nameLocal: 'München' },
  '베를린': { nameEn: 'Berlin', nameLocal: 'Berlin' },
  '프랑크푸르트': { nameEn: 'Frankfurt', nameLocal: 'Frankfurt' },
  '취리히': { nameEn: 'Zurich', nameLocal: 'Zürich' },
  '인터라켄': { nameEn: 'Interlaken', nameLocal: 'Interlaken' },
  '비엔나': { nameEn: 'Vienna', nameLocal: 'Wien' },
  '잘츠부르크': { nameEn: 'Salzburg', nameLocal: 'Salzburg' },
  '암스테르담': { nameEn: 'Amsterdam', nameLocal: 'Amsterdam' },
  '브뤼셀': { nameEn: 'Brussels', nameLocal: 'Bruxelles' },
  '프라하': { nameEn: 'Prague', nameLocal: 'Praha' },
  '부다페스트': { nameEn: 'Budapest', nameLocal: 'Budapest' },
  '리스본': { nameEn: 'Lisbon', nameLocal: 'Lisboa' },
  '아테네': { nameEn: 'Athens', nameLocal: 'Αθήνα' },
  '두브로브니크': { nameEn: 'Dubrovnik', nameLocal: 'Dubrovnik' },
  '서울': { nameEn: 'Seoul', nameLocal: '서울' },
  '도쿄': { nameEn: 'Tokyo', nameLocal: '東京' },
  '오사카': { nameEn: 'Osaka', nameLocal: '大阪' },
  '방콕': { nameEn: 'Bangkok', nameLocal: 'กรุงเทพมหานคร' },
  '싱가포르': { nameEn: 'Singapore', nameLocal: 'Singapore' },
  '홍콩': { nameEn: 'Hong Kong', nameLocal: '香港' },
  '다낭': { nameEn: 'Da Nang', nameLocal: 'Đà Nẵng' },
  '하노이': { nameEn: 'Hanoi', nameLocal: 'Hà Nội' },
  '뉴욕': { nameEn: 'New York', nameLocal: 'New York' },
};

export interface CityResolveResult {
  cityId: number;
  name: string;        // 한국어
  nameEn: string;      // 영어
  nameLocal: string;   // 현지
  countryCode: string;
  latitude: number;
  longitude: number;
}

/**
 * 통합 도시 검색 - 모든 에이전트가 이 함수 하나만 사용
 * 
 * @param input - "Paris", "파리", "巴黎" 등 어떤 언어든 OK
 * @returns CityResolveResult 또는 null
 */
export async function findCityUnified(input: string): Promise<CityResolveResult | null> {
  if (!db || !input) return null;

  // ===== 전처리: "파리, 프랑스" → "파리", "Paris, France" → "Paris" =====
  let cleaned = input.trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0].trim();
    console.log(`[CityResolver] 전처리: "${input}" → "${cleaned}"`);
  }

  const inputLower = cleaned.toLowerCase();

  try {
    // ===== 1단계: DB에서 직접 검색 (nameEn, name, nameLocal) =====
    const dbResults = await db.select().from(cities)
      .where(
        sql`LOWER(${cities.name}) = ${inputLower} 
         OR LOWER(COALESCE(${cities.nameEn}, '')) = ${inputLower}
         OR LOWER(COALESCE(${cities.nameLocal}, '')) = ${inputLower}`
      )
      .limit(1);

    if (dbResults.length > 0) {
      const city = dbResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: city.nameEn || city.name, nameLocal: city.nameLocal || city.name };
      console.log(`[CityResolver] ✅ DB 직접 매칭: "${input}" → ${city.name} (ID: ${city.id})`);
      return {
        cityId: city.id,
        name: city.name,
        nameEn: city.nameEn || enLocal.nameEn,
        nameLocal: city.nameLocal || enLocal.nameLocal,
        countryCode: city.countryCode,
        latitude: city.latitude,
        longitude: city.longitude,
      };
    }

    // ===== 2단계: aliases 배열 검색 =====
    const aliasResults = await db.select().from(cities)
      .where(sql`${cities.aliases}::jsonb @> ${JSON.stringify([input])}::jsonb`)
      .limit(1);

    if (aliasResults.length > 0) {
      const city = aliasResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: city.nameEn || city.name, nameLocal: city.nameLocal || city.name };
      console.log(`[CityResolver] ✅ aliases 매칭: "${input}" → ${city.name} (ID: ${city.id})`);
      return {
        cityId: city.id,
        name: city.name,
        nameEn: city.nameEn || enLocal.nameEn,
        nameLocal: city.nameLocal || enLocal.nameLocal,
        countryCode: city.countryCode,
        latitude: city.latitude,
        longitude: city.longitude,
      };
    }

    // ===== 3단계: 하드코드 매핑으로 한국어 변환 후 재검색 =====
    const koreanName = CITY_NAME_MAP[inputLower];
    if (koreanName) {
      const mapped = await db.select().from(cities)
        .where(ilike(cities.name, koreanName))
        .limit(1);

      if (mapped.length > 0) {
        const city = mapped[0];
        const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: input, nameLocal: input };

        // DB에 nameEn 업데이트 (자동 학습)
        try {
          await db.update(cities)
            .set({
              nameEn: enLocal.nameEn,
              nameLocal: enLocal.nameLocal,
              updatedAt: new Date(),
            })
            .where(eq(cities.id, city.id));
          console.log(`[CityResolver] 🔄 DB 자동 보강: ${city.name} → nameEn="${enLocal.nameEn}"`);
        } catch (e) {
          // 업데이트 실패해도 매칭은 성공
        }

        console.log(`[CityResolver] ✅ 매핑 매칭: "${input}" → ${koreanName} (ID: ${city.id})`);
        return {
          cityId: city.id,
          name: city.name,
          nameEn: enLocal.nameEn,
          nameLocal: enLocal.nameLocal,
          countryCode: city.countryCode,
          latitude: city.latitude,
          longitude: city.longitude,
        };
      }
    }

    // 역방향: 한국어 입력 → 영어명 확인
    const englishName = CITY_NAME_MAP_REVERSE[inputLower] || CITY_NAME_MAP_REVERSE[input];
    if (englishName) {
      // 이미 1단계에서 한국어 직접 매칭 시도했으므로, ilike으로 재시도
      const mapped = await db.select().from(cities)
        .where(ilike(cities.name, `%${input}%`))
        .limit(1);

      if (mapped.length > 0) {
        const city = mapped[0];
        const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: englishName, nameLocal: englishName };
        console.log(`[CityResolver] ✅ 역매핑 매칭: "${input}" → ${city.name} (ID: ${city.id})`);
        return {
          cityId: city.id,
          name: city.name,
          nameEn: enLocal.nameEn,
          nameLocal: enLocal.nameLocal,
          countryCode: city.countryCode,
          latitude: city.latitude,
          longitude: city.longitude,
        };
      }
    }

    // ===== 4단계: 부분 매칭 (ilike) =====
    const partialResults = await db.select().from(cities)
      .where(
        sql`LOWER(${cities.name}) LIKE ${`%${inputLower}%`}
         OR LOWER(COALESCE(${cities.nameEn}, '')) LIKE ${`%${inputLower}%`}
         OR LOWER(COALESCE(${cities.nameLocal}, '')) LIKE ${`%${inputLower}%`}`
      )
      .limit(1);

    if (partialResults.length > 0) {
      const city = partialResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: city.nameEn || city.name, nameLocal: city.nameLocal || city.name };
      console.log(`[CityResolver] ✅ 부분 매칭: "${input}" → ${city.name} (ID: ${city.id})`);
      return {
        cityId: city.id,
        name: city.name,
        nameEn: city.nameEn || enLocal.nameEn,
        nameLocal: city.nameLocal || enLocal.nameLocal,
        countryCode: city.countryCode,
        latitude: city.latitude,
        longitude: city.longitude,
      };
    }

    console.log(`[CityResolver] ❌ 도시 미발견: "${input}"`);
    return null;
  } catch (error) {
    console.error(`[CityResolver] 검색 오류 (${input}):`, error);
    return null;
  }
}

/**
 * 장소명으로 DB places 테이블에서 검색 (aliases 포함)
 * AG3 매칭 로직에서 사용
 */
export async function findPlaceByName(
  placeName: string,
  cityId: number
): Promise<any | null> {
  if (!db) return null;

  const nameLower = placeName.trim().toLowerCase();

  try {
    // 1. name 정확 매칭
    const exact = await db.select().from(places)
      .where(sql`${places.cityId} = ${cityId} AND LOWER(${places.name}) = ${nameLower}`)
      .limit(1);
    if (exact.length > 0) return exact[0];

    // 2. displayNameKo 매칭
    const koMatch = await db.select().from(places)
      .where(sql`${places.cityId} = ${cityId} AND LOWER(COALESCE(${places.displayNameKo}, '')) = ${nameLower}`)
      .limit(1);
    if (koMatch.length > 0) return koMatch[0];

    // 3. aliases 배열 검색
    const aliasMatch = await db.select().from(places)
      .where(sql`${places.cityId} = ${cityId} AND ${places.aliases}::jsonb @> ${JSON.stringify([placeName])}::jsonb`)
      .limit(1);
    if (aliasMatch.length > 0) return aliasMatch[0];

    // 4. 부분 매칭 (포함 관계)
    const partial = await db.select().from(places)
      .where(sql`${places.cityId} = ${cityId} AND (
        LOWER(${places.name}) LIKE ${`%${nameLower}%`} 
        OR ${`%${nameLower}%`} LIKE CONCAT('%', LOWER(${places.name}), '%')
      )`)
      .limit(1);
    if (partial.length > 0) return partial[0];

    return null;
  } catch (error) {
    console.error(`[CityResolver] 장소 검색 오류 (${placeName}):`, error);
    return null;
  }
}

/**
 * 장소 별칭 자동 학습 - 매칭 성공 시 새 별칭을 aliases에 추가
 */
export async function addPlaceAlias(placeId: number, newAlias: string): Promise<void> {
  if (!db || !newAlias) return;

  try {
    // 현재 aliases 조회
    const [place] = await db.select({ aliases: places.aliases, name: places.name })
      .from(places)
      .where(eq(places.id, placeId))
      .limit(1);

    if (!place) return;

    const currentAliases: string[] = (place.aliases as string[]) || [];
    const nameLower = newAlias.trim().toLowerCase();

    // 이미 존재하거나 name과 동일하면 스킵
    if (
      currentAliases.some(a => a.toLowerCase() === nameLower) ||
      place.name.toLowerCase() === nameLower
    ) return;

    // 새 별칭 추가
    const updatedAliases = [...currentAliases, newAlias.trim()];
    await db.update(places)
      .set({ aliases: updatedAliases })
      .where(eq(places.id, placeId));

    console.log(`[CityResolver] 📝 별칭 학습: "${place.name}" += "${newAlias}"`);
  } catch (e) {
    // 학습 실패해도 무시
  }
}

/**
 * 영어 → 한국어 도시명 변환 (표시용)
 */
export function getKoreanCityName(input: string): string {
  const lower = input.trim().toLowerCase();
  return CITY_NAME_MAP[lower] || input;
}

/**
 * 한국어 → 영어 도시명 변환 (API 검색용)
 */
export function getEnglishCityName(input: string): string {
  return CITY_NAME_MAP_REVERSE[input] || input;
}
