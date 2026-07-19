// ⚠️ 수정금지(승인필요): RN 메인 입력 페이지 — WebView 메인 완전 대체
// 카메라 라이브뷰(후방 고정) + 5개 버튼
// 촬영/업로드/음성 → 크레딧 체크 + 캡처 + GPS + WebView 전달
// 보관함 → WebView showArchivePage 전달
// 라이브/여행비서 → 준비 중 음성 안내
import React, { useState, useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

import CameraView from '../components/CameraView';
import FooterButtons from '../components/FooterButtons';
import LiveChat from '../components/LiveChat';
import { useCamera } from '../hooks/useCamera';
import { useStore } from '../state/store';
import { theme } from '../styles/theme';
import { CONFIG } from '../config/constants';
import { getTTSLanguage } from '../services/PromptService';

// ⚠️ 수정금지(승인필요): debounce — 기존 index.js:537-550 debounceClick 클론
const debounceMap = new Map();
function debounceClick(key, callback, delay = 300) {
  const now = Date.now();
  if (now - (debounceMap.get(key) || 0) < delay) return;
  debounceMap.set(key, now);
  callback();
}

export default function MainCameraScreen({ onNavigateToWebView, onInjectJS, lang }) {
  const { cameraRef, takePicture } = useCamera();
  const {
    setActiveFeature,
    setLanguage,
  } = useStore();

  const language = useStore((s) => s.language) || 'ko';

  // ⚠️ 수정금지(승인필요): App.js에서 전달받은 언어를 store에 동기화
  React.useEffect(() => {
    if (lang) setLanguage(lang);
  }, [lang]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // ⚠️ 수정금지(승인필요): 오디오 정리 헬퍼 — TTS/STT/상태 일괄 중지
  const stopAllAudio = useCallback(() => {
    Speech.stop();
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    }
    setActiveFeature(null);
  }, [isListening, setActiveFeature]);

  // ⚠️ 수정금지(승인필요): 음성 안내 — 사용자 언어로 TTS (Voice-First UX)
  const speak = useCallback((text) => {
    if (!text) return;
    Speech.speak(text, {
      language: getTTSLanguage(language),
      rate: CONFIG.VOICE.TTS_RATE,
      pitch: CONFIG.VOICE.TTS_PITCH,
    });
  }, [language]);

  // ⚠️ 수정금지(승인필요): 크레딧 체크 — 프로모션 기간 return true (CLAUDE.md 제9조)
  // 프로모션 종료 후: backendApi.checkCredits(userId) 전환
  const checkUsageLimit = useCallback(async () => {
    return true;
  }, []);

  // ⚠️ 수정금지(승인필요): GPS → WebView window.currentGPS 전달
  const sendGPSToWebView = useCallback(() => {
    if (onInjectJS) {
      // 백그라운드 — 기다리지 않음 (기존 requestBrowserLocation과 동일)
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          onInjectJS(`
            window.currentGPS = {
              latitude: ${loc.coords.latitude},
              longitude: ${loc.coords.longitude},
              locationName: null
            };
            true;
          `);
        } catch (e) {
          console.warn('[GPS] 위치 요청 실패:', e.message);
        }
      })();
    }
  }, [onInjectJS]);

  // ═══════════════════════════════════════════════
  // 촬영 버튼 (#1~4)
  // 기존: capturePhoto → checkUsageLimit → canvas.drawImage → requestBrowserLocation → processImage
  // ═══════════════════════════════════════════════
  const handleCapture = useCallback(async () => {
    if (isProcessing) return;

    // #1 크레딧 체크
    const canProceed = await checkUsageLimit();
    if (!canProceed) {
      speak('크레딧이 부족합니다.');
      return;
    }

    setIsProcessing(true);
    setActiveFeature('capture');

    try {
      // #2 카메라 프레임 캡처 → base64
      const photo = await takePicture();
      if (!photo?.base64) {
        speak('촬영에 실패했습니다.');
        return;
      }

      // #3 GPS 위치 요청 (백그라운드 — 기다리지 않음)
      sendGPSToWebView();

      // #4 WebView 전환 + processImageFromNative 호출
      if (onNavigateToWebView) {
        onNavigateToWebView('detail', { imageBase64: photo.base64 });
      }
    } catch (e) {
      console.error('[촬영 오류]', e.message);
      speak('촬영 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setActiveFeature(null);
    }
  }, [isProcessing, checkUsageLimit, takePicture, sendGPSToWebView, onNavigateToWebView, speak, setActiveFeature]);

  // ═══════════════════════════════════════════════
  // 업로드 버튼 (#15~18)
  // 기존: uploadInput.click → handleFileSelect → checkUsageLimit → exifr.gps → processImage
  // ═══════════════════════════════════════════════
  const handleUpload = useCallback(async () => {
    if (isProcessing) return;

    try {
      // #15 기기 갤러리 열기
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      // #16 크레딧 체크
      const canProceed = await checkUsageLimit();
      if (!canProceed) {
        speak('크레딧이 부족합니다.');
        return;
      }

      setIsProcessing(true);
      setActiveFeature('upload');

      // #17 GPS — 현재 위치 직접 사용 (RN에서 EXIF 추출 불필요)
      sendGPSToWebView();

      // #18 WebView 전달 → processImageFromNative → 이후 촬영과 동일
      if (onNavigateToWebView) {
        onNavigateToWebView('detail', { imageBase64: result.assets[0].base64 });
      }
    } catch (e) {
      console.error('[업로드 오류]', e.message);
      speak('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setActiveFeature(null);
    }
  }, [isProcessing, checkUsageLimit, sendGPSToWebView, onNavigateToWebView, speak, setActiveFeature]);

  // ⚠️ 수정금지(승인필요): 언마운트 시 마이크 타임아웃 정리 (메모리 누수 방지)
  React.useEffect(() => {
    return () => {
      if (micTimeoutRef.current) clearTimeout(micTimeoutRef.current);
    };
  }, []);

  // ═══════════════════════════════════════════════
  // 음성 버튼 (#19~24) — 라이브 버튼으로 대체 예정, 현재는 기존 음성 로직
  // 기존: synth.cancel → checkUsageLimit → recognition.start → 10초 타임아웃 → processTextQuery
  // ═══════════════════════════════════════════════
  const micTimeoutRef = React.useRef(null);

  // #22~23 STT 결과 수신 + 타임아웃
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript || '';
    if (text) {
      // 타임아웃 해제
      if (micTimeoutRef.current) {
        clearTimeout(micTimeoutRef.current);
        micTimeoutRef.current = null;
      }
      setIsListening(false);
      setActiveFeature(null);

      // #24 WebView 전달 → processTextQuery
      if (onNavigateToWebView) {
        onNavigateToWebView('voice', { text });
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (micTimeoutRef.current) {
      clearTimeout(micTimeoutRef.current);
      micTimeoutRef.current = null;
    }
    setIsListening(false);
    setActiveFeature(null);
    speak('음성 인식 중 오류가 발생했습니다.');
  });

  const handleVoice = useCallback(async () => {
    if (isProcessing || isListening) return;

    // #19 TTS 재생 중이면 즉시 중지
    Speech.stop();

    // #20 크레딧 체크
    const canProceed = await checkUsageLimit();
    if (!canProceed) {
      speak('크레딧이 부족합니다.');
      return;
    }

    // #21 마이크 리스닝 상태 (프론트엔드 — store로 전달)
    setIsListening(true);
    setActiveFeature('live');

    try {
      // #22 네이티브 STT 시작
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        speak('마이크 권한이 필요합니다.');
        setIsListening(false);
        setActiveFeature(null);
        return;
      }

      const ttsLang = getTTSLanguage(language);
      ExpoSpeechRecognitionModule.start({
        lang: ttsLang,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });

      // #23 10초 타임아웃
      micTimeoutRef.current = setTimeout(() => {
        stopAllAudio();
        speak('음성을 듣지 못했어요. 다시 시도해볼까요?');
      }, 10000);

    } catch (e) {
      console.error('[음성 오류]', e.message);
      setIsListening(false);
      setActiveFeature(null);
      speak('음성 인식을 시작할 수 없습니다.');
    }
  }, [isProcessing, isListening, checkUsageLimit, language, speak, setActiveFeature]);

  // ═══════════════════════════════════════════════
  // 보관함 버튼 (#27~31)
  // 기존: pauseCamera → synth.cancel → recognition.stop → toggleSelectionMode → showArchivePage
  // ═══════════════════════════════════════════════
  const handleArchive = useCallback(() => {
    // #27~29 카메라/TTS/마이크 일괄 중지
    stopAllAudio();
    // #30~34 WebView showArchivePage → 내부에서 전부 처리
    if (onNavigateToWebView) {
      onNavigateToWebView('archive');
    }
  }, [stopAllAudio, onNavigateToWebView]);

  // ═══════════════════════════════════════════════
  // 라이브 / 여행비서 — 준비 중 (이후 단계)
  // ═══════════════════════════════════════════════
  const handleLive = useCallback(() => {
    speak('라이브 기능을 준비하고 있습니다.');
  }, [speak]);

  const handleAssistant = useCallback(() => {
    speak('여행비서 기능을 준비하고 있습니다.');
  }, [speak]);

  // ⚠️ 수정금지(승인필요): 5개 버튼 핸들러 분기
  const handleButtonPress = useCallback((buttonId) => {
    switch (buttonId) {
      case 'live':
        handleLive();
        break;
      case 'capture':
        debounceClick('capture', () => handleCapture(), 300);
        break;
      case 'upload':
        handleUpload();
        break;
      case 'assistant':
        handleAssistant();
        break;
      case 'archive':
        debounceClick('archive', () => handleArchive(), 300);
        break;
    }
  }, [handleLive, handleCapture, handleUpload, handleAssistant, handleArchive]);

  return (
    <View style={theme.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* 카메라 전체 화면 배경 (후방 고정) */}
      <CameraView ref={cameraRef} />

      {/* 라이브 대화 오버레이 */}
      <LiveChat />

      {/* 처리 중 스피너 */}
      {isProcessing && (
        <View style={theme.spinnerOverlay}>
          <ActivityIndicator size="large" color={CONFIG.GEMINI_BLUE} />
        </View>
      )}

      {/* 5개 버튼 Footer */}
      <FooterButtons onPress={handleButtonPress} isProcessing={isProcessing} />
    </View>
  );
}
