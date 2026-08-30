// ⚠️ 수정금지(승인필요): 번역/통역 서비스
import { isEngineReady, sendMessage } from './GemmaEngine';
import { sendTextStream, isGeminiReady } from './GeminiLiveApi';

// ⚠️ 수정금지(승인필요): 텍스트 번역
export async function translateText(text, sourceLang, targetLang) {
  const prompt = `Translate the following from ${sourceLang} to ${targetLang}. Only output the translation, nothing else:\n${text}`;

  if (isEngineReady()) {
    try {
      let result = '';
      for await (const token of sendMessage({ text: prompt })) {
        result += token;
      }
      return result.trim();
    } catch {
    }
  }

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
export async function* translateStream(text, sourceLang, targetLang) {
  const prompt = `Translate from ${sourceLang} to ${targetLang}. Only output the translation:\n${text}`;

  if (isEngineReady()) {
    try {
      for await (const token of sendMessage({ text: prompt })) {
        yield token;
      }
      return;
    } catch {
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

  if (isEngineReady()) {
    try {
      let result = '';
      for await (const token of sendMessage({ text: prompt, imageBase64 })) {
        result += token;
      }
      return result;
    } catch {
    }
  }

  const { analyzeImage } = require('./GeminiLiveApi');
  return await analyzeImage(imageBase64, prompt);
}
