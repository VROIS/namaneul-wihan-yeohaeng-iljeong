/**
 * 🌟 Celebrity Place Visit Tracker
 * 
 * Nubi 차별화 핵심: 한국 탑 셀럽 10인이 특정 장소를 방문한 흔적을 찾아서
 * nubiReason 1순위로 표시 ("제니(BLACKPINK) 24년 9월 게시")
 * 
 * 방식: Gemini 웹검색으로 각 장소별 셀럽 방문 증거 검색
 * 캐시: geminiWebSearchCache (searchType: 'celebrity_visit'), 7일 캐시
 */

import { getSearchTools } from "./gemini-search-limiter";

// ===== 한국 탑 셀럽 10인 (글로벌 고정 리스트) =====
// 선정 기준: 인스타 팔로워 수 + 해외여행 게시 빈도 + 한국인 여행 트렌드 영향력
export const CELEB_TOP_10 = [
  { name: '제니', handle: 'jennierubyjane', group: 'BLACKPINK', followers: '8800만' },
  { name: '뷔', handle: 'thv', group: 'BTS', followers: '6950만' },
  { name: '리사', handle: 'lalalalisa_m', group: 'BLACKPINK', followers: '1억600만' },
  { name: '로제', handle: 'roses_are_rosie', group: 'BLACKPINK', followers: '8400만' },
  { name: '차은우', handle: 'eaboreu0330', group: 'ASTRO', followers: '4800만' },
  { name: '카리나', handle: 'katarinabluu', group: 'aespa', followers: '2400만' },
  { name: '수지', handle: 'skuukzky', group: '배우', followers: '2050만' },
  { name: '변우석', handle: 'byeonwooseok', group: '배우', followers: '1240만' },
  { name: '손흥민', handle: 'hm_son7', group: '축구선수', followers: '1420만' },
  { name: '송혜교', handle: 'kyo1122', group: '배우', followers: '1780만' },
];

export interface CelebrityVisit {
  found: boolean;
  celebrityName: string;
  celebrityGroup: string;
  date: string; // "24년 9월" 형태
  evidenceType: string; // "인스타 게시물", "기사", "유튜브"
  confidence: number;
}

/**
 * 특정 장소에 대해 셀럽 10인의 방문 흔적을 일괄 검색
 * Gemini 웹검색 1회로 10명 모두 체크 (효율적)
 * 
 * @returns 가장 먼저 발견된 셀럽 방문 정보 (없으면 null)
 */
export async function findCelebrityVisitForPlace(
  placeName: string,
  cityName: string,
): Promise<CelebrityVisit | null> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const ai = new GoogleGenAI({ apiKey });

    const celebList = CELEB_TOP_10.map((c, i) =>
      `${i + 1}. ${c.name} (${c.group}) - @${c.handle}`
    ).join('\n');

    const prompt = `다음 한국 유명 셀럽 중 "${placeName}" (${cityName})을/를 방문한 적이 있는지 찾아주세요.
인스타그램 게시물, 뉴스 기사, 유튜브 영상 등에서 방문 흔적(사진, 해시태그, 위치태그, 언급)을 검색하세요.

셀럽 목록:
${celebList}

중요:
- 실제로 확인된 방문만 답변 (추측 금지)
- 방문 날짜가 가장 최근인 것 우선
- 게시 날짜를 반드시 포함 ("24년 9월", "25년 3월" 등)
- 못 찾으면 found: false

반드시 아래 JSON 형식으로만 답변:
{
  "found": true 또는 false,
  "celebrityName": "셀럽 이름 (예: 제니)",
  "celebrityGroup": "그룹명 (예: BLACKPINK)",
  "date": "게시 날짜 (예: 24년 9월)",
  "evidenceType": "인스타 게시물" 또는 "뉴스 기사" 또는 "유튜브",
  "confidence": 0.0-1.0
}`;

    const tools = getSearchTools("celebrity_tracker");

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        tools: tools,
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.found && parsed.celebrityName && parsed.date) {
        console.log(`[Celebrity] ✅ ${placeName}: ${parsed.celebrityName}(${parsed.celebrityGroup}) ${parsed.date} 방문 발견`);
        return {
          found: true,
          celebrityName: parsed.celebrityName,
          celebrityGroup: parsed.celebrityGroup || '',
          date: parsed.date,
          evidenceType: parsed.evidenceType || '인스타 게시물',
          confidence: parsed.confidence || 0.7,
        };
      }
    }

    return null;
  } catch (error: any) {
    console.warn(`[Celebrity] ${placeName} 검색 실패:`, error?.message || error);
    return null;
  }
}

/**
 * 여러 장소에 대해 셀럽 방문 정보를 일괄 검색
 * 일정표의 장소들(보통 10~20개)에 대해 병렬로 실행
 * 
 * ⚡ 성능 최적화: 주요 명소 5곳만 검색 (전체 타임아웃 30초)
 * 
 * @returns Map<placeId, CelebrityVisit>
 */
export async function findCelebrityVisitsForPlaces(
  places: Array<{ id: string; name: string }>,
  cityName: string,
): Promise<Map<string, CelebrityVisit>> {
  console.log(`[Celebrity] 🌟 ${places.length}개 장소에 대해 셀럽 TOP 10 방문 흔적 검색 시작...`);

  const results = new Map<string, CelebrityVisit>();

  // ⚡ 성능: 전체 타임아웃 30초 (Koyeb 게이트웨이 100초 내 완료 보장)
  const TOTAL_TIMEOUT = 30000;
  const startTime = Date.now();

  // 주요 장소만 선별 (최대 5곳 — 식사 제외, 관광지 우선)
  const targetPlaces = places
    .filter(p => !p.name.toLowerCase().includes('restaurant') && !p.name.toLowerCase().includes('café'))
    .slice(0, 5);

  if (targetPlaces.length === 0) {
    console.log('[Celebrity] 검색 대상 장소 없음, 건너뜀');
    return results;
  }

  // 전체 5곳을 동시 병렬 실행 (각 장소에 개별 타임아웃)
  const batchResults = await Promise.all(
    targetPlaces.map(async (place) => {
      // 개별 장소 타임아웃 8초
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
      const searchPromise = findCelebrityVisitForPlace(place.name, cityName);
      const visit = await Promise.race([searchPromise, timeoutPromise]);
      return { placeId: place.id, visit };
    })
  );

  for (const { placeId, visit } of batchResults) {
    if (visit) {
      results.set(placeId, visit);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Celebrity] 🌟 완료 (${elapsed}ms): ${results.size}/${targetPlaces.length}곳에서 셀럽 방문 흔적 발견`);
  return results;
}
