import { GoogleGenAI, Type } from "@google/genai";
import { Itinerary, Vibe, TravelPriority, CompanionType, CompanionDetail, CurationFocus } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateItinerary = async (
  destination: string,
  vibes: Vibe[],
  birthDate: string,
  companion: { type: CompanionType; detail: CompanionDetail; focus: CurationFocus },
  priority: TravelPriority,
  startDate: string,
  endDate: string
): Promise<Itinerary> => {
  const today = new Date().toISOString().split('T')[0];
  
  const prompt = `당신은 세계 최고의 고정밀 여행 에이전트입니다.
  **중요: 반드시 모든 응답(summary 포함)은 한국어로만 작성하세요.**

  [미션]
  ${destination} 여행을 위한 렌터카식 정밀 시간표를 작성하세요.
  - 시작일: ${startDate}, 종료일: ${endDate}
  - 동행: ${companion.type} (${companion.detail.ages.join(',')}세 포함)
  - 가중치: ${priority}, 감성: ${vibes.join(', ')}

  [데이터 무결성 규칙]
  1. 각 장소의 'startTime', 'endTime'은 HH:mm 형식으로 촘촘하게 배치하세요.
  2. 'lat', 'lng' 좌표는 구글 맵 마커 생성을 위해 실제 위치와 일치해야 합니다.
  3. 'summary'는 해당 날짜의 전체 흐름을 한국어로 3문장 이내 요약하세요.
  4. 'realityCheck'는 googleSearch를 통해 실제 해당 날씨와 운영 여부를 확인한 결과여야 합니다.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "당신은 한국어만 사용하는 고정밀 여행 스케줄러입니다.",
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 4000,
      thinkingConfig: { thinkingBudget: 1500 },
    },
  });

  return JSON.parse(response.text || "{}") as Itinerary;
};
