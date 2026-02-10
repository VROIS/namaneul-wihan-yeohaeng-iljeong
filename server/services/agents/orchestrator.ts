/**
 * 4+1 에이전트 파이프라인 오케스트레이터
 * 
 * 파이프라인 흐름:
 * 사용자 입력
 *     ↓
 * [AG1: 뼈대 설계자] ─── 0.3초
 *     ↓
 *     ├──→ [AG2: Gemini 최소 추천] ─── 5~8초 (병렬)
 *     ├──→ [AG3-pre: DB 사전 로드] ─── 0.5초 (병렬)
 *     ↓
 * [AG3: 매칭/점수/확정] ─── 1~2초
 *     ↓
 * [AG4: 실시간 완성] ─── 1~2초
 *     ↓
 * 완성된 일정표 (8~12초)
 * 
 * 목표: 40초 → 8~12초 (70% 단축)
 */

import { buildSkeleton } from './ag1-skeleton-builder';
import { generateRecommendations } from './ag2-gemini-recommender';
import { preloadCityData, matchPlacesWithDB, saveNewPlacesToDB } from './ag3-data-matcher';
import { finalizeItinerary } from './ag4-realtime-finalizer';
import type { TripFormData, PlaceResult, AG3Output } from './types';

// ===== 기존 enrichment 함수들을 lazy import (순환 참조 방지) =====
async function getEnrichmentFunctions() {
  const mod = await import('../itinerary-generator');
  return mod._enrichmentPipeline;
}

/**
 * 메인 파이프라인 실행
 */
export async function runPipeline(formData: TripFormData): Promise<any> {
  const _t0 = Date.now();
  const _timings: Record<string, number> = {};
  const _mark = (label: string) => { _timings[label] = Date.now() - _t0; };

  console.log(`[Pipeline] ===== 4+1 에이전트 파이프라인 시작 =====`);

  // ===== AG1: 뼈대 설계 (0.2~0.5초) =====
  const skeleton = await buildSkeleton(formData);
  _mark('AG1_skeleton');
  console.log(`[Pipeline] AG1 완료 (${_timings['AG1_skeleton']}ms)`);

  // ===== AG2 + AG3-pre: 병렬 실행 (핵심 최적화) =====
  console.log(`[Pipeline] AG2(Gemini) + AG3-pre(DB) 병렬 시작...`);

  const [geminiPlaces, preloaded] = await Promise.all([
    // AG2: 간소화된 Gemini 추천 (5~8초)
    generateRecommendations(skeleton),
    // AG3-pre: DB 사전 로드 (0.5초)
    preloadCityData(formData.destination),
  ]);

  _mark('AG2_AG3pre_parallel');
  console.log(`[Pipeline] AG2+AG3pre 완료 (${_timings['AG2_AG3pre_parallel']}ms): Gemini ${geminiPlaces.length}곳, DB ${preloaded.dbPlacesMap.size}키`);

  // Gemini 결과가 부족하면 보충 (실제 슬롯 수 기준으로 판단)
  let placesArr = geminiPlaces;
  const actualSlotsNeeded = skeleton.totalRequiredPlaces; // 실제 필요 슬롯 (여유분 제외)
  if (placesArr.length < actualSlotsNeeded) {
    console.log(`[Pipeline] Gemini ${placesArr.length}곳 < 실제필요 ${actualSlotsNeeded}곳 → 보충 시도 (7초 소요)`);
    // Gemini 재시도 (한 번만, 타임아웃 8초)
    try {
      const morePlaces = await Promise.race([
        generateRecommendations(skeleton),
        new Promise<PlaceResult[]>((_, reject) => setTimeout(() => reject(new Error('보충 타임아웃')), 8000)),
      ]);
      const existingNames = new Set(placesArr.map(p => p.name.toLowerCase()));
      const unique = morePlaces.filter(p => !existingNames.has(p.name.toLowerCase()));
      placesArr = [...placesArr, ...unique];
      console.log(`[Pipeline] 보충 후: ${placesArr.length}곳`);
    } catch (e) {
      console.warn('[Pipeline] 보충 스킵 (이미 충분하거나 타임아웃):', (e as Error).message);
    }
  } else {
    console.log(`[Pipeline] ✅ Gemini ${placesArr.length}곳 ≥ 필요 ${actualSlotsNeeded}곳, 보충 불필요`);
  }

  // ===== AG3: 매칭/점수/확정 (1~2초) =====
  console.log(`[Pipeline] AG3 매칭/점수/확정 시작...`);

  // 3-1. DB 매칭 + 좌표 보강 + Google Places 수집
  placesArr = await matchPlacesWithDB(placesArr, preloaded);

  // 3-2. 기존 enrichment 파이프라인 실행 (한국 인기도, TripAdvisor, 포토스팟 등)
  const enrichment = await getEnrichmentFunctions();
  const enrichResult = await enrichment.runFullEnrichment(
    placesArr,
    formData,
    skeleton
  );
  placesArr = enrichResult.scoredPlaces;
  const schedule = enrichResult.schedule;

  _mark('AG3_matchScore');
  console.log(`[Pipeline] AG3 완료 (${_timings['AG3_matchScore']}ms): ${schedule.length}슬롯 확정`);
  
  // 🔍 디버그: schedule 상세 로깅
  if (schedule.length === 0) {
    console.error(`[Pipeline] ❌ schedule이 비었습니다!`);
    console.error(`[Pipeline] ❌ scoredPlaces: ${placesArr.length}곳`);
    console.error(`[Pipeline] ❌ daySlotsConfig: ${JSON.stringify(skeleton.daySlotsConfig)}`);
  } else {
    const dayBreakdown = skeleton.daySlotsConfig.map(d => {
      const daySlots = schedule.filter(s => s.day === d.day);
      return `Day${d.day}: ${daySlots.length}슬롯 (${daySlots.filter(s => s.isMealSlot).length}식사)`;
    });
    console.log(`[Pipeline] 📊 슬롯 배분: ${dayBreakdown.join(', ')}`);
  }

  // 미등록 장소 백그라운드 저장
  saveNewPlacesToDB(placesArr, preloaded.cityId);

  // ===== AG4: 실시간 완성 (1~2초) =====
  console.log(`[Pipeline] AG4 실시간 완성 시작...`);

  const ag3Output: AG3Output = {
    schedule,
    scoredPlaces: placesArr,
    daySlotsConfig: skeleton.daySlotsConfig,
    travelPace: skeleton.travelPace,
    vibes: formData.vibes || ['Foodie', 'Culture', 'Healing'],
  };

  // 날씨/위기 데이터 조회 (enrichment에서 가져옴)
  const realityCheck = enrichResult.realityCheck || { weather: 'Unknown', crowd: 'Medium', status: 'Open' };

  const result = await finalizeItinerary(ag3Output, skeleton, realityCheck);

  _mark('AG4_finalize');

  // ── 최종 일정 검증 (90% 미만이어도 일정 반환, 검증 결과는 로그만) ──
  const { verifyItinerary } = await import('./itinerary-verifier');
  const verifyResult = await verifyItinerary(result);
  if (!verifyResult.passed) {
    console.warn(`[Pipeline] ⚠️ 일정 검증 미통과 (score=${verifyResult.score}) — 일정은 그대로 반환`);
  }

  // 타이밍 정보 추가
  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: Date.now() - _t0,
    _pipelineVersion: 'v2-4agent',
  };

  console.log(`[Pipeline] ===== 파이프라인 완료 =====`);
  console.log(`[Pipeline] 총 소요: ${Date.now() - _t0}ms`);
  console.log(`[Pipeline]   AG1(뼈대): ${_timings['AG1_skeleton']}ms`);
  console.log(`[Pipeline]   AG2+3pre(병렬): ${_timings['AG2_AG3pre_parallel'] - _timings['AG1_skeleton']}ms`);
  console.log(`[Pipeline]   AG3(매칭): ${_timings['AG3_matchScore'] - _timings['AG2_AG3pre_parallel']}ms`);
  console.log(`[Pipeline]   AG4(완성): ${_timings['AG4_finalize'] - _timings['AG3_matchScore']}ms`);

  return result;
}
