// ⚠️ 수정금지(승인필요): 번역/통역 서비스
// 우선순위: Gemma 4 온디바이스 (140개국어 오프라인) → Gemini API 폴백
import { isEngineReady, sendMessage } from './GemmaEngine';
import { sendTextStream, isGeminiReady } from './GeminiLiveApi';

// ⚠️ 수정금지(승인필요): 텍스트 번역
// sourceLang: 'ko', targetLang: 'en', text: '안녕하세요'
export async function translateText(text, sourceLang, targetLang) {
  const prompt = `Translate the following from ${sourceLang} to ${targetLang}. Only output the translation, nothing else:\n${text}`;

  // 1순위: Gemma 4 온디바이스 (오프라인 가능)
  if (isEngineReady()) {
    try {
      let result = '';
      for await (const token of sendMessage({ text: prompt })) {
        result += token;
      }
      return result.trim();
    } catch {
      // 폴백
    }
  }

  // 2순위: Gemini API (온라인)
  if (isGeminiReady()) {
    let result = '';
    for await (const token of sendTextStream(prompt)) {
      result += token;
    }
    return result.trim();
  }

  throw new Error('번역 엔진 없음 (오프라인 + API 미연결)');
}

// ⚠️ 수정금지(승인필요): 실시간 통역 (스트리밍)
// 음성 입력 → 번역 → TTS 출력용
export async function* translateStream(text, sourceLang, targetLang) {
  const prompt = `Translate from ${sourceLang} to ${targetLang}. Only output the translation:\n${text}`;

  if (isEngineReady()) {
    try {
      for await (const token of sendMessage({ text: prompt })) {
        yield token;
      }
      return;
    } catch {
      // 폴백
    }
  }

  if (isGeminiReady()) {
    for await (const token of sendTextStream(prompt)) {
      yield token;
    }
    return;
  }

  throw new Error('번역 엔진 없음');
}

// ⚠️ 수정금지(승인필요): 메뉴판 번역 (이미지 → 번역 + 알레르기 경고)
export async function translateMenu(imageBase64, targetLang = 'ko') {
  const prompt = `이 메뉴판/간판을 ${targetLang}로 번역해주세요. 알레르기 유발 성분이 있으면 ⚠️로 경고해주세요.`;

  // Gemma 4 멀티모달 또는 Gemini API
  if (isEngineReady()) {
    try {
      let result = '';
      for await (const token of sendMessage({ text: prompt, imageBase64 })) {
        result += token;
      }
      return result;
    } catch {
      // 폴백
    }
  }

  // Gemini API 이미지 분석은 GeminiLiveApi.analyzeImage에서 처리
  const { analyzeImage } = require('./GeminiLiveApi');
  return await analyzeImage(imageBase64, prompt);
}
