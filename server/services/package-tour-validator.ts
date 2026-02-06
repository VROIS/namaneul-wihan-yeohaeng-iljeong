/**
 * 패키지 투어 검증 서비스 (Phase 1-2)
 * 
 * 하나투어/모두투어/참좋은여행/노랑풍선 패키지에
 * 해당 장소가 포함되는지 Gemini 웹검색으로 확인
 * 
 * 핵심: 패키지에 포함 = "한국인이 반드시 가는 곳" = verifiedFame 가점
 * 저장: geminiWebSearchCache 테이블 (searchType: "package_tour")
 * 스케줄: 하루 1회 (data-scheduler.ts)
 */

import { db } from "../db";
import { geminiWebSearchCache, places, cities } from "../../shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";

const GEMINI_MODEL = "gemini-3-flash-preview";
const CACHE_DURATION_HOURS = 48; // 패키지 상품은 자주 안 바뀜

// ===== 결과 인터페이스 =====
interface PackageTourResult {
  isPackageTourIncluded: boolean;
  packageMentionCount: number;       // 몇 개 여행사 패키지에 포함
  mentionedBy: string[];             // 포함된 여행사 목록
  samplePackage: string | null;      // 예시 패키지 상품명
  confidence: number;
}

// ===== Gemini 웹검색으로 패키지 포함 여부 확인 =====
async function checkPackageTourWithGemini(
  placeName: string,
  cityName: string,
  countryName: string = ""
): Promise<PackageTourResult | null> {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      console.error("[PackageTour] Gemini API 키 없음");
      return null;
    }

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `한국 패키지 여행사(하나투어, 모두투어, 참좋은여행, 노랑풍선)의 ${cityName} ${countryName} 패키지 여행 상품에 "${placeName}"이 포함되어 있는지 검색해주세요.

다음 JSON으로 응답해주세요:
{
  "found": true 또는 false,
  "isPackageTourIncluded": true 또는 false,
  "packageMentionCount": 몇 개 여행사 패키지에 이 장소가 포함되는지 (숫자, 0-4),
  "mentionedBy": ["하나투어", "모두투어"] (포함된 여행사 이름 배열),
  "samplePackage": "패키지 상품명 예시 (있으면)",
  "confidence": 0.0~1.0 (정보 신뢰도)
}

요구사항:
- 4개 여행사(하나투어, 모두투어, 참좋은여행, 노랑풍선)를 모두 확인
- 해당 도시 패키지에 이 장소가 일정에 포함되는지 확인
- 포함되면 isPackageTourIncluded: true
- 정보를 찾을 수 없으면 {"found": false, "isPackageTourIncluded": false, "packageMentionCount": 0, "mentionedBy": [], "samplePackage": null, "confidence": 0.3} 반환
- 반드시 유효한 JSON만 반환`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          isPackageTourIncluded: parsed.isPackageTourIncluded || false,
          packageMentionCount: parsed.packageMentionCount || 0,
          mentionedBy: Array.isArray(parsed.mentionedBy) ? parsed.mentionedBy : [],
          samplePackage: parsed.samplePackage || null,
          confidence: parsed.confidence || 0.5,
        };
      } catch (parseErr) {
        console.warn(`[PackageTour] JSON 파싱 실패 (${placeName}):`, parseErr);
      }
    }

    console.log(`[PackageTour] ${placeName}: 유효한 응답 없음`);
    return null;
  } catch (error) {
    console.error(`[PackageTour] ${placeName} 검색 실패:`, error);
    return null;
  }
}

// ===== 단일 장소 패키지 투어 검증 =====
async function validatePlacePackageTour(
  placeId: number,
  cityId: number,
  placeName: string,
  cityName: string,
  countryName: string = ""
): Promise<boolean> {
  // 캐시 확인 (48시간)
  const existing = await db.select()
    .from(geminiWebSearchCache)
    .where(and(
      eq(geminiWebSearchCache.placeId, placeId),
      eq(geminiWebSearchCache.searchType, "package_tour"),
      gte(geminiWebSearchCache.fetchedAt, new Date(Date.now() - CACHE_DURATION_HOURS * 60 * 60 * 1000))
    ))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[PackageTour] 캐시 히트: ${placeName}`);
    return true;
  }

  // Gemini 웹검색
  const result = await checkPackageTourWithGemini(placeName, cityName, countryName);

  if (result) {
    await db.insert(geminiWebSearchCache).values({
      placeId,
      cityId,
      searchQuery: `한국 패키지 투어 ${placeName} ${cityName} 포함 여부`,
      searchType: "package_tour",
      rawResult: { text: `${placeName} package tour validation` },
      extractedData: {
        isPackageTourIncluded: result.isPackageTourIncluded,
        packageMentionCount: result.packageMentionCount,
        mentionedBy: result.mentionedBy,
        samplePackage: result.samplePackage,
      } as any,
      confidenceScore: result.confidence,
      isVerified: result.isPackageTourIncluded && result.packageMentionCount >= 2,
      expiresAt: new Date(Date.now() + CACHE_DURATION_HOURS * 60 * 60 * 1000),
    });

    const status = result.isPackageTourIncluded
      ? `포함 (${result.mentionedBy.join(', ')})`
      : '미포함';
    console.log(`[PackageTour] ${placeName}: ${status} (신뢰도: ${result.confidence})`);
    return true;
  }

  return false;
}

// ===== 도시별 검증 =====
export async function validatePackageToursForCity(
  cityId: number
): Promise<{ success: boolean; validated: number; included: number; placesProcessed: number }> {
  console.log(`[PackageTour] 도시 ID ${cityId} 패키지 투어 검증 시작`);

  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    console.error(`[PackageTour] 도시를 찾을 수 없음: ${cityId}`);
    return { success: false, validated: 0, included: 0, placesProcessed: 0 };
  }

  // 관광 명소/랜드마크만 대상
  const cityPlaces = await db.select()
    .from(places)
    .where(eq(places.cityId, cityId));

  const targetPlaces = cityPlaces.filter(p =>
    ['attraction', 'landmark', 'museum', 'activity', 'tour', 'park', 'historic'].includes(p.type)
  );

  console.log(`[PackageTour] ${city.name}: 총 ${cityPlaces.length}곳 중 ${targetPlaces.length}곳 대상`);

  let validated = 0;
  let included = 0;

  for (const place of targetPlaces) {
    try {
      const success = await validatePlacePackageTour(
        place.id,
        cityId,
        place.name,
        city.name,
        city.country || ""
      );

      if (success) validated++;

      // 포함 여부 확인
      const [cached] = await db.select()
        .from(geminiWebSearchCache)
        .where(and(
          eq(geminiWebSearchCache.placeId, place.id),
          eq(geminiWebSearchCache.searchType, "package_tour")
        ))
        .orderBy(desc(geminiWebSearchCache.fetchedAt))
        .limit(1);

      if (cached?.extractedData && (cached.extractedData as any).isPackageTourIncluded) {
        included++;
      }

      // API 레이트 리밋 방지 (1초 딜레이)
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`[PackageTour] ${place.name} 검증 실패:`, error);
    }
  }

  console.log(`[PackageTour] ${city.name} 검증 완료: ${validated}곳 검증, ${included}곳 패키지 포함`);
  return { success: true, validated, included, placesProcessed: targetPlaces.length };
}

// ===== 전체 도시 검증 =====
export async function validateAllPackageTours(): Promise<{
  success: boolean;
  totalValidated: number;
  totalIncluded: number;
  citiesProcessed: number;
}> {
  console.log("[PackageTour] 전체 패키지 투어 검증 시작...");

  const allCities = await db.select().from(cities);
  let totalValidated = 0;
  let totalIncluded = 0;

  for (const city of allCities) {
    const result = await validatePackageToursForCity(city.id);
    totalValidated += result.validated;
    totalIncluded += result.included;

    // 도시 간 딜레이 (2초)
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[PackageTour] 전체 검증 완료: ${totalValidated}곳 검증, ${totalIncluded}곳 패키지 포함 (${allCities.length}개 도시)`);
  return { success: true, totalValidated, totalIncluded, citiesProcessed: allCities.length };
}

// ===== 특정 장소의 패키지 투어 포함 여부 조회 =====
export async function getPlacePackageTourStatus(placeId: number): Promise<{
  isPackageTourIncluded: boolean;
  packageMentionCount: number;
  mentionedBy: string[];
  samplePackage: string | null;
  confidence: number;
  fetchedAt: Date | null;
} | null> {
  const [cached] = await db.select()
    .from(geminiWebSearchCache)
    .where(and(
      eq(geminiWebSearchCache.placeId, placeId),
      eq(geminiWebSearchCache.searchType, "package_tour")
    ))
    .orderBy(desc(geminiWebSearchCache.fetchedAt))
    .limit(1);

  if (!cached || !cached.extractedData) return null;

  const data = cached.extractedData as any;
  return {
    isPackageTourIncluded: data.isPackageTourIncluded || false,
    packageMentionCount: data.packageMentionCount || 0,
    mentionedBy: data.mentionedBy || [],
    samplePackage: data.samplePackage || null,
    confidence: cached.confidenceScore || 0,
    fetchedAt: cached.fetchedAt,
  };
}

// ===== 통계 조회 =====
export async function getPackageTourStats(): Promise<{
  totalValidated: number;
  totalIncluded: number;
  inclusionRate: number;
  topIncludedPlaces: Array<{
    placeName: string;
    mentionCount: number;
    mentionedBy: string[];
  }>;
}> {
  const allData = await db.select()
    .from(geminiWebSearchCache)
    .where(eq(geminiWebSearchCache.searchType, "package_tour"));

  const includedData = allData.filter(d =>
    d.extractedData && (d.extractedData as any).isPackageTourIncluded
  );

  // 장소 이름 가져오기
  const placeIds = [...new Set(allData.map(d => d.placeId).filter(Boolean))] as number[];
  const placesData = placeIds.length > 0
    ? await db.select({ id: places.id, name: places.name }).from(places)
    : [];
  const placeNameMap = new Map(placesData.map(p => [p.id, p.name]));

  // 패키지 포함된 곳 중 멘션 많은 순
  const topIncluded = includedData
    .sort((a, b) =>
      ((b.extractedData as any).packageMentionCount || 0) -
      ((a.extractedData as any).packageMentionCount || 0)
    )
    .slice(0, 10)
    .map(d => ({
      placeName: placeNameMap.get(d.placeId!) || "Unknown",
      mentionCount: (d.extractedData as any).packageMentionCount || 0,
      mentionedBy: (d.extractedData as any).mentionedBy || [],
    }));

  return {
    totalValidated: allData.length,
    totalIncluded: includedData.length,
    inclusionRate: allData.length > 0
      ? Math.round((includedData.length / allData.length) * 100)
      : 0,
    topIncludedPlaces: topIncluded,
  };
}
