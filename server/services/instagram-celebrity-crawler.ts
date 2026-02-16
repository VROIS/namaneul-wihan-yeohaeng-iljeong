/**
 * 셀럽 인스타그램 흔적 크롤러
 *
 * 이미 확보된 장소(place_seed 기준)에 대해 20인 셀럽의 인스타 흔적을 검색
 * 수집: 이미지 URL (최상순위 노출), 게시물 URL, 날짜
 * 저장: celebrity_place_evidence
 */

import { db } from "../db";
import { places, cities, celebEvidence, celebrityPlaceEvidence } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSearchTools } from "./gemini-search-limiter";

const BATCH_SIZE = 5; // 한 번에 검색할 장소 수 (Gemini Search 한도 절약)
const PLACES_LIMIT = 30; // 도시당 최대 검색 장소 수 (시딩 완료 카테고리·인기순 우선)

interface CelebPlaceMatch {
  placeName: string;
  placeId: number;
  celebName: string;
  celebId: number;
  instagramHandle: string;
  imageUrl: string | null;
  postUrl: string | null;
  postedAt: string | null;
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 도시별 장소에 대해 20인 셀럽 인스타 흔적 검색 후 DB 저장
 */
export async function crawlCelebrityInstagramForCity(cityId: number): Promise<{
  placesProcessed: number;
  evidenceFound: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let evidenceFound = 0;

  if (!db) {
    return { placesProcessed: 0, evidenceFound: 0, errors: ["DB 연결 없음"] };
  }

  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { placesProcessed: 0, evidenceFound: 0, errors: ["Gemini API 키 없음"] };
  }

  const [city] = await db.select().from(cities).where(eq(cities.id, cityId));
  if (!city) {
    return { placesProcessed: 0, evidenceFound: 0, errors: ["도시 없음"] };
  }

  const cityName = city.nameEn || city.name || "Paris";

  // 시딩 완료 카테고리·인기순(finalScore) 우선 — 파리 2카테고리 30곳 등 실제 수집된 장소
  const placeRows = await db
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(eq(places.cityId, cityId))
    .orderBy(desc(places.finalScore), desc(places.buzzScore))
    .limit(PLACES_LIMIT);

  const celebRows = await db
    .select({ id: celebEvidence.id, name: celebEvidence.name, instagramHandle: celebEvidence.instagramHandle })
    .from(celebEvidence)
    .where(eq(celebEvidence.isActive, true))
    .orderBy(celebEvidence.rank);

  if (placeRows.length === 0) {
    console.log(`[CelebInstagram] ${cityName}: 장소 없음, 스킵`);
    return { placesProcessed: 0, evidenceFound: 0, errors: [] };
  }

  if (celebRows.length === 0) {
    console.log(`[CelebInstagram] celeb_evidence 비어있음. npm run seed:celeb 실행 필요`);
    return { placesProcessed: 0, evidenceFound: 0, errors: ["celeb_evidence 테이블 비어있음"] };
  }

  console.log(`[CelebInstagram] ${cityName}: ${placeRows.length}곳 × ${celebRows.length}인 셀럽 검색 시작`);

  const celebList = celebRows.map((c) => `@${c.instagramHandle} (${c.name})`).join(", ");

  for (let i = 0; i < placeRows.length; i += BATCH_SIZE) {
    const batch = placeRows.slice(i, i + BATCH_SIZE);
    const placeList = batch.map((p) => p.name).join(", ");

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `다음 ${cityName} 장소들 중, 아래 한국 셀럽 20인 중 누군가 인스타그램에 게시한 적이 있는지 검색하세요.
인스타그램 게시물, 위치태그, 해시태그 등에서 방문 흔적을 찾으세요.

[장소 ${batch.length}곳]
${placeList}

[셀럽 20인]
${celebList}

실제로 확인된 방문만 답변하세요. 각 매칭에 대해:
- imageUrl: 인스타 게시물 이미지의 직접 URL (가능하면 CDN URL)
- postUrl: 인스타그램 게시물 링크 (https://www.instagram.com/p/xxx/)
- postedAt: "24년 9월" 형식

반드시 JSON 배열만 반환 (마크다운 없이):
[
  {"placeName":"정확한 장소명","celebrityName":"셀럽명","instagramHandle":"핸들(앳제외)","imageUrl":"이미지URL","postUrl":"게시물URL","postedAt":"24년 9월"},
  ...
]
매칭 없으면 []`;

      let tools = getSearchTools("instagram_celebrity");
      let response: any;

      try {
        response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: tools ? { tools } : {},
        });
      } catch (apiErr: any) {
        // 429 등 할당량 초과 시 Search 없이 재시도 (Gemini 지식만으로 유명 장소 매칭 가능)
        const errStr = String(apiErr?.message || apiErr || "");
        if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
          console.warn(`[CelebInstagram] API 할당량 초과 → Search 없이 재시도`);
          tools = undefined;
          response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {},
          });
        } else {
          throw apiErr;
        }
      }

      const text = (response as any).text || "";
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        await delay(2000);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        await delay(2000);
        continue;
      }

      for (const item of parsed) {
        if (!item.placeName || !item.celebrityName) continue;

        const place = batch.find(
          (p) =>
            p.name.toLowerCase() === (item.placeName || "").toLowerCase() ||
            (item.placeName || "").toLowerCase().includes(p.name.toLowerCase())
        );
        if (!place) continue;

        const celeb = celebRows.find(
          (c) =>
            c.name === item.celebrityName ||
            (item.instagramHandle && c.instagramHandle === item.instagramHandle?.replace("@", ""))
        );
        if (!celeb) continue;

        const imageUrl = item.imageUrl || null;
        const postUrl = item.postUrl || null;
        const postedAt = item.postedAt || null;

        const existing = await db
          .select()
          .from(celebrityPlaceEvidence)
          .where(and(eq(celebrityPlaceEvidence.placeId, place.id), eq(celebrityPlaceEvidence.celebId, celeb.id)));

        if (existing.length === 0) {
          await db.insert(celebrityPlaceEvidence).values({
            placeId: place.id,
            celebId: celeb.id,
            imageUrl,
            postUrl,
            postedAt,
            caption: item.caption || null,
            likeCount: item.likeCount ?? null,
          });
          evidenceFound++;
          console.log(`[CelebInstagram] ✅ ${place.name}: @${celeb.instagramHandle} ${postedAt || "날짜없음"}`);
        }
      }

      await delay(3000);
    } catch (e: any) {
      errors.push(`배치 ${i}-${i + batch.length}: ${e?.message || e}`);
      console.warn(`[CelebInstagram] 배치 실패:`, e?.message);
    }
  }

  console.log(`[CelebInstagram] ${cityName} 완료: ${evidenceFound}건 흔적 발견`);
  return {
    placesProcessed: placeRows.length,
    evidenceFound,
    errors,
  };
}
