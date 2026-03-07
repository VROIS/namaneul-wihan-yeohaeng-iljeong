/**
 * 🎯 점수 집계 파이프라인 (Score Aggregator)
 * 
 * 각 크롤러가 수집한 데이터를 places 테이블로 집계하여 최소 필수 자산을 확보합니다.
 * 
 * 집계 소스:
 * - tripAdvisorData → buzzScore 보강
 * - placeDataSources → rating 크로스체크
 * - instagramHashtags/instagramLocations → buzzScore 보강
 * - placePrices → priceLevel 업데이트
 * - reviews → tasteVerifyScore 계산
 * - places.vibeScore → vibeScore (기존 값 사용)
 * 
 * 계산 공식:
 * - buzzScore (0-10): Google(40%) + TripAdvisor(30%) + Instagram(20%) + Reviews(10%)
 * - vibeScore (0-10): Gemini Vision 분석 평균
 * - tasteVerifyScore (0-10): 본고장 언어 리뷰 기반
 * - finalScore: (vibeScore + buzzScore + tasteVerifyScore) / 3 - realityPenalty
 * - tier: finalScore 기반 (1=최상 ~ 5=최하)
 */

import { db } from "../db";
import {
  places, placeDataSources, tripAdvisorData,
  reviews,
  instagramHashtags, instagramLocations
} from "@shared/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";

interface AggregationResult {
  success: boolean;
  totalPlaces: number;
  updated: number;
  errors: string[];
}

/**
 * 전체 places 테이블 점수 재계산
 */
export async function aggregateAllScores(): Promise<AggregationResult> {
  const errors: string[] = [];
  let updated = 0;

  try {
    // 모든 places 가져오기
    const allPlaces = await db!.select({
      id: places.id,
      name: places.name,
      userRatingCount: places.userRatingCount,
      vibeScore: places.vibeScore,
      buzzScore: places.buzzScore,
      tasteVerifyScore: places.tasteVerifyScore,
      realityPenalty: places.realityPenalty,
    }).from(places);

    console.log(`[ScoreAgg] 점수 집계 시작: ${allPlaces.length}개 장소`);

    for (const place of allPlaces) {
      try {
        const scores = await calculatePlaceScores(place.id);
        
        // 변경된 점수가 있을 때만 업데이트
        const hasChange = 
          scores.buzzScore !== (place.buzzScore ?? 0) ||
          scores.vibeScore !== (place.vibeScore ?? 0) ||
          scores.tasteVerifyScore !== (place.tasteVerifyScore ?? 0) ||
          scores.finalScore !== undefined;

        if (hasChange) {
          await db!.update(places).set({
            buzzScore: scores.buzzScore,
            vibeScore: scores.vibeScore,
            tasteVerifyScore: scores.tasteVerifyScore,
            finalScore: scores.finalScore,
            tier: scores.tier,
            updatedAt: new Date(),
          }).where(eq(places.id, place.id));
          updated++;
        }
      } catch (e: any) {
        errors.push(`Place ${place.id} (${place.name}): ${e.message}`);
      }
    }

    console.log(`[ScoreAgg] 점수 집계 완료: ${updated}/${allPlaces.length}개 업데이트`);

    return {
      success: errors.length === 0,
      totalPlaces: allPlaces.length,
      updated,
      errors,
    };
  } catch (e: any) {
    console.error("[ScoreAgg] 전체 점수 집계 실패:", e);
    return { success: false, totalPlaces: 0, updated: 0, errors: [e.message] };
  }
}

/**
 * 개별 장소 점수 계산
 */
async function calculatePlaceScores(placeId: number) {
  // 1. Google Places 기본 데이터 (places 테이블에서)
  // rating 컬럼 삭제됨 → buzzScore로 대체 (buzzScore = rating * 2, 0~10 범위)
  const [placeData] = await db!.select({
    buzzScore: places.buzzScore,
    userRatingCount: places.userRatingCount,
    realityPenalty: places.realityPenalty,
    vibeScore: places.vibeScore,
  }).from(places).where(eq(places.id, placeId));

  // 2. TripAdvisor 데이터
  const taData = await db!.select({
    rating: tripAdvisorData.tripAdvisorRating,
    reviewCount: tripAdvisorData.tripAdvisorReviewCount,
    ranking: tripAdvisorData.tripAdvisorRanking,
    rankingTotal: tripAdvisorData.tripAdvisorRankingTotal,
  }).from(tripAdvisorData).where(eq(tripAdvisorData.placeId, placeId)).limit(1);

  // 3. Instagram 데이터 (해시태그 총 포스트 수)
  const instaHashtags = await db!.select({
    postCount: instagramHashtags.postCount,
  }).from(instagramHashtags).where(eq(instagramHashtags.placeId, placeId));

  const instaLocations = await db!.select({
    postCount: instagramLocations.postCount,
  }).from(instagramLocations).where(eq(instagramLocations.placeId, placeId));

  // 4. 리뷰 데이터 (본고장 언어 리뷰)
  const reviewData = await db!.select({
    count: sql<number>`count(*)`.as("count"),
    avgRating: sql<number>`avg(${reviews.rating})`.as("avg_rating"),
  }).from(reviews).where(eq(reviews.placeId, placeId));

  const originatorReviews = await db!.select({
    count: sql<number>`count(*)`.as("count"),
    avgRating: sql<number>`avg(${reviews.rating})`.as("avg_rating"),
  }).from(reviews).where(
    and(eq(reviews.placeId, placeId), eq(reviews.isOriginatorLanguage, true))
  );

  // 5. Vibe Analysis — [DROPPED 0013] 테이블 삭제됨, places.vibeScore 직접 사용

  // === 점수 계산 ===

  // BuzzScore (0-10): 인기도 종합
  // Google Rating (40%) + TripAdvisor (30%) + Instagram (20%) + Reviews (10%)
  let buzzScore = 0;
  let buzzComponents = 0;

  // Google component (0-10): buzzScore는 이미 0~10 범위
  if (placeData?.buzzScore) {
    buzzScore += placeData.buzzScore * 0.4;
    buzzComponents += 0.4;
  }

  // TripAdvisor component (0-10)
  if (taData.length > 0 && taData[0].rating) {
    const taRatingNorm = (taData[0].rating / 5) * 10;
    // 순위 보너스: 상위 10%이면 추가 점수
    let rankBonus = 0;
    if (taData[0].ranking && taData[0].rankingTotal && taData[0].rankingTotal > 0) {
      const percentile = 1 - (taData[0].ranking / taData[0].rankingTotal);
      rankBonus = percentile * 2; // 최대 +2
    }
    buzzScore += Math.min(10, taRatingNorm + rankBonus) * 0.3;
    buzzComponents += 0.3;
  }

  // Instagram component (0-10)
  const totalInstaPosts = 
    instaHashtags.reduce((sum, h) => sum + (h.postCount || 0), 0) +
    instaLocations.reduce((sum, l) => sum + (l.postCount || 0), 0);
  if (totalInstaPosts > 0) {
    // 로그 스케일: 1000 포스트 = 5점, 10000+ = 8점, 100000+ = 10점
    const instaScore = Math.min(10, Math.log10(totalInstaPosts + 1) * 2);
    buzzScore += instaScore * 0.2;
    buzzComponents += 0.2;
  }

  // Review count component (0-10)
  const totalReviews = Number(reviewData[0]?.count || 0);
  if (totalReviews > 0) {
    const reviewScore = Math.min(10, Math.log10(totalReviews + 1) * 3);
    buzzScore += reviewScore * 0.1;
    buzzComponents += 0.1;
  }

  // 데이터가 부족하면 가중치 재분배
  if (buzzComponents > 0 && buzzComponents < 1) {
    buzzScore = buzzScore / buzzComponents;
  }
  buzzScore = Math.round(buzzScore * 10) / 10; // 소수점 1자리

  // VibeScore (0-10): places 테이블 기존 값 사용 (vibe_analysis 테이블 DROP됨)
  const vibeScore = placeData?.vibeScore ?? 0;

  // TasteVerifyScore (0-10): 오리지널 맛 검증
  let tasteVerifyScore = 0;
  const origCount = Number(originatorReviews[0]?.count || 0);
  const origAvg = Number(originatorReviews[0]?.avgRating || 0);
  if (origCount > 0) {
    // 본고장 리뷰가 있으면 평균 rating * 2 (5점제 → 10점제)
    tasteVerifyScore = Math.min(10, origAvg * 2);
    // 리뷰 수 보너스 (3개 이상이면 신뢰도 높음)
    if (origCount >= 3) tasteVerifyScore = Math.min(10, tasteVerifyScore + 0.5);
    if (origCount >= 10) tasteVerifyScore = Math.min(10, tasteVerifyScore + 0.5);
  }
  tasteVerifyScore = Math.round(tasteVerifyScore * 10) / 10;

  // FinalScore: 3대 점수 평균 - 패널티
  const realityPenalty = placeData?.realityPenalty ?? 0;
  const componentsAvailable = [
    buzzScore > 0 ? buzzScore : null,
    vibeScore > 0 ? vibeScore : null,
    tasteVerifyScore > 0 ? tasteVerifyScore : null,
  ].filter(v => v !== null);

  let finalScore = 0;
  if (componentsAvailable.length > 0) {
    finalScore = componentsAvailable.reduce((a, b) => a + b, 0) / componentsAvailable.length;
    finalScore = Math.max(0, finalScore - realityPenalty);
    finalScore = Math.round(finalScore * 10) / 10;
  }

  // Tier: finalScore 기반
  let tier = 5;
  if (finalScore >= 8) tier = 1;      // 최상급
  else if (finalScore >= 6.5) tier = 2; // 우수
  else if (finalScore >= 5) tier = 3;   // 양호
  else if (finalScore >= 3) tier = 4;   // 보통
  else tier = 5;                         // 미평가/낮음

  return { buzzScore, vibeScore, tasteVerifyScore, finalScore, tier };
}

/**
 * 단일 장소 점수 재계산 (크롤러 완료 후 즉시 업데이트용)
 */
export async function recalculateSinglePlace(placeId: number): Promise<void> {
  try {
    const scores = await calculatePlaceScores(placeId);
    await db!.update(places).set({
      buzzScore: scores.buzzScore,
      vibeScore: scores.vibeScore,
      tasteVerifyScore: scores.tasteVerifyScore,
      finalScore: scores.finalScore,
      tier: scores.tier,
      updatedAt: new Date(),
    }).where(eq(places.id, placeId));
  } catch (e) {
    console.error(`[ScoreAgg] 단일 장소 점수 계산 실패 (id: ${placeId}):`, e);
  }
}
