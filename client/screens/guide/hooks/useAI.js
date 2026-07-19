// ⚠️ 수정금지(승인필요): AI 통합 훅 — Gemma 4 온디바이스 ↔ 서버 API 자동 전환
// Gemma 4 (디폴트) → 실패 시 → 기존 서버 API 폴백 (Replit 경유, 키 노출 없음)
// 사용자 언어(store.language) → 해당 페르소나 자동 적용 → 음성도 해당 언어
import { useCallback, useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import { useStore } from '../state/store';
import { CONFIG } from '../config/constants';
import { isEngineReady, sendMessage as gemmaSend } from '../services/GemmaEngine';
import { analyzeImageViaServer } from '../api/backendApi';
import { fetchPrompt, preloadPrompts, getTTSLanguage } from '../services/PromptService';

export function useAI() {
  const {
    addMessage,
    useOnlineFallback, setOnlineFallback,
  } = useStore();

  // ⚠️ 수정금지(승인필요): store.language 구독 — 언어 변경 시 자동 반영
  const language = useStore((s) => s.language) || 'ko';
  const promptsRef = useRef({ image: '', text: '' });

  // ⚠️ 수정금지(승인필요): 앱 시작 시 프롬프트 프리로드 (서버에서 페르소나 가져오기)
  useEffect(() => {
    loadPrompts(language);
  }, [language]);

  // ⚠️ 수정금지(승인필요): 언어별 프롬프트 로딩
  async function loadPrompts(lang) {
    try {
      await preloadPrompts(lang);
      promptsRef.current.image = await fetchPrompt(lang, 'image');
      promptsRef.current.text = await fetchPrompt(lang, 'text');
      console.log(`[useAI] ${lang} 페르소나 로딩 완료`);
    } catch (e) {
      console.warn('[useAI] 프롬프트 로딩 실패:', e.message);
    }
  }

  // ⚠️ 수정금지(승인필요): TTS — 사용자 언어로 음성 출력
  const speak = useCallback((text) => {
    if (!text) return;
    Speech.speak(text, {
      language: getTTSLanguage(language),
      rate: CONFIG.VOICE.TTS_RATE,
      pitch: CONFIG.VOICE.TTS_PITCH,
    });
  }, [language]);

  // ⚠️ 수정금지(승인필요): AI에 텍스트 전송 + 응답 + TTS
  // Gemma 4 → 실패 시 서버 API 폴백 (키는 Replit에만)
  const sendText = useCallback(async (text, { speakResult = true, type = 'text' } = {}) => {
    addMessage({ role: 'user', text });
    let fullResponse = '';
    const systemPrompt = type === 'image' ? promptsRef.current.image : promptsRef.current.text;

    try {
      if (isEngineReady()) {
        for await (const token of gemmaSend({ text, systemPrompt })) {
          fullResponse += token;
        }
      } else {
        throw new Error('FALLBACK_TO_SERVER');
      }
    } catch {
      // 서버 API 폴백 (기존 앱과 동일 — Replit 서버 경유)
      try {
        setOnlineFallback(true);
        const result = await analyzeImageViaServer(null, text, language);
        fullResponse = result.description || result.text || '';
      } catch (serverErr) {
        console.error('[useAI] 서버 API 실패:', serverErr.message);
        fullResponse = getLocalizedMessage('ai_error', language);
      }
    }

    addMessage({ role: 'ai', text: fullResponse });
    if (speakResult) speak(fullResponse);
    return fullResponse;
  }, [addMessage, setOnlineFallback, speak, language]);

  // ⚠️ 수정금지(승인필요): 이미지 분석 + 음성 응답
  // Gemma 4 → 실패 시 서버 API (/api/analyze) 폴백
  const analyzeImage = useCallback(async (imageBase64, { speakResult = true, prompt } = {}) => {
    addMessage({ role: 'user', text: '[이미지 분석 중...]' });
    let fullResponse = '';
    const systemPrompt = promptsRef.current.image || prompt;

    try {
      if (isEngineReady()) {
        for await (const token of gemmaSend({ imageBase64, text: prompt, systemPrompt })) {
          fullResponse += token;
        }
      } else {
        throw new Error('FALLBACK_TO_SERVER');
      }
    } catch {
      // 서버 API 폴백 — 기존 앱 processImage 동일 경로
      try {
        setOnlineFallback(true);
        const result = await analyzeImageViaServer(imageBase64, systemPrompt, language);
        fullResponse = result.description || result.text || '';
      } catch (serverErr) {
        console.error('[useAI] 서버 API 실패:', serverErr.message);
        fullResponse = getLocalizedMessage('ai_error', language);
      }
    }

    addMessage({ role: 'ai', text: fullResponse });
    if (speakResult) speak(fullResponse);
    return fullResponse;
  }, [addMessage, setOnlineFallback, speak, language]);

  // ⚠️ 수정금지(승인필요): TTS 중지
  const stopSpeaking = useCallback(() => Speech.stop(), []);

  return {
    sendText,
    analyzeImage,
    speak,
    stopSpeaking,
    language,
  };
}

// ⚠️ 수정금지(승인필요): 언어별 시스템 메시지 (음성 안내용)
function getLocalizedMessage(key, lang) {
  const messages = {
    ai_initializing: {
      ko: 'AI 엔진을 초기화하고 있습니다. 잠시 후 다시 시도해주세요.',
      en: 'Initializing AI engine. Please try again shortly.',
      ja: 'AIエンジンを初期化中です。しばらくしてからもう一度お試しください。',
      'zh-CN': 'AI引擎初始化中，请稍后再试。',
      fr: 'Initialisation du moteur IA. Veuillez réessayer dans un instant.',
      de: 'KI-Engine wird initialisiert. Bitte versuchen Sie es gleich erneut.',
      es: 'Inicializando motor IA. Por favor, inténtelo de nuevo en un momento.',
    },
    ai_error: {
      ko: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      en: 'An error occurred during AI analysis. Please try again.',
      ja: 'AI分析中にエラーが発生しました。しばらくしてからもう一度お試しください。',
      'zh-CN': 'AI分析过程中出现错误，请稍后再试。',
      fr: 'Une erreur est survenue. Veuillez réessayer.',
      de: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
      es: 'Se produjo un error. Por favor, inténtelo de nuevo.',
    },
  };
  return messages[key]?.[lang] || messages[key]?.['en'] || key;
}
