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

    // Google Search 한도 있으면 사용, 없으면 Gemini 자체 지식으로 검색
    // 유명 장소(에펠탑, 루브르 등)는 Gemini 지식만으로도 셀럽 방문 정보 보유
    const tools = getSearchTools("celebrity_tracker");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: tools ? { tools } : {},
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
 * 
 * ⚡ V2 최적화: Google Search 1회로 여러 장소를 한꺼번에 검색
 *   (기존: 장소당 1회씩 5회 → 현재: 1회 배치 검색)
 *   Google Search 한도 절약 + 속도 향상
 * 
 * @returns Map<placeId, CelebrityVisit>
 */
export async function findCelebrityVisitsForPlaces(
  places: Array<{ id: string; name: string }>,
  cityName: string,
): Promise<Map<string, CelebrityVisit>> {
  console.log(`[Celebrity] 🌟 ${places.length}개 장소에 대해 셀럽 TOP 10 방문 흔적 검색 시작...`);

  const results = new Map<string, CelebrityVisit>();
  const startTime = Date.now();

  // 주요 장소만 선별 (최대 5곳 — 식사 제외, 관광지 우선)
  const targetPlaces = places
    .filter(p => {
      const lower = p.name.toLowerCase();
      return !lower.includes('restaurant') && !lower.includes('café') 
        && !lower.includes('cafe') && !lower.includes('bistro')
        && !lower.includes('brasserie') && !lower.includes('walk')
        && !lower.includes('garden') && !lower.includes('jardin');
    })
    .slice(0, 5);

  if (targetPlaces.length === 0) {
    console.log('[Celebrity] 검색 대상 장소 없음, 건너뜀');
    return results;
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return results;

    const ai = new GoogleGenAI({ apiKey });

    const celebList = CELEB_TOP_10.map((c, i) =>
      `${i + 1}. ${c.name} (${c.group}) @${c.handle}`
    ).join('\n');

    const placeList = targetPlaces.map((p, i) =>
      `${i + 1}. ${p.name}`
    ).join('\n');

    // 배치 프롬프트: 한 번의 검색으로 모든 장소 × 모든 셀럽 조합 검색
    const prompt = `아래 한국 유명 셀럽 10인 중 누구든 다음 "${cityName}" 장소들을 방문한 적이 있는지 찾아주세요.
인스타그램 게시물, 뉴스 기사, 유튜브 영상, 블로그 등에서 방문 흔적(사진, 해시태그, 위치태그, 언급)을 검색하세요.

[셀럽 10인]
${celebList}

[장소 ${targetPlaces.length}곳]
${placeList}

중요 규칙:
- 실제로 확인된 방문만 답변 (추측 금지!)
- 게시 날짜를 반드시 포함 ("24년 9월" 형식)
- 각 장소에 대해 방문 확인된 셀럽이 있으면 포함
- 방문 확인 안 된 장소는 생략

반드시 아래 JSON 배열 형식으로만 답변 (마크다운 코드블록 없이):
[
  {
    "placeName": "장소명 (위 목록과 정확히 동일하게)",
    "celebrityName": "셀럽 이름",
    "celebrityGroup": "그룹명",
    "date": "게시 날짜 (예: 24년 9월)",
    "evidenceType": "인스타 게시물 또는 뉴스 기사",
    "confidence": 0.0-1.0
  }
]
방문 확인된 장소가 하나도 없으면: []`;

    const tools = getSearchTools("celebrity_tracker");

    // 25초 타임아웃 (Google Search grounding 포함 시 충분한 시간 필요)
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25000));
    const searchPromise = ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: tools ? { tools } : {},
    });

    const response = await Promise.race([searchPromise, timeoutPromise]);
    if (!response) {
      console.log('[Celebrity] ⏱️ 배치 검색 타임아웃 (25초)');
      return results;
    }

    const text = (response as any).text || "";
    // JSON 배열 파싱
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item.placeName || !item.celebrityName || !item.date) continue;
          // placeName으로 placeId 매칭
          const matchedPlace = targetPlaces.find(
            p => p.name.toLowerCase() === item.placeName.toLowerCase()
              || p.name.toLowerCase().includes(item.placeName.toLowerCase())
              || item.placeName.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matchedPlace) {
            console.log(`[Celebrity] ✅ ${matchedPlace.name}: ${item.celebrityName}(${item.celebrityGroup}) ${item.date}`);
            results.set(matchedPlace.id, {
              found: true,
              celebrityName: item.celebrityName,
              celebrityGroup: item.celebrityGroup || '',
              date: item.date,
              evidenceType: item.evidenceType || '인스타 게시물',
              confidence: item.confidence || 0.7,
            });
          }
        }
      }
    }
  } catch (error: any) {
    console.warn(`[Celebrity] 배치 검색 실패:`, error?.message || error);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Celebrity] 🌟 완료 (${elapsed}ms): ${results.size}/${targetPlaces.length}곳에서 셀럽 방문 흔적 발견`);
  return results;
}

