// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only 전용 AG3
// = AG2-DB 의 PlaceResult[] = 그대로 사용 (= 매칭/Google 호출 0)
// = sourceType = 'DB Direct (Place Seed Raw)' 보존 (= 'Gemini AI + DB Enriched' 덮어쓰기 X)
// = AG3 shape 버그 (= ag3-data-matcher.ts:471) 우회 = priceEur 보존
// = MIX 경로 = ag3-data-matcher.ts (= 기존) 그대로 사용 (= 별도 도메인)

import type { PlaceResult } from './types';

/**
 * 매칭 5 단계 = 사용자 SSOT (= AG3-DB 안)
 * = AG2-DB 가 이미 place_seed_raw 직접 SELECT = 매칭 우선순위 = 코드 명시만
 * | 순위 | 키 | 정확도 |
 * | 0 | id (= place_seed_raw 자체 ID) | 100% |
 * | 1 | google_place_id (= PID) | ~100% |
 * | 2 | google_maps_uri (= cid URL) | ~100% |
 * | 3 | address 풀주소 + latitude/longitude | ~99% |
 * | 4 | 텍스트 (summary_ko / editorial_summary / name_en/ko/local) | 30-50% |
 */
export type DbMatchRank = 0 | 1 | 2 | 3 | 4 | 'none';

export function resolveMatchRank(p: PlaceResult): DbMatchRank {
  // 0 순위 = id 명시 (= AG2-DB = id: `db-${r.id}` 형식 = place_seed_raw 자체 ID)
  if (p.id?.startsWith('db-')) return 0;
  // 1 순위 = PID
  if ((p as any).googlePlaceId || (p as any).geminiPlaceId) return 1;
  // 2 순위 = google_maps_uri
  if ((p as any).googleMapsUri || p.googleMapsUrl) return 2;
  // 3 순위 = 풀주소 + 좌표
  if ((p as any).geminiAddress && p.lat && p.lng) return 3;
  // 4 순위 = 텍스트
  if (p.name || p.description) return 4;
  return 'none';
}

/**
 * AG3-DB 메인 = AG2-DB 결과 = 그대로 PlaceResult[] 반환
 * = 매칭 우선순위 코드 명시 + sourceType 보존 + 신규 SELECT/외부 호출 0
 */
export function processDbOnly(places: PlaceResult[]): {
  enriched: PlaceResult[];
  matchStats: Record<string, number>;
} {
  const matchStats: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, 'none': 0 };
  for (const p of places) {
    const rank = resolveMatchRank(p);
    matchStats[String(rank)]++;
  }
  console.log(`[AG3-DB] 매칭 5 단계 통계: id=${matchStats['0']} pid=${matchStats['1']} uri=${matchStats['2']} addr+coord=${matchStats['3']} text=${matchStats['4']} none=${matchStats['none']}`);
  // AG2-DB 가 이미 PlaceResult 형식 = 추가 변환 X = sourceType 'DB Direct (Place Seed Raw)' 그대로 보존
  return { enriched: places, matchStats };
}
