import type {
  TripFormData,
  DaySlotConfig,
  TravelPace,
  VibeWeight,
} from "./types";
import {
  PACE_CONFIG,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  calculateDayCount,
  calculateSlotsForDay,
  getCompanionCount,
} from "./types";
import { preloadCityData, loadSeedRawMap } from "./ag3-seed-loader";
import { pickedCountryCode } from "../shared/city-hub";
// 🧠 2026-07-06 사장님 SSOT = MIX Gemini raw = 도시id 폴더 + {meta,rawResponse,parsedPlaces}(사장님 예시형식) 저장 = saveCollectedRaw 단일 헬퍼(§18 2곳). 옛 saveRaw(runtime 봉투) 폐기 §19.
import { saveCollectedRaw } from "../shared/save-collected-raw";
import { itineraryContext } from "../../../../shared/r2-paths";
import { buildDayConfig } from "../transport/day-config";
import { step1_geminiItinerary } from "./pipeline-v3-step1-gemini";
import { step2_enrichAndBuild } from "./pipeline-v3-step2-build";

export async function runPipelineV3(formData: TripFormData): Promise<any> {
  const { isCityReady } = await import("./ag2-gemini-recommender");
  // ⚠️ 수정금지(승인필요) 2026-10-02 사장님 결정 = 출발점 좌표(없으면 이름)로 거점 폴더를 찾는다 = 읽기만, 도시를 만들지 않음 (정본 §)
  const cityCheck = await isCityReady(
    formData.destination,
    (formData as any).accommodationCoords ?? formData.destinationCoords,
    pickedCountryCode((formData as any).destinationPlace),
  );
  // ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 핀·베스트·준비됨 갈림은 라우트(routes-itinerary-generate-db.ts)가 먼저 판정한다 = 이 함수는 MIX 만 받는다 (정본 §)
  console.log(
    `\n[V3] city='${cityCheck.cityName}' ready=false (손님상 ${cityCheck.count}곳) → MIX 경로`,
  );
  return runPipelineMix(formData, cityCheck.cityId ?? null);
}

async function runPipelineMix(
  formData: TripFormData,
  cityId: number | null,
): Promise<any> {
  const _t0 = Date.now();
  const _timings: Record<string, number> = {};
  const _mark = (label: string) => {
    _timings[label] = Date.now() - _t0;
  };

  console.log(`[V3-MIX] ===== Pipeline MIX (= 옛 V3 step1 살리기) 시작 =====`);

  const dayCount = calculateDayCount(formData.startDate, formData.endDate);
  const travelPace: TravelPace =
    (formData.travelPace as TravelPace) || "Normal";
  const paceConfig = PACE_CONFIG[travelPace];
  const companionCount = getCompanionCount(formData.companionType || "Solo");
  // ⚠️ 수정금지(승인필요) 2026-06-28 사용자 SSOT = vibes 빈값 폴백 = 정식 6 vibe 만 (옛 Foodie→Shopping 교체, §19 완전삭제). Foodie 는 버튼 폐기됨(즐길거리=Attraction / 쇼핑=Shopping). 헤더 "미식" 오염 차단.
  const vibes = formData.vibes || ["Shopping", "Culture", "Healing"];

  const PRIORITY_WEIGHTS: Record<number, number[]> = {
    1: [100],
    2: [60, 40],
    3: [50, 30, 20],
  };
  const weights = PRIORITY_WEIGHTS[vibes.length] || [50, 30, 20];
  const vibeWeights: VibeWeight[] = vibes.map((vibe, i) => ({
    vibe: vibe as any,
    weight: weights[i] / 100,
    percentage: weights[i],
  }));

  // ⚠️ 2026-07-06 사장님 SSOT = 일별 가용시각 = buildDayConfig 단일 SSOT(DB-only ag1 버퍼 규칙: 첫날=사용자시작~기본종료 / 막날=기본시작~사용자종료 / 중간=기본~기본 / 1일=사용자그대로).
  const userStartTime = formData.startTime || DEFAULT_START_TIME;
  const userEndTime = formData.endTime || DEFAULT_END_TIME;
  const daySlotsConfig: DaySlotConfig[] = [];

  for (let d = 1; d <= dayCount; d++) {
    const dc = buildDayConfig(
      d,
      dayCount,
      userStartTime,
      userEndTime,
      DEFAULT_START_TIME,
      DEFAULT_END_TIME,
    );
    const slots = calculateSlotsForDay(dc.startTime, dc.endTime, travelPace);
    daySlotsConfig.push({
      day: d,
      startTime: dc.startTime,
      endTime: dc.endTime,
      slots,
    });
  }

  const totalSlots = daySlotsConfig.reduce((sum, d) => sum + d.slots, 0);
  console.log(
    `[V3] ${dayCount}일, 총 ${totalSlots}슬롯, 밀도: ${travelPace} (${paceConfig.slotDurationMinutes}분/장소)`,
  );
  daySlotsConfig.forEach((d) =>
    console.log(
      `[V3]   Day ${d.day}: ${d.startTime}~${d.endTime} → ${d.slots}곳`,
    ),
  );

  console.log(`[V3] Step1(Gemini) + DB사전로드 병렬 시작...`);

  const [geminiDays, preloaded] = await Promise.all([
    step1_geminiItinerary(
      formData,
      dayCount,
      daySlotsConfig,
      vibeWeights,
      cityId,
    ),
    preloadCityData(
      formData.destination,
      (formData as any).accommodationCoords ?? formData.destinationCoords,
      pickedCountryCode((formData as any).destinationPlace),
    ),
  ]);

  // ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 100km 안에 거점이 없는 새 도시 = 폴더는 만들지 않는다(라우트가 성공 뒤) · 잘라 낸 도심 좌표 100km 안의 창고 행을 다 끌어와 재활용 (정본 §2026-10-27)
  const newCity = (formData as any)._newCity;
  if (!preloaded.cityId && newCity) {
    preloaded.cityName = newCity.meta.nameEn;
    preloaded.cityCoords = newCity.center;
    preloaded.seedRawMap = await loadSeedRawMap(null, newCity.center);
  }

  _mark("step1_parallel");
  console.log(
    `[V3-MIX] Step1 완료 (${_timings["step1_parallel"]}ms): Gemini ${geminiDays.length}일, seed ${preloaded.seedRawMap?.size ?? 0}키`,
  );

  // ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = MIX 제미니 원본 = 도시 폴더(폴더 전 새 도시는 여정 자리 itinerary-{번호}) · step2 와 병렬 await = 응답 전 저장 완료 (정본 §2026-10-27)
  const rawCtx = itineraryContext(preloaded.cityId, (formData as any)._draftId);
  const geminiRawSave = (async () => {
    if (!rawCtx) return;
    const rawText = (geminiDays as any).__rawText || "";
    const finishReason = (geminiDays as any).__finishReason || "unknown";
    // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = parsedPlaces = step1 복원 결과(geminiDays = SLIM_KEYS 원명 복원 완료)에서 구성.
    const parsedPlaces: any[] = [];
    for (const dd of geminiDays as any[])
      for (const p of dd.places || [])
        parsedPlaces.push({ day: dd.day, theme: dd.theme, ...p });
    await saveCollectedRaw({
      cityId: rawCtx,
      stepNum: 90,
      stepName: "mix-gemini",
      content: "step1",
      hashKey: "rawResponse",
      body: {
        meta: {
          cityId: rawCtx,
          destination: formData.destination,
          finishReason,
          parsedCount: parsedPlaces.length,
          timestamp: new Date().toISOString(),
        },
        rawResponse: rawText,
        parsedPlaces,
      },
    });
  })().catch((e) =>
    console.warn("[V3] Gemini raw 저장 실패:", (e as Error)?.message),
  );

  const [result] = await Promise.all([
    step2_enrichAndBuild(
      geminiDays,
      formData,
      preloaded,
      daySlotsConfig,
      dayCount,
      companionCount,
      travelPace,
      paceConfig,
      vibeWeights,
    ),
    geminiRawSave,
  ]);

  _mark("step2_enrich");

  // ⚠️ 수정금지(승인필요) 2026-05-14 = 사용자 SSOT = 추적 메타 강화
  const totalPlaces = (result.metadata as any)?.totalPlaces || 0;
  const matchedCount = (result.metadata as any)?._matched || 0;
  const unmatchedCount = (result.metadata as any)?._unmatched || 0;

  result.metadata = {
    ...result.metadata,
    _timings,
    _totalMs: Date.now() - _t0,
    _pipelineVersion: "v3-2step",

    _matching: {
      total: totalPlaces,
      matched: matchedCount,
      unmatched: unmatchedCount,
      matchRate:
        totalPlaces > 0 ? Math.round((matchedCount * 100) / totalPlaces) : 0,
    },
    _save: {
      started: unmatchedCount > 0,
      targetCount: unmatchedCount,
      note:
        unmatchedCount > 0
          ? `${unmatchedCount} 곳 = TS + DB INSERT 응답 전 완료 (이미지 = 사후 일괄 2026-07-11)`
          : "미매칭 없음 = 저장 작업 없음",
    },
    _geminiModel: "gemini-3-flash-preview",
  };

  (result as any).cityId = preloaded.cityId ?? null;

  // ⚠️ 수정금지(승인필요) 2026-10-27 사장님 결정 = 새 도시 = 라우트가 성공 판정 뒤 폴더 번호를 주면 창고 저장 + 날 다시 짜기 · 이 판의 측정 기록(metadata)은 그대로 두고 매칭 수만 새로 (정본 §2026-10-27)
  const persistStep2 = (result as any).__persistNewCity;
  if (persistStep2)
    (result as any).__persistNewCity = async (cityId: number) => {
      const fresh = await persistStep2(cityId);
      const metadata = {
        ...result.metadata,
        _matched: fresh.metadata._matched,
        _unmatched: fresh.metadata._unmatched,
      };
      Object.assign(result, fresh, { metadata, cityId });
      delete (result as any).__persistNewCity;
      return result;
    };

  console.log(`[V3] ===== Pipeline V3 완료 (${Date.now() - _t0}ms) =====`);
  console.log(`[V3]   Step1(Gemini+DB): ${_timings["step1_parallel"]}ms`);
  console.log(
    `[V3]   Step2(채우기): ${_timings["step2_enrich"] - _timings["step1_parallel"]}ms`,
  );

  return result;
}
