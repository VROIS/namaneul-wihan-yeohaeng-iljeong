/**
 * Pipeline V3 (MIX): Step1 Gemini 일정 생성 → Step2 DB매칭·교통비·스케줄 빌드.
 * 이동시간 = 외부호출0 Haversine 추정.
 */

import type { TripFormData, DaySlotConfig, TravelPace, VibeWeight } from './types';
import {
  PACE_CONFIG, DEFAULT_START_TIME, DEFAULT_END_TIME,
  calculateDayCount, calculateSlotsForDay, getCompanionCount,
} from './types';
// ⚠️ 2026-07-18 §0/§19 = ag3-data-matcher(재export 허브) 삭제 = 실제 파일 직접 import(껍데기 도려내기).
import { preloadCityData } from './ag3-seed-loader';
// 🧠 2026-07-05 사장님 SSOT = MIX Gemini(#02) raw 저장 관문(§18). 옛 getAI 직접호출 = raw 미저장(비용증발) 폐기(§19). TS(ag3)는 이미 관문경유 저장됨 = Gemini만 누락이었음.
// 🧠 2026-07-06 사장님 SSOT = MIX Gemini raw = 도시id 폴더 + {meta,rawResponse,parsedPlaces}(사장님 예시형식) 저장 = saveCollectedRaw 단일 헬퍼(§18 2곳). 옛 saveRaw(runtime 봉투) 폐기 §19.
import { saveCollectedRaw } from '../shared/save-collected-raw';
import { buildDayConfig } from '../transport-pricing-service';
// ⚠️ 2026-07-15 §0 슬림화(순수 이동) = pipeline-v3.ts(1,253줄) 를 책임별 파일로 분리. 이 파일은 진입점(runPipelineV3/runPipelineMix)만 유지.
import { step1_geminiItinerary } from './pipeline-v3-step1-gemini';
import { step2_enrichAndBuild } from './pipeline-v3-step2-build';

// =====================================================
// 메인 파이프라인
// =====================================================

// ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only / MIX 완전 분기 entry
// = ready=true → DB-only 전용 파이프라인 (= pipeline-db-only.ts = Gemini/Routes/Sentiment/Verifier 0)
// = ready=false → MIX (= 옛 V3 step1_geminiItinerary 흐름 = 사용자 명시 "MIX 결과가 더 낳음" 보존)
export async function runPipelineV3(formData: TripFormData): Promise<any> {
  const { isCityReady } = await import('./ag2-gemini-recommender');
  // ⚠️ 2026-07-08 사장님 SSOT = destinationCoords(불변키) 전달 = ready 판정 좌표우선 = "본느"도 기존 도시 잡아 DB-only 재활용(재발굴 차단).
  const cityCheck = await isCityReady(formData.destination, formData.destinationCoords);
  if (cityCheck.ready) {
    const { runPipelineDbOnly } = await import('./pipeline-db-only');
    return runPipelineDbOnly(formData, cityCheck);
  }
  console.log(`\n[V3] city='${cityCheck.cityName}' ready=false (${cityCheck.count} rows) → MIX 경로`);
  return runPipelineMix(formData);
}

async function runPipelineMix(formData: TripFormData): Promise<any> {
  const _t0 = Date.now();
  const _timings: Record<string, number> = {};
  const _mark = (label: string) => { _timings[label] = Date.now() - _t0; };

  console.log(`[V3-MIX] ===== Pipeline MIX (= 옛 V3 step1 살리기) 시작 =====`);

  // ===== 기본 계산 (AG1 역할 통합, <1ms) =====
  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  // 🗑️ 2026-07-05 삭제 = 'Moderate'→'Normal' 재매핑 = 옛 pace값(FE 미전송 = 죽은분기) §0/§19
  const travelPace: TravelPace = (formData.travelPace as TravelPace) || 'Normal';
  const paceConfig = PACE_CONFIG[travelPace];
  const companionCount = getCompanionCount(formData.companionType || 'Solo');
  // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = vibes 빈값 폴백 = 정식 6 vibe 만 (옛 Foodie→Shopping 교체, §19 완전삭제). Foodie 는 버튼 폐기됨(즐길거리=Attraction / 쇼핑=Shopping). 헤더 "미식" 오염 차단.
  const vibes = formData.vibes || ['Shopping', 'Culture', 'Healing'];

  // 🗑️ 2026-07-05 삭제 = sourceMode 토글 = 라우팅은 cityCheck.ready 담당(안 도는 분기) §0/§19

  // Vibe 가중치 계산
  const PRIORITY_WEIGHTS: Record<number, number[]> = { 1: [100], 2: [60, 40], 3: [50, 30, 20] };
  const weights = PRIORITY_WEIGHTS[vibes.length] || [50, 30, 20];
  const vibeWeights: VibeWeight[] = vibes.map((vibe, i) => ({
    vibe: vibe as any,
    weight: weights[i] / 100,
    percentage: weights[i],
  }));

  // ⚠️ 2026-07-06 사장님 SSOT = 일별 가용시각 = buildDayConfig 단일 SSOT(DB-only ag1 버퍼 규칙: 첫날=사용자시작~기본종료 / 막날=기본시작~사용자종료 / 중간=기본~기본 / 1일=사용자그대로).
  //   = 옛 MIX ±60분 산술 완전삭제(§19) → 최초생성이 DB-only와 동일 dayConfig = 가이드 날짜별 요금·슬롯 정합(§16/§20).
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  const daySlotsConfig: DaySlotConfig[] = [];

  for (let d = 1; d <= dayCount; d++) {
    const dc = buildDayConfig(d, dayCount, userStartTime, userEndTime, DEFAULT_START_TIME, DEFAULT_END_TIME);
    const slots = calculateSlotsForDay(dc.startTime, dc.endTime, travelPace);
    daySlotsConfig.push({ day: d, startTime: dc.startTime, endTime: dc.endTime, slots });
  }

  const totalSlots = daySlotsConfig.reduce((sum, d) => sum + d.slots, 0);
  console.log(`[V3] ${dayCount}일, 총 ${totalSlots}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분/장소)`);
  daySlotsConfig.forEach(d => console.log(`[V3]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`));

  // ===== Step 1 (Gemini) + DB 사전 로드: 병렬 =====
  // ⏸️ Korean sentiment: 비용 절감 위해 비활성화 (테스트 단계)
  console.log(`[V3] Step1(Gemini) + DB사전로드 병렬 시작...`);

  const [geminiDays, preloaded] = await Promise.all([
    step1_geminiItinerary(formData, dayCount, daySlotsConfig, vibeWeights),
    // ⚠️ 2026-07-08 사장님 SSOT = destinationCoords(도시중심좌표=불변키) 전달 = 좌표10m 매칭 = 중복도시·재발굴 차단.
    preloadCityData(formData.destination, formData.destinationCoords),
  ]);

  _mark('step1_parallel');
  // 🗑️ 2026-07-05 삭제 = dbPlacesMap.size 참조 → seedRawMap.size(실제 시드 후보 수) = 죽은맵 제거 정합 §0/§19
  console.log(`[V3-MIX] Step1 완료 (${_timings['step1_parallel']}ms): Gemini ${geminiDays.length}일, seed ${preloaded.seedRawMap?.size ?? 0}키`);

  // 🧠 2026-07-06 사장님 SSOT = MIX Gemini raw 저장(§18) = 도시id 폴더 + {meta,rawResponse,parsedPlaces}(사장님 예시형식).
  //   = cityId 는 preloadCityData(findCityUnified, 신규도시 자동INSERT)가 확정 = 이 시점(Promise.all 후) 사용가능. rawText 는 step1 이 days.__rawText 로 전달.
  //   ⚠️ 2026-07-06 근본수정 = 옛 fire-and-forget(void..catch) = 배포서버(Replit)서 응답 후 PUT 완료전 잘림 = raw 미저장(비용증발 §18) 근본.
  //     → step2 와 병렬 await 로 전환(§18 자산보장). raw 저장(수백ms) ⊂ step2(수십초) = FE 응답 지연 0(속도 유지) + 배포서버서 안 잘림.
  const geminiRawSave = (async () => {
    if (!preloaded.cityId) return;
    const rawText = (geminiDays as any).__rawText || '';
    const finishReason = (geminiDays as any).__finishReason || 'unknown';
    // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = parsedPlaces = step1 복원 결과(geminiDays = SLIM_KEYS 원명 복원 완료)에서 구성.
    //   옛 "rawText 독자 재파싱" 폐기 = 2026-07-11 §19 = 슬림키가 raw 에 박혀 재입력(reinsert-saved-raw) 미인식되는 회귀(리뷰 적발) 차단.
    //   = 복원 지점 1벌(step1 수신부)만 존재 + rawResponse(원문)는 그대로 보존(§18).
    const parsedPlaces: any[] = [];
    for (const dd of geminiDays as any[]) for (const p of (dd.places || [])) parsedPlaces.push({ day: dd.day, theme: dd.theme, ...p });
    await saveCollectedRaw({
      cityId: preloaded.cityId, stepNum: 90, stepName: 'mix-gemini', content: 'step1', hashKey: 'rawResponse',
      body: {
        meta: { cityId: preloaded.cityId, destination: formData.destination, finishReason, parsedCount: parsedPlaces.length, timestamp: new Date().toISOString() },
        rawResponse: rawText,
        parsedPlaces,
      },
    });
  })().catch((e) => console.warn('[V3] Gemini raw 저장 실패:', (e as Error)?.message));

  // ===== Step 2: 데이터 채우기 (Gemini raw 저장과 병렬 = raw 보장 + 속도 영향 0) =====
  const [result] = await Promise.all([
    step2_enrichAndBuild(
      geminiDays, formData, preloaded, daySlotsConfig,
      dayCount, companionCount, travelPace, paceConfig, vibeWeights,
    ),
    geminiRawSave,
  ]);

  _mark('step2_enrich');

  // ⚠️ 수정금지(승인필요) 2026-05-14 = 사용자 SSOT = 추적 메타 강화 (= Replit 서버 콘솔 접근 X 우회)
  // = 클라이언트 DevTools 콘솔에서 response.metadata 직접 확인 = 백엔드 동작 추적
  // ⚠️ 2026-07-06 = 집계 = step2 metadata(_matched/_unmatched, finalPlaces 기준) 사용. 옛 result.places(항상 빈값→total:0 오집계) 폐기 §19.
  const totalPlaces = (result.metadata as any)?.totalPlaces || 0;
  const matchedCount = (result.metadata as any)?._matched || 0;
  const unmatchedCount = (result.metadata as any)?._unmatched || 0;

  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: Date.now() - _t0,
    _pipelineVersion: 'v3-2step',
    // 🗑️ 2026-07-05 삭제 = sourceMode 메타 노출 = 죽은 토글 §0/§19

    // ⭐ 신규 추적 메타 (= 2026-05-14)
    _matching: {
      total: totalPlaces,
      matched: matchedCount,
      unmatched: unmatchedCount,
      matchRate: totalPlaces > 0 ? Math.round((matchedCount * 100) / totalPlaces) : 0,
    },
    // _save = 저장 요약 메타(옛 백그라운드 키명 폐기 = 2026-07-11 §19, 읽는 곳 0 = 무해)
    _save: {
      started: unmatchedCount > 0,
      targetCount: unmatchedCount,
      note: unmatchedCount > 0
        ? `${unmatchedCount} 곳 = TS + DB INSERT 응답 전 완료 (이미지 = 사후 일괄 2026-07-11)`
        : '미매칭 없음 = 저장 작업 없음',
    },
    _geminiModel: 'gemini-3-flash-preview',
    // 🗑️ 2026-07-05 삭제 = _matchingAlgorithm 문자열 = 옛 3단계 인용(현 matcher 7단계와 불일치) §0/§19
  };

  console.log(`[V3] ===== Pipeline V3 완료 (${Date.now() - _t0}ms) =====`);
  console.log(`[V3]   Step1(Gemini+DB): ${_timings['step1_parallel']}ms`);
  console.log(`[V3]   Step2(채우기): ${_timings['step2_enrich'] - _timings['step1_parallel']}ms`);

  return result;
}
