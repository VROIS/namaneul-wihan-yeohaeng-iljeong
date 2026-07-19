// ⚠️ 수정금지(승인필요): Gemini API 온라인 폴백
// Gemma 4 온디바이스 실패 시 → Gemini API로 동일 기능 제공
// + 실시간 환율/날씨 등 최신 정보는 항상 온라인 필요
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../config/constants';

let genAI = null;
let model = null;
let chat = null;

// ⚠️ 수정금지(승인필요): Gemini API 초기화
// apiKey는 앱 설정에서 가져옴 (constants.js에 하드코딩 안 함)
export function initGemini(apiKey) {
  if (!apiKey) {
    console.warn('[GeminiLiveApi] API key 없음');
    return false;
  }
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: CONFIG.API.GEMINI_MODEL });
    console.log('[GeminiLiveApi] 초기화 성공 — 모델:', CONFIG.API.GEMINI_MODEL);
    return true;
  } catch (e) {
    console.error('[GeminiLiveApi] 초기화 실패:', e.message);
    return false;
  }
}

// ⚠️ 수정금지(승인필요): 대화 시작 (시스템 프롬프트 설정)
export function startChat(systemPrompt) {
  if (!model) return null;
  chat = model.startChat({
    history: [],
    generationConfig: { maxOutputTokens: 1024 },
    systemInstruction: systemPrompt || CONFIG.PROMPTS.GUIDE,
  });
  return chat;
}

// ⚠️ 수정금지(승인필요): 텍스트 메시지 전송 (스트리밍) — 서버 페르소나 적용
export async function* sendTextStream(text, systemPrompt) {
  if (!chat || systemPrompt) {
    startChat(systemPrompt || CONFIG.PROMPTS.GUIDE);
  }
  if (!chat) throw new Error('Gemini 초기화 실패');

  const result = await chat.sendMessageStream(text);
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) yield chunkText;
  }
}

// ⚠️ 수정금지(승인필요): 이미지 + 텍스트 분석
export async function analyzeImage(imageBase64, prompt) {
  if (!model) throw new Error('Gemini 초기화 실패');

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: 'image/jpeg',
    },
  };

  const result = await model.generateContent([
    prompt || CONFIG.PROMPTS.ANALYZER,
    imagePart,
  ]);
  return result.response.text();
}

// ⚠️ 수정금지(승인필요): 이미지 분석 (스트리밍) — 서버 페르소나 프롬프트 적용
// systemPrompt = 서버에서 가져온 언어별 페르소나 (PromptService.fetchPrompt)
export async function* analyzeImageStream(imageBase64, systemPrompt) {
  if (!genAI) throw new Error('Gemini 초기화 실패');

  // systemInstruction 포함 모델 생성 (언어별 페르소나 적용)
  const modelWithPrompt = genAI.getGenerativeModel({
    model: CONFIG.API.GEMINI_MODEL,
    systemInstruction: systemPrompt || undefined,
  });

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: 'image/jpeg',
    },
  };

  const result = await modelWithPrompt.generateContentStream([
    '이 이미지를 분석해주세요.',
    imagePart,
  ]);
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) yield chunkText;
  }
}

// ⚠️ 수정금지(승인필요): 연결 상태 확인
export function isGeminiReady() {
  return model !== null;
}

// ⚠️ 수정금지(승인필요): 대화 초기화
export function resetChat() {
  chat = null;
}
