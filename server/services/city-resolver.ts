import { db } from "../db";
import { cities } from "@shared/schema";
import { eq, ilike, sql } from "drizzle-orm";

const CITY_NAME_MAP: Record<string, string> = {
  paris: "파리",
  nice: "니스",
  marseille: "마르세유",
  lyon: "리옹",
  strasbourg: "스트라스부르",
  rome: "로마",
  florence: "피렌체",
  venice: "베니스",
  milan: "밀라노",
  amalfi: "아말피",
  barcelona: "바르셀로나",
  madrid: "마드리드",
  seville: "세비야",
  granada: "그라나다",
  london: "런던",
  edinburgh: "에딘버러",
  munich: "뮌헨",
  berlin: "베를린",
  frankfurt: "프랑크푸르트",
  zurich: "취리히",
  interlaken: "인터라켄",
  vienna: "비엔나",
  salzburg: "잘츠부르크",
  amsterdam: "암스테르담",
  brussels: "브뤼셀",
  prague: "프라하",
  budapest: "부다페스트",
  lisbon: "리스본",
  athens: "아테네",
  dubrovnik: "두브로브니크",
  seoul: "서울",
  tokyo: "도쿄",
  osaka: "오사카",
  bangkok: "방콕",
  singapore: "싱가포르",
  "hong kong": "홍콩",
  hongkong: "홍콩",
  danang: "다낭",
  "da nang": "다낭",
  hanoi: "하노이",
  "new york": "뉴욕",
  newyork: "뉴욕",
};

const CITY_NAME_MAP_REVERSE: Record<string, string> = {};
for (const [en, ko] of Object.entries(CITY_NAME_MAP)) {
  CITY_NAME_MAP_REVERSE[ko] = en;
}

const CITY_EN_LOCAL_MAP: Record<string, { nameEn: string; nameLocal: string }> =
  {
    파리: { nameEn: "Paris", nameLocal: "Paris" },
    니스: { nameEn: "Nice", nameLocal: "Nice" },
    마르세유: { nameEn: "Marseille", nameLocal: "Marseille" },
    리옹: { nameEn: "Lyon", nameLocal: "Lyon" },
    스트라스부르: { nameEn: "Strasbourg", nameLocal: "Strasbourg" },
    로마: { nameEn: "Rome", nameLocal: "Roma" },
    피렌체: { nameEn: "Florence", nameLocal: "Firenze" },
    베니스: { nameEn: "Venice", nameLocal: "Venezia" },
    밀라노: { nameEn: "Milan", nameLocal: "Milano" },
    아말피: { nameEn: "Amalfi", nameLocal: "Amalfi" },
    바르셀로나: { nameEn: "Barcelona", nameLocal: "Barcelona" },
    마드리드: { nameEn: "Madrid", nameLocal: "Madrid" },
    세비야: { nameEn: "Seville", nameLocal: "Sevilla" },
    그라나다: { nameEn: "Granada", nameLocal: "Granada" },
    런던: { nameEn: "London", nameLocal: "London" },
    에딘버러: { nameEn: "Edinburgh", nameLocal: "Edinburgh" },
    뮌헨: { nameEn: "Munich", nameLocal: "München" },
    베를린: { nameEn: "Berlin", nameLocal: "Berlin" },
    프랑크푸르트: { nameEn: "Frankfurt", nameLocal: "Frankfurt" },
    취리히: { nameEn: "Zurich", nameLocal: "Zürich" },
    인터라켄: { nameEn: "Interlaken", nameLocal: "Interlaken" },
    비엔나: { nameEn: "Vienna", nameLocal: "Wien" },
    잘츠부르크: { nameEn: "Salzburg", nameLocal: "Salzburg" },
    암스테르담: { nameEn: "Amsterdam", nameLocal: "Amsterdam" },
    브뤼셀: { nameEn: "Brussels", nameLocal: "Bruxelles" },
    프라하: { nameEn: "Prague", nameLocal: "Praha" },
    부다페스트: { nameEn: "Budapest", nameLocal: "Budapest" },
    리스본: { nameEn: "Lisbon", nameLocal: "Lisboa" },
    아테네: { nameEn: "Athens", nameLocal: "Αθήνα" },
    두브로브니크: { nameEn: "Dubrovnik", nameLocal: "Dubrovnik" },
    서울: { nameEn: "Seoul", nameLocal: "서울" },
    도쿄: { nameEn: "Tokyo", nameLocal: "東京" },
    오사카: { nameEn: "Osaka", nameLocal: "大阪" },
    방콕: { nameEn: "Bangkok", nameLocal: "กรุงเทพมหานคร" },
    싱가포르: { nameEn: "Singapore", nameLocal: "Singapore" },
    홍콩: { nameEn: "Hong Kong", nameLocal: "香港" },
    다낭: { nameEn: "Da Nang", nameLocal: "Đà Nẵng" },
    하노이: { nameEn: "Hanoi", nameLocal: "Hà Nội" },
    뉴욕: { nameEn: "New York", nameLocal: "New York" },
  };

export interface CityResolveResult {
  cityId: number;
  name: string; // 한국어
  nameEn: string; // 영어
  nameLocal: string; // 현지
  countryCode: string;
  latitude: number;
  longitude: number;
}

/** @param coords - ⚠️ 사장님 SSOT 2026-07-08 = 도시중심좌표(불변키). 있으면 좌표 10m 매칭이 최우선(이름 무관 = 중복도시·재발굴 원천차단). */
export async function findCityUnified(
  input: string,
  coords?: { lat: number; lng: number } | null,
): Promise<CityResolveResult | null> {
  if (!db || !input) return null;

  let cleaned = input.trim();
  if (cleaned.includes(",")) {
    cleaned = cleaned.split(",")[0].trim();
    console.log(`[CityResolver] 전처리: "${input}" → "${cleaned}"`);
  }

  const inputLower = cleaned.toLowerCase();

  try {
    // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 0단계 = 도시중심좌표(불변키) 10m 매칭 최우선.
    if (coords && coords.lat != null && coords.lng != null) {
      const near = await db
        .select()
        .from(cities)
        .where(
          sql`ABS(${cities.latitude} - ${coords.lat}) < 0.0001 AND ABS(${cities.longitude} - ${coords.lng}) < 0.0001`,
        )
        .orderBy(cities.id)
        .limit(1);
      if (near.length > 0) {
        const city = near[0];
        const enLocal = CITY_EN_LOCAL_MAP[city.name] || {
          nameEn: city.nameEn || city.name,
          nameLocal: city.nameLocal || city.name,
        };
        console.log(
          `[CityResolver] ✅ 좌표 10m 매칭(불변키): "${input}" → ${city.name} (ID: ${city.id})`,
        );
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

    const dbResults = await db
      .select()
      .from(cities)
      .where(
        sql`LOWER(${cities.name}) = ${inputLower} 
         OR LOWER(COALESCE(${cities.nameEn}, '')) = ${inputLower}
         OR LOWER(COALESCE(${cities.nameLocal}, '')) = ${inputLower}`,
      )
      .limit(1);

    if (dbResults.length > 0) {
      const city = dbResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || {
        nameEn: city.nameEn || city.name,
        nameLocal: city.nameLocal || city.name,
      };
      console.log(
        `[CityResolver] ✅ DB 직접 매칭: "${input}" → ${city.name} (ID: ${city.id})`,
      );
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

    const aliasResults = await db
      .select()
      .from(cities)
      .where(sql`${cities.aliases}::jsonb @> ${JSON.stringify([input])}::jsonb`)
      .limit(1);

    if (aliasResults.length > 0) {
      const city = aliasResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || {
        nameEn: city.nameEn || city.name,
        nameLocal: city.nameLocal || city.name,
      };
      console.log(
        `[CityResolver] ✅ aliases 매칭: "${input}" → ${city.name} (ID: ${city.id})`,
      );
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

    const koreanName = CITY_NAME_MAP[inputLower];
    if (koreanName) {
      const mapped = await db
        .select()
        .from(cities)
        .where(ilike(cities.name, koreanName))
        .limit(1);

      if (mapped.length > 0) {
        const city = mapped[0];
        const enLocal = CITY_EN_LOCAL_MAP[city.name] || {
          nameEn: input,
          nameLocal: input,
        };

        try {
          await db
            .update(cities)
            .set({
              nameEn: enLocal.nameEn,
              nameLocal: enLocal.nameLocal,
              updatedAt: new Date(),
            })
            .where(eq(cities.id, city.id));
          console.log(
            `[CityResolver] 🔄 DB 자동 보강: ${city.name} → nameEn="${enLocal.nameEn}"`,
          );
        } catch (e) {}

        console.log(
          `[CityResolver] ✅ 매핑 매칭: "${input}" → ${koreanName} (ID: ${city.id})`,
        );
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

    const englishName =
      CITY_NAME_MAP_REVERSE[inputLower] || CITY_NAME_MAP_REVERSE[input];
    if (englishName) {
      const mapped = await db
        .select()
        .from(cities)
        .where(ilike(cities.name, `%${input}%`))
        .limit(1);

      if (mapped.length > 0) {
        const city = mapped[0];
        const enLocal = CITY_EN_LOCAL_MAP[city.name] || {
          nameEn: englishName,
          nameLocal: englishName,
        };
        console.log(
          `[CityResolver] ✅ 역매핑 매칭: "${input}" → ${city.name} (ID: ${city.id})`,
        );
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

    // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 한국 초행여행자가 정확명칭 모름("본느" vs "본") = 유사어 검색.
    const partialResults =
      inputLower.length >= 2
        ? await db
            .select()
            .from(cities)
            .where(
              sql`LOWER(${cities.name}) LIKE ${`%${inputLower}%`} OR ${inputLower} LIKE '%' || LOWER(${cities.name}) || '%'
             OR LOWER(COALESCE(${cities.nameEn}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameEn},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameEn}) || '%')
             OR LOWER(COALESCE(${cities.nameLocal}, '')) LIKE ${`%${inputLower}%`} OR (LENGTH(COALESCE(${cities.nameLocal},''))>=2 AND ${inputLower} LIKE '%' || LOWER(${cities.nameLocal}) || '%')`,
            )
            .limit(1)
        : [];

    if (partialResults.length > 0) {
      const city = partialResults[0];
      const enLocal = CITY_EN_LOCAL_MAP[city.name] || {
        nameEn: city.nameEn || city.name,
        nameLocal: city.nameLocal || city.name,
      };
      console.log(
        `[CityResolver] ✅ 유사어 부분 매칭: "${input}" → ${city.name} (ID: ${city.id})`,
      );
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
    console.log(
      `[CityResolver] 🆕 4 단계 매칭 실패 = 신규 도시 자동 백필 시도: "${input}"`,
    );
    const { fetchCityMetaFromGemini } = await import(
      "./shared/gemini-city-meta"
    );
    const meta = await fetchCityMetaFromGemini(input);
    if (!meta) {
      console.log(
        `[CityResolver] ❌ Gemini 메타 실패 = 도시 미존재 = null 반환: "${input}"`,
      );
      return null;
    }

    // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 백필 재조회 = INSERT 전 기존 도시 확인(중복 발급 원천차단).
    const existing = await findExistingCityByMeta(meta);
    if (existing) {
      await db
        .update(cities)
        .set({
          aliases: sql`(COALESCE(${cities.aliases}, '[]'::jsonb) || ${JSON.stringify([input])}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(
          sql`${cities.id} = ${existing.id} AND NOT (COALESCE(${cities.aliases}, '[]'::jsonb) @> ${JSON.stringify([input])}::jsonb)`,
        );
      console.log(
        `[CityResolver] ✅ 백필 재조회 매칭: "${input}" → ${existing.name} (ID: ${existing.id}) = 유사어 등록 = 신규 발급 0`,
      );
      return {
        cityId: existing.id,
        name: existing.name,
        nameEn: existing.nameEn || meta.nameEn,
        nameLocal: existing.nameLocal || meta.nameLocal,
        countryCode: existing.countryCode,
        latitude: existing.latitude,
        longitude: existing.longitude,
      };
    }

    const [newCity] = await db
      .insert(cities)
      .values({
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
      })
      .returning();
    console.log(
      `[CityResolver] ✅ 신규 도시 자동 발급: ${newCity.name} (id=${newCity.id}, ${newCity.countryCode})`,
    );
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

// ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 백필 전용 기존 도시 재조회 (5단계에서만 사용).
export async function findExistingCityByMeta(meta: {
  nameKo: string;
  nameEn: string;
  nameLocal: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}) {
  if (!db) return null;
  const norm = (x: string | null | undefined) => (x || "").trim().toLowerCase();
  const names = [meta.nameKo, meta.nameEn, meta.nameLocal]
    .map(norm)
    .filter((n) => n.length > 0);
  const cc = (meta.countryCode || "").trim().toUpperCase();
  const hasCoord =
    Number.isFinite(meta.latitude) && Number.isFinite(meta.longitude);
  if ((names.length === 0 || cc.length === 0) && !hasCoord) return null;
  const { haversineKm } = await import("./agents/transit-haversine");
  const all = await db.select().from(cities);
  const hits = all.filter(
    (c) =>
      (names.length > 0 &&
        cc.length > 0 &&
        (c.countryCode || "").trim().toUpperCase() === cc &&
        [c.name, c.nameEn, c.nameLocal].some((x) => {
          const v = norm(x);
          return v.length > 0 && names.includes(v);
        })) ||
      (hasCoord &&
        haversineKm(
          Number(c.latitude),
          Number(c.longitude),
          meta.latitude,
          meta.longitude,
        ) < 1.0),
  );
  hits.sort((a, b) => b.id - a.id);
  return hits[0] ?? null;
}

export function getKoreanCityName(input: string): string {
  const lower = input.trim().toLowerCase();
  return CITY_NAME_MAP[lower] || input;
}

export function getEnglishCityName(input: string): string {
  return CITY_NAME_MAP_REVERSE[input] || input;
}
