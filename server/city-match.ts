// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-08-02 사장님 SSOT = **도시 id 잇기 단일 관문**(§16 재발명 금지).
// = 여정(itineraries.city_id)·TRIPIS(guides.city_id) 를 cities 에 잇는 계산은 이 파일 1벌만 쓴다.
//   ① matchCityIdByName(목적지 문자열) = 이름/별칭 정확 일치 (여정 저장·대표 지정)
//   ② nearestCityIdByCoords(위도, 경도) = 하버사인 최근접 1곳 (TRIPIS 저장 = 좌표만 있음)
// = 둘 다 **읽기 전용 + 외부호출 0**. 도시가 없으면 null 을 돌려줄 뿐, 새 도시를 만들지 않는다.
//   (도시 자동 발급·Gemini 메타 호출은 발굴 경로 findCityUnified 담당 = 저장 경로에서 부르면
//    사용자가 여정을 저장할 때마다 유료 호출 + 가짜 도시 행이 생긴다 = 여기서는 절대 금지.)
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "./db";
import { cities } from "../shared/schema";
import { sql } from "drizzle-orm";

/**
 * 목적지 문자열 → cityId (없으면 null).
 * 비교 = cities 의 name_en / name(한국어) / name_local / aliases(jsonb 배열) 를 LOWER+TRIM 정확 일치.
 * ⚠️ 2026-08-02 사장님 승인 = 사용자가 "파리, 프랑스" 처럼 **나라를 붙여 입력**한 경우도 도시로 잡는다.
 *   실측(교정 드라이런) = 이 형태 2건이 매칭 실패해 도시가 안 붙던 것. 첫 쉼표 앞만 도시명으로 본다.
 */
export async function matchCityIdByName(
  destination: string | null | undefined,
): Promise<number | null> {
  if (!db) return null;
  const dest = String(destination || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!dest) return null;
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .where(
      sql`LOWER(TRIM(${cities.nameEn})) = ${dest}
          OR LOWER(TRIM(${cities.name})) = ${dest}
          OR LOWER(TRIM(${cities.nameLocal})) = ${dest}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(${cities.aliases}) AS alias
            WHERE LOWER(TRIM(alias)) = ${dest}
          )`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * 좌표 → 가장 가까운 cityId (없으면 null).
 * = 하버사인(지구 반지름 6371km) 거리 오름차순 1곳. 좌표가 곧 도시의 불변키라 외부호출이 필요 없다.
 */
export async function nearestCityIdByCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Promise<number | null> {
  if (!db) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .orderBy(
      sql`6371 * acos(LEAST(1, cos(radians(${lat})) * cos(radians(${cities.latitude}))
            * cos(radians(${cities.longitude}) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(${cities.latitude}))))`,
    )
    .limit(1);
  return rows[0]?.id ?? null;
}
