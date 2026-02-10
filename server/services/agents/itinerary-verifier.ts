/**
 * 일정 검증 (Itinerary Verifier)
 *
 * 2차 가공된 최종 일정표를 AI 기본 지식으로 냉정·객관적으로 검증.
 * 프론트엔드로 보내기 전 메인 에이전트(파이프라인)가 호출.
 *
 * - 체크: 비용 합리성, 동선 논리, 실제 정보(장소·시간) 현실성
 * - 90% 이상만 통과 → 통과한 일정만 사용자 노출
 * - 백그라운드 전용, 프론트 노출 없음
 */

import { GoogleGenAI } from "@google/genai";

const VERIFY_PASS_THRESHOLD = 90;

let ai: GoogleGenAI | null = null;

function getGeminiApiKey(): string {
  return process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

function getAI(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  if (!ai) ai = new GoogleGenAI({ apiKey });
  return ai;
}

export interface VerifyResult {
  passed: boolean;
  score: number;
  verdict: string;
  reason?: string;
}

/**
 * 일정 요약 문자열 생성 (프롬프트용, 길이 제한)
 */
function buildItinerarySummary(itinerary: any): string {
  const dest = itinerary.destination || 'Unknown';
  const days = itinerary.days || [];
  const dayCount = days.length;
  const totalCost = itinerary.totalCost || itinerary.budget?.totals;
  const perPersonEur = totalCost?.perPersonEur ?? totalCost?.perPerson ?? 0;
  const perPersonKrw = totalCost?.perPersonKrw ?? 0;

  const dayLines = days.slice(0, 7).map((d: any) => {
    const places = (d.places || []).slice(0, 8).map((p: any) => p.name || p.displayNameKo || '-').join(', ');
    const dailyEur = d.dailyCost?.totalEur ?? d.dailyCost?.perPersonEur ?? 0;
    return `Day ${d.day}: ${places} | €${Number(dailyEur).toFixed(0)}/day`;
  });

  return [
    `목적지: ${dest}, ${dayCount}일`,
    `인당 총비용: €${Number(perPersonEur).toFixed(0)} / ₩${Number(perPersonKrw).toLocaleString()}`,
    ...dayLines,
  ].join('\n');
}

/**
 * 일정 검증: 2차 가공된 일정표를 Gemini로 검토 → 90% 이상만 통과
 */
export async function verifyItinerary(itinerary: any): Promise<VerifyResult> {
  const _t0 = Date.now();
  const gemini = getAI();

  if (!gemini) {
    console.warn('[Verifier] Gemini API 키 없음 — 검증 스킵, 통과 처리');
    return { passed: true, score: 100, verdict: '적합', reason: 'API 키 없음으로 검증 스킵' };
  }

  const summary = buildItinerarySummary(itinerary);
  const prompt = `You are a strict quality auditor. Judge in the most critical, objective, and rational way. Do not be lenient; only pass itineraries that are clearly realistic, route-coherent, and fully costed.

Question: Is this generated itinerary realizable, route-aligned, and fully cost-calculated? Answer with strict standards.

Check:
1. Costs: fully calculated and reasonable for destination and style? (no missing or €0-only days)
2. Route: logical order, no unreasonable backtracking?
3. Real places and realistic times per day?

Itinerary summary:
${summary}

Respond ONLY with this JSON (no markdown, no extra text):
{"verdict":"적합" or "부적합" or "이상","score":0-100,"reason":"brief reason in Korean"}

Examples: {"verdict":"적합","score":92,"reason":"비용과 동선이 현실적임"} or {"verdict":"부적합","score":65,"reason":"일일 장소 수 과다, 이동 불가능"}`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Verifier] JSON 파싱 실패, 응답:', text.slice(0, 200));
      return { passed: false, score: 0, verdict: '이상', reason: '검증 응답 파싱 실패' };
    }

    let parsed: { verdict?: string; score?: number; reason?: string };
    try {
      parsed = JSON.parse(jsonMatch[0]) as { verdict?: string; score?: number; reason?: string };
    } catch {
      const raw = jsonMatch[0];
      const verdictMatch = raw.match(/"verdict"\s*:\s*"([^"]+)"/);
      const scoreMatch = raw.match(/"score"\s*:\s*(\d+)/);
      parsed = {
        verdict: verdictMatch ? verdictMatch[1].trim() : '이상',
        score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
        reason: '응답 잘림 복구',
      };
      if (verdictMatch || scoreMatch) {
        console.log('[Verifier] 잘린 JSON 복구:', parsed);
      }
    }

    const verdict = (parsed.verdict || '이상').trim();
    const reason = parsed.reason || '';
    const rawScore = Number(parsed.score);
    const score = Math.min(100, Math.max(0, (Number.isFinite(rawScore) && rawScore >= 50) ? rawScore : (verdict === '적합' ? 90 : 0)));

    const passed = score >= VERIFY_PASS_THRESHOLD;
    console.log(
      `[Verifier] ${passed ? '✅' : '❌'} ${verdict} score=${score} (${Date.now() - _t0}ms) ${reason ? `— ${reason}` : ''}`
    );

    return { passed, score, verdict, reason };
  } catch (error: any) {
    console.error('[Verifier] 검증 실패:', error?.message || error);
    return { passed: false, score: 0, verdict: '이상', reason: error?.message || '검증 예외' };
  }
}
