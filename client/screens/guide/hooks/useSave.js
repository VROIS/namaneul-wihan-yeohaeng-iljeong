// ⚠️ 수정금지(승인필요): 순간 기억 — 기존 앱 촬영+저장 패턴 RN 포팅
// 기존 앱: capturePhoto → processImage → handleSaveClick
// RN 버전: takePicture/ViewShot → store에서 추출 → ArchiveService
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
  // 1. 이미지 캡처 (카메라 프레임 or 화면 스크린샷)
  // 2. 대화에서 AI 응답 추출
  // 3. GPS 위치
  // 4. ArchiveService로 로컬+서버 저장
  const captureAndSave = useCallback(async ({ userId } = {}) => {
    try {
      // 1. 이미지 캡처
      let imageBase64 = null;

      if (photoUri) {
        // 이미 촬영된 사진이 있으면 그것 사용
        // (기존 앱: currentContent.imageDataUrl)
        imageBase64 = photoUri; // 이미 base64일 수 있음
      } else if (cameraRef.current) {
        // 카메라에서 즉시 캡처 (기존 앱: canvas.toDataURL)
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: true,
        });
        imageBase64 = photo?.base64 || null;
      }

      // ViewShot 대체: 라이브 모드 중이면 화면 전체 캡처 (대화 포함)
      if (!imageBase64 && viewRef.current) {
        const uri = await captureRef(viewRef.current, {
          format: 'jpg',
          quality: 0.8,
          result: 'base64',
        });
        imageBase64 = uri;
      }

      // 2. 대화에서 최근 AI 응답 추출 (기존 앱: currentContent.description)
      const recentAI = messages
        .filter(m => m.role === 'ai')
        .slice(-3) // 최근 3개
        .map(m => m.text)
        .join('\n');

      const recentUser = messages
        .filter(m => m.role === 'user')
        .slice(-1)[0]?.text || '';

      // 3. GPS 위치 (기존 앱: window.currentGPS)
      const location = await getCurrentLocation();
      const address = await getAddress();

      // 4. 저장 (기존 앱: POST /api/guides/batch + IndexedDB)
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

      // 5. 음성 확인 (자비스: "저장했어요!")
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
