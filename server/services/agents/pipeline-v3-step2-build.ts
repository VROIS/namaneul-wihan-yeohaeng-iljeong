// Step2 데이터 채우기 + 최종 빌드 = pipeline-v3 분리(2026-07-15 §0 슬림화, 순수 이동)
import type { TripFormData, PlaceResult, DaySlotConfig, TravelPace, VibeWeight } from './types';
import { SEED_CATEGORIES, DEFAULT_START_TIME, DEFAULT_END_TIME } from './types';
// ⚠️ 2026-07-18 §0/§19 = ag3-data-matcher(재export 허브) 삭제 = 실제 파일 직접 import(껍데기 도려내기).
import { matchPlacesWithDB } from './ag3-match-core';
import { saveNewPlacesToDB } from './ag3-save-new-places';
import { preloadCityData } from './ag3-seed-loader';
import {
  calculateTransportPrice, shouldApplyGuidePrice, round2,
  type GuidePriceResult, type TransitPriceResult,
} from '../transport-pricing-service';
import { getEurToKrwRate } from '../exchange-rate';
import { sanitizePriceEur, resolvePrice, normalizeTravelStyle, type GeminiPlace, type GeminiDay } from './pipeline-v3-types';
import { getEnrichmentFunctions } from './pipeline-v3-helpers';
import { buildDayResult } from './pipeline-v3-day-builder';

// =====================================================
// Step 2: 데이터 채우기 + 최종 빌드
// =====================================================

export async function step2_enrichAndBuild(
  geminiDays: GeminiDay[],
  formData: TripFormData,
  preloaded: Awaited<ReturnType<typeof preloadCityData>>,
  daySlotsConfig: DaySlotConfig[],
  dayCount: number,
  companionCount: number,
  travelPace: TravelPace,
  paceConfig: { slotDurationMinutes: number; maxSlotsPerDay: number },
  vibeWeights: VibeWeight[],
): Promise<any> {
  const _t0 = Date.now();

  // ── 2a. Gemini 장소 → PlaceResult 변환 ──
  const allPlaces: PlaceResult[] = [];
  const scheduleMap: { day: number; gPlace: GeminiPlace; placeId: string }[] = [];

  for (const gDay of geminiDays) {
    if (!gDay.places) continue;
    for (const gPlace of gDay.places) {
      const isMeal = gPlace.type === 'lunch' || gPlace.type === 'dinner';
      const placeId = `v3-d${gDay.day}-${allPlaces.length}`;
      // 슬롯 카테고리 = 식사=restaurant 고정 / 그 외 = Gemini seed_category 화이트리스트 통과분만(환각값 null).
      const slotCat = isMeal ? 'restaurant' : (SEED_CATEGORIES.has(gPlace.seed_category || '') ? gPlace.seed_category : null);
      // description=shortform_ko(후킹카피)→DB editorial_summary / personaFitReason=selection_reason_ko(인스타/FOMO)→DB summary_ko
      // 🗑️ 2026-07-05 삭제 = gPlace.reason 폴백 = 프롬프트 미요청 필드(항상 undefined = 死데이터) §0/§19
      const desc = gPlace.shortform_ko || '';
      const persona = gPlace.selection_reason_ko || 'AI 추천 장소';
      const place: PlaceResult = {
        id: placeId,
        name: gPlace.name || 'Unknown Place',
        description: desc,
        // 🧠 2026-07-05 사장님 SSOT = Gemini 정확좌표 살림(옛 lat:0/lng:0 폐기 §19). = 트리거 좌표10m 판정 + saveNewPlacesToDB TS 앵커 힌트 = 동명오매칭 방지(코드 매칭 삭제 2026-07-18 §19).
        lat: gPlace.latitude ?? 0,
        lng: gPlace.longitude ?? 0,
        vibeScore: 7,
        confidenceScore: 5,
        // ⚠️ 2026-05-14 = saveNewPlacesToDB 필터 호환 = 'Gemini AI (New)' 유지
        // = 'Gemini V3' 로 변경 시 = 필터 통과 X = toSave=0 = DB 자동 캐싱 X (= 운영 검증 시 발견)
        sourceType: 'Gemini AI (New)',
        personaFitReason: persona,
        // 🧠 2026-07-05 사장님 SSOT = Gemini seed_category(6종) 보존 = ag3 저장 시 restaurant/attraction 2종 뭉갬 대신 이 값 사용(지점4). 식사는 restaurant.
        tags: isMeal ? ['restaurant', 'food'] : [],
        vibeTags: isMeal ? ['Foodie' as const] : [],
        image: '',
        priceEstimate: sanitizePriceEur(gPlace.price_eur) > 0 ? `€${sanitizePriceEur(gPlace.price_eur)}` : '무료',
        placeTypes: isMeal ? ['restaurant'] : ['tourist_attraction'],
        recommendedTime: gPlace.startTime < '12:00' ? 'morning' : gPlace.startTime < '17:00' ? 'afternoon' : 'evening',
        city: formData.destination,
        koreanPopularityScore: 0,
        googleMapsUrl: '',
        estimatedPriceEur: sanitizePriceEur(gPlace.price_eur),
        // ⚠️ 2026-05-14 = AG3 매칭용 + DB INSERT 매핑
        // = geminiAddress = 행정주소 (= 1순위 매칭 키)
        // = nameKo/nameLocal = saveNewPlacesToDB INSERT 매핑 (= 한국어/원어명 누락 방지)
        geminiAddress: gPlace.address || '',
        nameKo: gPlace.nameKo || null,
        nameLocal: gPlace.nameLocal || null,
        // 🧠 2026-07-05 사장님 SSOT = Gemini 도심거리·카테고리 살림(§20) = saveNewPlacesToDB job 전필드 저장(지점4) = 결손컬럼 채움.
        distanceKmFromCenter: gPlace.distance_km_from_center ?? null,
        // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 슬롯 카테고리 1회 계산(중복식 드리프트 방지) + SEED_CATEGORIES 화이트리스트 검증
        //   (등재 외 Gemini 환각값 = null = 마커 회색퇴화·category_tags 오염 차단).
        //   = slotCategory(취향, AG1 매트릭스→Gemini 이행값) = 매칭행 검증값으로 안 바뀌는 표시 전용 = FE 마커·카드 아이콘 소스.
        seedCategory: slotCat,
        slotCategory: slotCat,
      } as any;
      allPlaces.push(place);
      scheduleMap.push({ day: gDay.day, gPlace, placeId });
    }
  }

  console.log(`[V3-Step2] ${allPlaces.length}곳 PlaceResult 변환 완료`);

  // ── 2b. place 통과 + seed 이미지 폴백 (매칭은 트리거 단일 관문 §19) ──
  // 🗑️ 2026-07-18 §0/§19 = skipImageEnrich 옵션 삭제 = 생성 중 Wikipedia 실시간 보강(죽은코드·옛레거시) 완전제거. 이미지 = fill/image-backfill 사후 일괄(2026-07-11 사진 분리 수술).
  const matchedPlaces = await matchPlacesWithDB(allPlaces, preloaded);
  // 🗑️ 2026-07-05 삭제 = matchedMap = finalPlaceMap 폴백용 데드맵(finalPlaces 가 동일 id 전부 보유) §0/§19
  console.log(`[V3-Step2] DB 매칭 완료 (${Date.now() - _t0}ms)`);

  // 🗑️ 2026-07-05 삭제 = enrichFns 3종 폐기서술 = getRealityCheckForCity(날씨/위기)만 사용 §0/§19

  // 💡 가용시간 자동 계산 (startTime~endTime, 기본 8시간)
  const startH = parseInt((formData.startTime || '09:00').split(':')[0]);
  const startM = parseInt((formData.startTime || '09:00').split(':')[1] || '0');
  const endH = parseInt((formData.endTime || '18:00').split(':')[0]);
  const endM = parseInt((formData.endTime || '18:00').split(':')[1] || '0');
  const availableHours = Math.max(4, round2((endH * 60 + endM - startH * 60 - startM) / 60));
  console.log(`[V3-Step2] 가용시간: ${availableHours}h (${formData.startTime || '09:00'}~${formData.endTime || '18:00'})`);

  // 카테고리 판별 (사용자의 첫 입력 기반)
  const isGuideCategory = shouldApplyGuidePrice(
    (formData.mobilityStyle || 'Moderate') as any,
    (formData.travelStyle || 'Reasonable') as any,
  );
  console.log(`[V3-Step2] 📍 교통 카테고리: ${isGuideCategory ? 'A (드라이빙 가이드)' : 'B (대중교통)'}`);

  const enrichFns = await getEnrichmentFunctions();  // = getRealityCheckForCity 만 사용
  const [eurToKrw, realityCheck, transportPrice] = await Promise.all([
    getEurToKrwRate('[V3]'),
    enrichFns.getRealityCheckForCity(formData.destination),
    // 💰 교통비 산정 (카테고리 자동 분류: 가이드 vs 대중교통)
    calculateTransportPrice({
      companionType: (formData.companionType || 'Couple') as any,
      companionCount,
      mobilityStyle: (formData.mobilityStyle || 'Moderate') as any,
      travelStyle: (formData.travelStyle || 'Reasonable') as any,
      availableHours,
      dayCount,
      isRegionalTravel: false,
    }).catch(err => {
      console.warn('[V3] 교통비 산정 실패, 기본값 사용:', err);
      return null;
    }),
  ]);

  console.log(`[V3-Step2] 환율 + 날씨 + 교통비 병렬 완료 (${Date.now() - _t0}ms)`);
  if (transportPrice) {
    console.log(`[V3-Step2] 💰 교통비: 카테고리 ${transportPrice.category} | 1인/일 €${transportPrice.perPersonPerDay}`);
  }

  // ── 2d. 병합 + summaryKo 생성 ──
  // 🗑️ 2026-07-05 삭제 = celebrityVisits 빈맵 = celebrity 폐기잔재(읽는 곳 없음) §0/§19
  const finalPlaces = await Promise.all(matchedPlaces.map(async (p) => {
    // seedRawMap 조회 (가격 + 인앱 링크용)
    const seedNameEn = p.name ? p.name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "") : "";
    const seedData = preloaded.seedRawMap?.get(seedNameEn);

    // ⚠️ 수정금지(승인필요) 2026-05-20 = price_eur 단일 SSOT = place_seed_raw.priceEur 만 (= ta enrichment 폐기)
    const geminiPrice = p.estimatedPriceEur ?? 0;
    const isMealSlot = (p as any).type === 'lunch' || (p as any).type === 'dinner';
    const mealTypeForPrice: 'lunch' | 'dinner' | undefined =
      (p as any).type === 'lunch' ? 'lunch' :
      (p as any).type === 'dinner' ? 'dinner' :
      undefined;
    const styleForPrice = normalizeTravelStyle(formData.travelStyle);
    const resolvedPrice = resolvePrice(
      geminiPrice, isMealSlot,
      seedData?.priceEur ?? 0,
      mealTypeForPrice, styleForPrice,
    );

    const merged = {
      ...p,
      // 🗑️ 2026-07-05 삭제 = priceEstimate 옛 p.priceEstimate raw 폴백 = 이중소스 → resolvePrice 단일결과만 §0/§19
      estimatedPriceEur: resolvedPrice,
      priceEstimate: resolvedPrice > 0 ? `€${Math.round(resolvedPrice)}` : '무료',
    };

    // ⚠️ 수정금지(승인필요) 2026-06-11 = summary_ko = 후킹 숏폼 한줄요약(앱 차별점) 단일 소스 = seedData.summaryKo 우선 → 구글 리뷰수 폴백.
    // 🗑️ 2026-07-05 삭제 = generateNubiReasonV2 40줄 async껍데기 = 실질 1줄 로직 인라인화(호출부·정의 통삭) §0/§19
    const reviewCount = (merged as any).userRatingCount || 0;
    merged.summaryKo = seedData?.summaryKo
      || (reviewCount >= 50 ? `구글 리뷰 ${reviewCount.toLocaleString()}개` : '데이터 수집 중');

    return merged;
  }));

  // 🗑️ 2026-07-05 삭제 = AWAIT_NEW_PLACES_IMAGES 토글 + else background분기 = true고정 데드경로(await 1벌만) §0/§19
  // fetch(TS) await = PID·검증요소 응답 전 확보(증발 0). 이미지 = 사후 일괄(2026-07-11 사진 분리 수술) = FE 아이콘 폴백
  await saveNewPlacesToDB(finalPlaces, preloaded.cityId, { deferPersist: true }).catch(e =>
    console.error('[V3-Step2] ⚠️ saveNewPlacesToDB(await fetch) 실패:', e?.message || e)
  );

  // 🗑️ 2026-07-18 삭제 = 1차저장 후 loadSeedRawMap 재조회 = 슬롯이 place 직접(흡수 RETURNING·Gemini·TS 로 완비)이라 불필요 §0/§19. day-builder 가 저장 PSR 재매칭하던 419키 SELECT 제거.

  // 🗑️ 2026-07-08 사장님 = 폐업 슬롯 splice 완전삭제 = 슬롯은 그 무엇도 줄일 권한 없음(무단 감소 로직) §19. 슬롯 = scheduleMap = Gemini 곳수 항상 보존.

  // 최종 장소 맵 (= saveNewPlacesToDB 후 = 보강 결과 반영)
  const finalPlaceMap = new Map<string, PlaceResult>();
  for (const fp of finalPlaces) {
    finalPlaceMap.set(fp.id, fp);
  }

  // ── 2e. 일별 스케줄 구성 + 이동시간 계산 ──
  // 🗑️ 2026-07-06 = travelMode(mobilityStyle 힌트) 완전삭제 §19 = pickTransitMode 가 거리(1km)로 mode 결정(DB-only 동형) = mobilityStyle 편향(전부 도보) 결함 근본제거.
  // ⚠️ 2026-07-15 = 루프 본문 = pipeline-v3-day-builder.ts buildDayResult (§0 슬림화, 순수 이동. 로직 변경 0).

  const days: any[] = [];
  let totalTripCostEur = 0;

  for (let d = 1; d <= dayCount; d++) {
    const { dayResult, dailyPerPersonEur } = await buildDayResult(d, {
      formData, preloaded, geminiDays, scheduleMap, finalPlaceMap, daySlotsConfig, paceConfig,
      companionCount, dayCount, isGuideCategory, eurToKrw, transportPrice, availableHours, realityCheck,
    });
    totalTripCostEur += dailyPerPersonEur;
    days.push(dayResult);
  }

  // ── 총 여행 비용 (1인 기준 - OTA 방식) ──
  // totalTripCostEur는 이미 1인 기준으로 합산됨
  const totalPerPersonEur = round2(totalTripCostEur);
  const totalPerPersonKrw = Math.round(totalPerPersonEur * eurToKrw);
  const perPersonPerDay = dayCount > 0 ? round2(totalPerPersonEur / dayCount) : 0;

  console.log(`[V3-Step2] ✅ 완료 (${Date.now() - _t0}ms): ${days.length}일`);
  console.log(`[V3-Step2] 💰 1인 총 비용: €${totalPerPersonEur} / ₩${totalPerPersonKrw.toLocaleString()}`);
  console.log(`[V3-Step2] 💰 1인 1일 평균: €${perPersonPerDay}`);

  // ⚠️ 2026-07-08 사장님 SSOT = 개수보존 3자대조(발각 전용, 보정·삭제 없음) = Gemini 원본 곳수 = scheduleMap = FE days 총합.
  //   슬롯은 그 무엇도 줄일 권한 없음(§19). 불일치는 조립 단계 어딘가의 무언 손실 = 즉시 발각.
  const geminiPlaceCount = geminiDays.reduce((s, gd) => s + (gd.places?.length || 0), 0);
  const feDayPlaceCount = days.reduce((s: number, d: any) => s + d.places.length, 0);
  let assemblyLoss: { gemini: number; schedule: number; fe: number } | null = null;
  if (geminiPlaceCount !== scheduleMap.length || scheduleMap.length !== feDayPlaceCount) {
    assemblyLoss = { gemini: geminiPlaceCount, schedule: scheduleMap.length, fe: feDayPlaceCount };
    console.error(`[V3-Step2] ⚠️ _assemblyLoss 감지: gemini=${geminiPlaceCount} schedule=${scheduleMap.length} fe=${feDayPlaceCount}`);
  }

  // ⚠️ 수정금지(승인필요) 2026-05-09 = saveNewPlacesToDB = 위로 이동 (= days 빌드 전) = 중복 호출 X

  // ── 최종 응답 빌드 (프론트엔드 호환 형식) ──
  const paceLabel = travelPace === 'Packed' ? '빡빡하게' : travelPace === 'Normal' ? '보통' : '여유롭게';

  // ⚠️ 2026-07-06 = 요약 총액 = 일별 합(Σ dailyCost.transportEur) = 가이드 날짜별 요금(첫날/막날 버퍼로 다름)과 days 정합. 옛 perPersonPerDay×dayCount(flat) 폐기 §19.
  const transportTotalEur = round2(days.reduce((s: number, d: any) => s + (d.dailyCost?.breakdown?.transportEur || 0), 0));
  const transportAvgPerDay = dayCount > 0 ? round2(transportTotalEur / dayCount) : 0;
  // 교통비 요약 (카테고리별)
  const transportSummary = transportPrice ? (() => {
    if (transportPrice.category === 'guide') {
      const gp = transportPrice as GuidePriceResult;
      return {
        category: 'guide' as const,
        perPersonPerDay: transportAvgPerDay,  // 날짜별 요금 평균(대표값)
        perPersonPerDayKrw: Math.round(transportAvgPerDay * eurToKrw),
        perPersonTotal: transportTotalEur,     // 일별 합(정확)
        perPersonTotalKrw: Math.round(transportTotalEur * eurToKrw),
        vehicleDescription: gp.vehicleDescription,
        availableHours: gp.availableHours,
        includes200km: gp.includes200km,
        segmentLabel: gp.segmentLabel,
        notes: gp.notes,
      };
    } else {
      const tp = transportPrice as TransitPriceResult;
      return {
        category: 'transit' as const,
        // ⚠️ 2026-07-06 = 대중교통도 일별 합(구간합산) 기준 = days 정합. perPersonPerDay=평균 대표값.
        perPersonPerDay: transportAvgPerDay,
        perPersonPerDayKrw: Math.round(transportAvgPerDay * eurToKrw),
        perPersonTotal: transportTotalEur,
        perPersonTotalKrw: Math.round(transportTotalEur * eurToKrw),
        method: tp.method,
        details: tp.details,
        guideUpsell: {
          perPersonPerDay: tp.guideUpsell.perPersonPerDay,
          perPersonPerDayKrw: Math.round(tp.guideUpsell.perPersonPerDay * eurToKrw),
          vehicleDescription: tp.guideUpsell.vehicleDescription,
          clickable: true,
        },
        notes: tp.notes,
      };
    }
  })() : null;

  // ── 최종 일정 검증 (90% 이상만 프론트 전송) ──
  const result = {
    title: `${formData.destination} ${dayCount}일 여행`,
    destination: formData.destination,
    startDate: formData.startDate,
    endDate: formData.endDate,
    startTime: formData.startTime || DEFAULT_START_TIME,
    endTime: formData.endTime || DEFAULT_END_TIME,
    days,
    vibeWeights,
    companionType: formData.companionType,
    companionCount,
    travelStyle: formData.travelStyle,
    mobilityStyle: formData.mobilityStyle,
    // 💰 비용 (모두 1인 기준 - OTA 방식)
    totalCost: {
      perPersonEur: totalPerPersonEur,
      perPersonKrw: totalPerPersonKrw,
      perPersonPerDay: perPersonPerDay,
      perPersonPerDayKrw: Math.round(perPersonPerDay * eurToKrw),
      eurToKrwRate: eurToKrw,
      currency: 'EUR',
    },
    budget: {
      travelStyle: formData.travelStyle || 'Reasonable',
      dailyBreakdowns: days.map((day: any) => ({
        day: day.day,
        perPersonEur: day.dailyCost?.perPersonEur || 0,
        perPersonKrw: day.dailyCost?.perPersonKrw || 0,
        breakdown: day.dailyCost?.breakdown || {},
      })),
      totals: {
        perPersonTotal: totalPerPersonEur,
        perPersonPerDay: perPersonPerDay,
        transport: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.breakdown?.transportEur || 0), 0),
        meals: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.breakdown?.mealEur || 0), 0),
        entranceFees: days.reduce((sum: number, d: any) => sum + (d.dailyCost?.breakdown?.entranceEur || 0), 0),
      },
    },
    // 💰 교통비 요약 (마케팅 핵심)
    transportSummary,
    realityCheck,
    metadata: {
      travelStyle: formData.travelStyle,
      travelPace,
      travelPaceLabel: paceLabel,
      slotDurationMinutes: paceConfig.slotDurationMinutes,
      totalPlaces: finalPlaces.length,
      mobilityStyle: formData.mobilityStyle,
      companionType: formData.companionType,
      companionCount,
      transportCategory: isGuideCategory ? 'guide' : 'transit',
      availableHours,
      curationFocus: formData.curationFocus,
      generatedAt: new Date().toISOString(),
      pipelineVersion: 'v3-2step',
      // ⚠️ 2026-07-06 = 매칭 집계 = finalPlaces 기준(step2 내부 = 실제 여정 장소). 옛 외부 result.places(항상 빈값 → total:0 오집계) 폐기 §19.
      //   = googlePlaceId 있음 = DB 매칭 완료 / 없음 = 신규(TS 대상 = 응답 전 저장).
      _matched: finalPlaces.filter((p: any) => p.googlePlaceId).length,
      _unmatched: finalPlaces.filter((p: any) => !p.googlePlaceId).length,
      // ⚠️ 2026-07-08 사장님 SSOT = 개수보존 3자대조 결과. null = 정상(보존). 있으면 조립단계 무언손실 = 즉시발각(은폐0).
      _assemblyLoss: assemblyLoss,
    },
  };

  // ⚠️ 수정금지(승인필요) 2026-05-20 = Verifier 완전 폐기 (= 사용자 SSOT = Gemini 0 강제)
  return result;
}
