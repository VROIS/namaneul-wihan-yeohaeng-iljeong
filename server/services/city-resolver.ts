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
// ⚠️ 2026-05-23 = places import 제거 (= 사용자 SSOT = PSR 단일 = findPlaceByName + addPlaceAlias 폐기)
import { cities } from '@shared/schema';
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
 * @param coords - ⚠️ 사장님 SSOT 2026-07-08 = 도시중심좌표(불변키). 있으면 좌표 10m 매칭이 최우선(이름 무관 = 중복도시·재발굴 원천차단).
 * @returns CityResolveResult 또는 null
 */
export async function findCityUnified(
  input: string,
  coords?: { lat: number; lng: number } | null,
): Promise<CityResolveResult | null> {
  if (!db || !input) return null;

  // ===== 전처리: "파리, 프랑스" → "파리", "Paris, France" → "Paris" =====
  let cleaned = input.trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0].trim();
    console.log(`[CityResolver] 전처리: "${input}" → "${cleaned}"`);
  }

  const inputLower = cleaned.toLowerCase();

  try {
    // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 0단계 = 도시중심좌표(불변키) 10m 매칭 최우선.
    //   = 도시 동일성은 언어/철자(가변)가 아니라 좌표(불변)로 판정("본느"≠"본" 이름실패로 중복 city 생성+21건 재발굴 사고 근본).
    //   = 좌표 10m(0.0001, place 매칭 불변4와 동일 임계) 이내면 같은 도시 확정 = 즉시 재활용 = 이름 무관.
    if (coords && coords.lat != null && coords.lng != null) {
      const near = await db.select().from(cities)
        .where(sql`ABS(${cities.latitude} - ${coords.lat}) < 0.0001 AND ABS(${cities.longitude} - ${coords.lng}) < 0.0001`)
        .orderBy(cities.id)
        .limit(1);
      if (near.length > 0) {
        const city = near[0];
        const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: city.nameEn || city.name, nameLocal: city.nameLocal || city.name };
        console.log(`[CityResolver] ✅ 좌표 10m 매칭(불변키): "${input}" → ${city.name} (ID: ${city.id})`);
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
    }

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

    // ===== 4단계: 유사어 부분 매칭 (양방향 ilike) =====
    // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 한국 초행여행자가 정확명칭 모름("본느" vs "본") = 유사어 검색.
    //   = 양방향: 입력⊂DB명(옛) + DB명⊂입력(신규) 둘 다 = "본느" LIKE '%본%' 로 "본" 잡음. 좌표(0단계) 없을 때 보조.
    //   = LENGTH>=2 가드 = 1글자 오매칭 방지. 좌표매칭이 최우선이라 이 단계 오매칭 위험은 좌표 없는 경우로 한정.
    const partialResults = inputLower.length >= 2
      ? await db.select().from(cities)
          .where(
            sql`LOWER(${cities.name}) LIKE ${`%${inputLower}%`} OR ${inputLower} LIKE '%' || LOWER(${cities.name}) || '%'
             OR LOWER(COALESCE(${cities.nameEn}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameEn},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameEn}) || '%')
             OR LOWER(COALESCE(${cities.nameLocal}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameLocal},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameLocal}) || '%')`
          )
          .limit(1)
      : [];

    if (partialResults.length > 0) {
      const city = partialResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || { nameEn: city.nameEn || city.name, nameLocal: city.nameLocal || city.name };
      console.log(`[CityResolver] ✅ 유사어 부분 매칭: "${input}" → ${city.name} (ID: ${city.id})`);
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

    // ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 5 단계 = 신규 도시 자동 INSERT
    // = 4 단계 모두 실패 = Gemini 메타 호출 → cities INSERT (= cities_id_seq 자동 발급)
    // = 결과 = 다음 사용자 = 1단계 직접 매칭 = 외부 호출 0 = 영구 재활용
    console.log(`[CityResolver] 🆕 4 단계 매칭 실패 = 신규 도시 자동 백필 시도: "${input}"`);
    const { fetchCityMetaFromGemini } = await import('./shared/gemini-city-meta');
    const meta = await fetchCityMetaFromGemini(input);
    if (!meta) {
      console.log(`[CityResolver] ❌ Gemini 메타 실패 = 도시 미존재 = null 반환: "${input}"`);
      return null;
    }
    const [newCity] = await db.insert(cities).values({
      name: meta.nameKo,
      nameEn: meta.nameEn,
      nameLocal: meta.nameLocal,
      country: meta.country,
      countryCode: meta.countryCode,
      latitude: meta.latitude,
      longitude: meta.longitude,
      timezone: meta.timezone,
      primaryLanguage: meta.primaryLanguage,
      aliases: [input],
    }).returning();
    console.log(`[CityResolver] ✅ 신규 도시 자동 발급: ${newCity.name} (id=${newCity.id}, ${newCity.countryCode})`);
    return {
      cityId: newCity.id,
      name: newCity.name,
      nameEn: newCity.nameEn || meta.nameEn,
      nameLocal: newCity.nameLocal || meta.nameLocal,
      countryCode: newCity.countryCode,
      latitude: newCity.latitude,
      longitude: newCity.longitude,
    };
  } catch (error) {
    console.error(`[CityResolver] 검색 오류 (${input}):`, error);
    return null;
  }
}

// ⚠️ 2026-05-23 = 사용자 SSOT = PSR 단일 = 장소 매칭 = upsertPlace() 의 5 단계 매칭 사용

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
