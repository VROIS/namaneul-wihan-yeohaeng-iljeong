// ⚠️ 수정금지(승인필요): 순간 기억 — 기존 앱 촬영+저장 패턴 RN 포팅
import { useRef, useCallback } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as Speech from 'expo-speech';
import { useStore } from '../state/store';
import { useCamera } from './useCamera';
import { useLocation } from './useLocation';
import { saveToArchive } from '../services/ArchiveService';
import { CONFIG } from '../config/constants';

export function useSave() {
  const viewRef = useRef(null); // 화면 전체 캡처용 ref

  const { cameraRef } = useCamera();
  const { getCurrentLocation, getAddress } = useLocation();
  const { messages, photoUri, liveMode } = useStore();

  // ⚠️ 수정금지(승인필요): 저장 실행 — 기존 앱 handleSaveClick 동일 흐름
  const captureAndSave = useCallback(async ({ userId } = {}) => {
    try {
      let imageBase64 = null;

      if (photoUri) {
        imageBase64 = photoUri; // 이미 base64일 수 있음
      } else if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: true,
        });
        imageBase64 = photo?.base64 || null;
      }

      if (!imageBase64 && viewRef.current) {
        const uri = await captureRef(viewRef.current, {
          format: 'jpg',
          quality: 0.8,
          result: 'base64',
        });
        imageBase64 = uri;
      }

      const recentAI = messages
        .filter(m => m.role === 'ai')
        .slice(-3) // 최근 3개
        .map(m => m.text)
        .join('\n');

      const recentUser = messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.text || '';

      const location = await getCurrentLocation();
      const address = await getAddress();

      const item = await saveToArchive({
        title: recentUser || '여행 기록',
        description: recentAI,
        imageBase64,
        aiGeneratedContent: recentAI,
        latitude: location?.latitude,
        longitude: location?.longitude,
        locationName: address,
        voiceQuery: recentUser,
        voiceLang: CONFIG.VOICE.LANGUAGE,
        userId,
        language: 'ko',
      });

      Speech.speak('저장했어요!', {
        language: CONFIG.VOICE.LANGUAGE,
        rate: CONFIG.VOICE.TTS_RATE,
      });

      return { success: true, item };
    } catch (e) {
      console.error('[useSave] 저장 실패:', e.message);
      Speech.speak('저장에 실패했어요.', { language: CONFIG.VOICE.LANGUAGE });
      return { success: false, error: e.message };
    }
  }, [cameraRef, messages, photoUri, getCurrentLocation, getAddress]);

  return {
    viewRef,        // 화면 전체 캡처용 — 최상위 View에 ref 연결
    captureAndSave,
  };
}
