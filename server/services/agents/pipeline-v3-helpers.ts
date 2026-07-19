// Enrichment 동적 import + 좌표 유효성 검증 헬퍼 = pipeline-v3 분리(2026-07-15 §0 슬림화, 순수 이동)

/** Enrichment 함수 동적 import (순환 참조 방지) */
export async function getEnrichmentFunctions() {
  const mod = await import("../itinerary-generator");
  return mod.enrichmentFunctions;
}

// 🗑️ 2026-07-05 = getEurToKrwRate 로컬정의 삭제 = shared/exchange-rate.ts 단일 SSOT 로 통합(§16 재발명금지, 3벌→1벌)

// 🗑️ 2026-07-06 = haversineMeters 로컬정의 삭제 §19 = 거리계산 = transit-haversine.haversineKm 단일 SSOT(§16) = 옛 haversineTransit 전용이라 동반삭제.

// 🗑️ 2026-07-06 = haversineTransit + calcTransit 완전삭제 §19 = MIX 이동계산 = transit-haversine(calcTransitHaversine·pickTransitMode·estimateTransitCost) 단일 SSOT(§16) = DB-only(route-local) 동형. 옛 2km 도보임계·mobilityStyle 편향·cost 0 하드코딩 = 결함③④ 근본 제거.

/** 좌표 유효성 검증 */
export function isValidCoord(lat: number, lng: number): boolean {
  return (
    lat !== 0 &&
    lng !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
