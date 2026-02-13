/**
 * nubiReason 배치 수집 서비스
 *
 * 카테고리별 30장소 → 10곳씩 3배치 → Gemini 1회/배치 → 4단계 검증 → DB 저장
 * 기존 크롤러(인스타/유튜브/네이버/패키지/여행앱) 개별 호출 대체
 *
 * 우선순위: 1.인스타(셀럽20인) 2.유튜브 3.네이버블로그 4.4대여행사패키지 5.여행앱
 * 4대 여행사: 하나투어·모두투어·참좋은여행·노랑풍선
 * 여행앱: 마이리얼트립·클룩·트립닷컴
 */

import { db } from "../db";
import {
  places,
  cities,
  celebEvidence,
  placeNubiReasons,
} from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";

const BATCH_SIZE = 10;
const SOURCE_TYPES = ["instagram", "youtube", "naver_blog", "package", "travel_app"] as const;
const INSTAGRAM_UNAVAILABLE = "Sorry, this page isn't available";
const YOUTUBE_UNAVAILABLE = "Video unavailable";

export interface NubiReasonBatchItem {
  placeName: string;
  sourceRank: number;
  sourceType: string;
  nubiReason: string;
  evidenceUrl: string;
  verified: boolean;
}

export interface NubiReasonBatchResult {
  batchIndex: number;
  totalProcessed: number;
  saved: number;
  failed: number;
  errors: string[];
}

/**
 * placeName → placeId 매칭 (place-linker 로직 활용)
 */
function matchPlaceNameToId(
  placeName: string,
  lookup: Array<{ id: number; name: string; nameLower: string; displayNameKo: string | null; aliases: string[] }>
): number | null {
  const target = placeName.toLowerCase().trim();
  if (!target || target.length < 2) return null;

  for (const p of lookup) {
    if (p.nameLower === target) return p.id;
  }
  for (const p of lookup) {
    if (p.displayNameKo && p.displayNameKo.toLowerCase().trim() === target) return p.id;
  }
  for (const p of lookup) {
    for (const alias of p.aliases) {
      if (alias.toLowerCase().trim() === target) return p.id;
    }
  }
  if (target.length >= 4) {
    for (const p of lookup) {
      if (p.nameLower.includes(target) || target.includes(p.nameLower)) return p.id;
      if (p.displayNameKo) {
        const koLower = p.displayNameKo.toLowerCase().trim();
        if (koLower.includes(target) || target.includes(koLower)) return p.id;
      }
    }
  }
  return null;
}

/**
 * 3단계: evidenceUrl 실제 검증 (fetch 후 "Sorry, this page isn't available" 등 확인)
 */
async function verifyEvidenceUrl(url: string, sourceType: string): Promise<boolean> {
  if (!url || !url.startsWith("http")) return false;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NubiBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (sourceType === "instagram" && text.includes(INSTAGRAM_UNAVAILABLE)) return false;
    if (sourceType === "youtube" && text.includes(YOUTUBE_UNAVAILABLE)) return false;
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 마크다운 [url](...) 형식에서 순수 URL 추출
 */
function extractPureUrl(str: string): string {
  if (!str) return "";
  const match = str.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (match) return match[2].trim();
  return str.trim();
}

/**
 * 10곳 배치 1회: Gemini 호출 → 4단계 검증 → DB 저장
 */
export async function collectNubiReasonBatch(
  cityId: number,
  cityName: string,
  placeNames: string[],
  batchIndex: number = 0
): Promise<NubiReasonBatchResult> {
  const errors: string[] = [];
  let saved = 0;
  let failed = 0;

  if (!db) {
    return { batchIndex, totalProcessed: 0, saved: 0, failed: 0, errors: ["DB 연결 없음"] };
  }

  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { batchIndex, totalProcessed: 0, saved: 0, failed: 0, errors: ["Gemini API 키 없음"] };
  }

  // 셀럽 20인 (celeb_evidence 테이블)
  const celebRows = await db
    .select({ name: celebEvidence.name, instagramHandle: celebEvidence.instagramHandle })
    .from(celebEvidence)
    .where(eq(celebEvidence.isActive, true))
    .orderBy(celebEvidence.rank);

  const celebList = celebRows.map((c) => `@${c.instagramHandle} (${c.name})`).join(", ");
  const placeList = placeNames.join(", ");

  const prompt = `당신은 장소별 "한 줄 추천 이유"를 수집하고 그 근거 URL을 검증하는 작업을 수행합니다.

## 규칙
- ${placeNames.length}곳 모두 채워야 하며, 빈 곳이 있으면 안 됩니다.
- 우선순위 1→5 순으로 검색해, 첫 번째로 확인된 출처를 사용합니다.

## 우선순위
1. 인스타그램 — 셀럽 20인 중 해당 장소 방문 게시
2. 유튜브 — 한국 유튜버가 해당 장소 언급한 영상
3. 네이버 블로그 — 해당 장소 리뷰/후기 게시물
4. 4대 여행사 패키지 — 하나투어·모두투어·참좋은여행·노랑풍선 등 패키지 일정에 포함
5. 여행앱 — 마이리얼트립·클룩·트립닷컴 등 평점/리뷰 출처

## 입력 (${cityName} ${placeNames.length}곳)
${placeList}

## 셀럽 20인
${celebList}

## 절차
1단계: 각 장소에 대해 1→5 순으로 검색해 evidenceUrl을 찾고, nubiReason을 정리합니다.
2단계: 찾은 evidenceUrl 각각을 실제로 열어보고, "Sorry, this page isn't available"(인스타), "Video unavailable"(유튜브) 등이 없으면 verified:true로 표시합니다.
3단계: evidenceUrl은 마크다운 형식 없이 순수 URL만 반환합니다.

## 산출물 (JSON 배열)
[
  {"placeName":"장소명","sourceRank":1,"sourceType":"instagram","nubiReason":"리사 24년 5월 게시","evidenceUrl":"https://www.instagram.com/p/xxx","verified":true},
  ...
]

필드: placeName, sourceRank(1~5), sourceType(instagram|youtube|naver_blog|package|travel_app), nubiReason, evidenceUrl(순수URL만), verified`;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const tools = getSearchTools("nubi_reason_batch");

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: tools ? { tools } : {},
    });

    const text = (response as any).text || "";
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      errors.push("JSON 배열 파싱 실패");
      return { batchIndex, totalProcessed: 0, saved: 0, failed: placeNames.length, errors };
    }

    // 1단계: JSON 파싱
    let items: NubiReasonBatchItem[];
    try {
      items = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(items)) {
        errors.push("응답이 배열이 아님");
        return { batchIndex, totalProcessed: 0, saved: 0, failed: placeNames.length, errors };
      }
    } catch (e) {
      errors.push("JSON 파싱 오류: " + (e as Error).message);
      return { batchIndex, totalProcessed: 0, saved: 0, failed: placeNames.length, errors };
    }

    // 장소 lookup (placeName → placeId)
    const dbPlaces = await db
      .select({
        id: places.id,
        name: places.name,
        displayNameKo: places.displayNameKo,
        aliases: places.aliases,
      })
      .from(places)
      .where(eq(places.cityId, cityId));

    const lookup = dbPlaces.map((p) => ({
      id: p.id,
      name: p.name,
      nameLower: p.name.toLowerCase().trim(),
      displayNameKo: p.displayNameKo || null,
      aliases: (p.aliases as string[]) || [],
    }));

    for (const item of items) {
      // 2단계: 필드 검증
      if (!item.placeName || !item.nubiReason) {
        failed++;
        continue;
      }
      const rank = Number(item.sourceRank);
      if (rank < 1 || rank > 5) {
        failed++;
        continue;
      }
      const st = String(item.sourceType || "").toLowerCase();
      if (!SOURCE_TYPES.includes(st as (typeof SOURCE_TYPES)[number])) {
        failed++;
        continue;
      }

      const evidenceUrl = extractPureUrl(item.evidenceUrl || "");

      // 3단계: URL 검증 (evidenceUrl이 있을 때만)
      let verified = Boolean(item.verified);
      if (evidenceUrl && (st === "instagram" || st === "youtube")) {
        verified = await verifyEvidenceUrl(evidenceUrl, st);
      }

      // 4단계: placeId 매칭 후 DB 저장
      const placeId = matchPlaceNameToId(item.placeName, lookup);
      if (!placeId) {
        failed++;
        errors.push(`placeId 매칭 실패: ${item.placeName}`);
        continue;
      }

      try {
        await db
          .insert(placeNubiReasons)
          .values({
            placeId,
            cityId,
            placeName: item.placeName,
            sourceRank: rank,
            sourceType: st,
            nubiReason: item.nubiReason,
            evidenceUrl: evidenceUrl || null,
            verified,
          })
          .onConflictDoUpdate({
            target: [placeNubiReasons.placeId],
            set: {
              sourceRank: rank,
              sourceType: st,
              nubiReason: item.nubiReason,
              evidenceUrl: evidenceUrl || null,
              verified,
              fetchedAt: new Date(),
            },
          });
        saved++;
      } catch (e) {
        failed++;
        errors.push(`${item.placeName} 저장 실패: ${(e as Error).message}`);
      }
    }

    return {
      batchIndex,
      totalProcessed: items.length,
      saved,
      failed,
      errors,
    };
  } catch (e: any) {
    errors.push("Gemini 호출 실패: " + (e?.message || e));
    return {
      batchIndex,
      totalProcessed: 0,
      saved: 0,
      failed: placeNames.length,
      errors,
    };
  }
}

/**
 * 도시+카테고리별 DB 장소명 조회 (최대 30곳)
 * displayNameKo 우선, 없으면 name 사용
 */
export async function getPlaceNamesForCategory(
  cityId: number,
  category: string,
  limit: number = 30
): Promise<string[]> {
  if (!db) return [];
  const rows = await db
    .select({
      displayNameKo: places.displayNameKo,
      name: places.name,
    })
    .from(places)
    .where(
      and(
        eq(places.cityId, cityId),
        or(eq(places.seedCategory, category), eq(places.type, category))
      )
    )
    .limit(limit);

  return rows.map((r) => (r.displayNameKo || r.name || "").trim()).filter(Boolean);
}

/**
 * 카테고리별 30곳 → 10곳×3배치 수집
 */
export async function collectNubiReasonsForCategory(
  cityId: number,
  cityName: string,
  placeNames: string[]
): Promise<{ totalSaved: number; totalFailed: number; batchResults: NubiReasonBatchResult[] }> {
  const batchResults: NubiReasonBatchResult[] = [];
  let totalSaved = 0;
  let totalFailed = 0;

  for (let i = 0; i < placeNames.length; i += BATCH_SIZE) {
    const batch = placeNames.slice(i, i + BATCH_SIZE);
    const result = await collectNubiReasonBatch(cityId, cityName, batch, Math.floor(i / BATCH_SIZE));
    batchResults.push(result);
    totalSaved += result.saved;
    totalFailed += result.failed;
    // 배치 간 딜레이 (rate limit 방지)
    if (i + BATCH_SIZE < placeNames.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return { totalSaved, totalFailed, batchResults };
}
