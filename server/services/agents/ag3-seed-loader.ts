// 도시 seed 사전로드(place_seed_raw 맵 구성) = ag3-data-matcher 분리(2026-07-16 §0 슬림화, 순수 이동)

import { db } from "../../db";
import { placeSeedRaw } from "@shared/schema";
import { eq } from "drizzle-orm"; // eq = seed SELECT where
import type { AG3PreOutput } from "./types";
import { findCityUnified } from "../city-resolver";

/**
 * ⚠️ 2026-07-07 사장님 SSOT = place_seed_raw 도시 전체를 seedRawMap 으로 로드(§16 단일 SSOT).
 *   = preloadCityData(최초 1회) + saveNewPlacesToDB 1차저장 후 재조회(신규 반영) 공통 사용.
 *   = 슬롯을 저장된 PSR 에서 구성(DB-only 동형)하려면 1차저장 후 이 함수로 재조회해 신규 23곳 포함된 최신 맵 확보.
 */
export async function loadSeedRawMap(cityId: number): Promise<Map<string, any>> {
  const seedRawMap = new Map<string, any>();
  if (!db) return seedRawMap;
  const seeds = await db
    .select({
      id: placeSeedRaw.id,
      nameEn: placeSeedRaw.nameEn,
      nameKo: placeSeedRaw.nameKo,
      nameLocal: placeSeedRaw.nameLocal,
      googlePlaceId: placeSeedRaw.googlePlaceId,
      googleMapsUri: placeSeedRaw.googleMapsUri,
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
      priceEur: placeSeedRaw.priceEur,
      rank: placeSeedRaw.rank,
      seedCategory: placeSeedRaw.seedCategory,
    })
    .from(placeSeedRaw)
    .where(eq(placeSeedRaw.cityId, cityId));
  for (const s of seeds) {
    // ⚠️ 수정금지(승인필요) 2026-05-09 = 이름 매칭 보강 = 정규화 + 악센트 제거 (좌표 X, 이름+address ✓)
    const norm = (name: string | null) =>
      name ? name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
    const noAccent = (name: string | null) =>
      name ? name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : null;
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
    if (s.googlePlaceId) seedRawMap.set(`pid:${s.googlePlaceId}`, s);
    if (s.googleMapsUri) seedRawMap.set(`uri:${s.googleMapsUri}`, s);
    if (s.address) seedRawMap.set(`addr:${s.address.toLowerCase().replace(/\s+/g, " ").trim()}`, s);
  }
  return seedRawMap;
}

/**
 * AG3-pre: 도시 DB 데이터 사전 로드
 * 🔗 Agent Protocol v1.0: findCityUnified로 도시 매칭 (영어/한국어/별칭 모두 OK)
 * AG2(Gemini)와 병렬 실행하여 대기시간 활용
 */
export async function preloadCityData(
  destination: string,
  // ⚠️ 수정금지(승인필요) 2026-07-08 사장님 SSOT = 도시중심좌표(불변키) 전달 = findCityUnified 좌표10m 매칭 최우선(중복도시·재발굴 차단).
  destinationCoords?: { lat: number; lng: number } | null,
): Promise<AG3PreOutput> {
  const _t0 = Date.now();

  if (!db) {
    console.log("[AG3-pre] DB 미연결");
    return { cityId: null, cityName: destination, seedRawMap: new Map() };
  }

  try {
    // 1. 🔗 통합 도시 검색 = 좌표(불변키) 10m 최우선 → 이름 유사어 순 (findCityUnified 단일 SSOT §16)
    const cityResult = await findCityUnified(destination, destinationCoords);
    const cityId: number | null = cityResult?.cityId || null;
    // 🗑️ 2026-07-07 = seed SELECT+맵구성 = loadSeedRawMap 단일 SSOT 추출(§16/§19) = preload·1차저장후 재조회 공용.
    let seedRawMap = new Map<string, any>();
    if (cityId) {
      console.log(`[AG3-pre] ✅ 도시 (ID: ${cityId}) 매칭 = place_seed_raw 단일 SSOT`);
      try {
        const _t1 = Date.now();
        seedRawMap = await loadSeedRawMap(cityId);
        console.log(`[AG3-pre] 🏭 통합 전시매장(place_seed_raw) ${seedRawMap.size}키 사전 로드 (${Date.now() - _t1}ms)`);
      } catch (e) {
        console.warn(`[AG3-pre] seedData 로드 실패:`, (e as Error)?.message);
      }
    } else {
      console.log(`[AG3-pre] ⚠️ 도시 "${destination}" 미발견 (${Date.now() - _t0}ms)`);
    }

    // 도시 중심 좌표 (숙소 미입력 시 출발 기점으로 사용)
    const cityCoords =
      cityResult?.latitude && cityResult?.longitude
        ? { lat: cityResult.latitude, lng: cityResult.longitude }
        : undefined;
    if (cityCoords) {
      console.log(
        `[AG3-pre] 📍 도시 중심 좌표: ${cityCoords.lat.toFixed(4)}, ${cityCoords.lng.toFixed(4)}`,
      );
    }

    return {
      cityId,
      cityName: cityResult?.nameEn || destination,
      cityCoords,
      seedRawMap,
    };
  } catch (error) {
    console.error("[AG3-pre] DB 사전 로드 실패:", error);
    return { cityId: null, cityName: destination, seedRawMap: new Map() };
  }
}
