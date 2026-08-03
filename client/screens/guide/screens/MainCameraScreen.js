// ⚠️ 수정금지(승인필요): RN 메인 입력 페이지 — WebView 메인 완전 대체
// 카메라 라이브뷰(후방 고정) + 5개 버튼
// 촬영/업로드/음성 → 크레딧 체크 + 캡처 + GPS + WebView 전달
// 보관함 → WebView showArchivePage 전달
// 라이브/여행비서 → 준비 중 음성 안내
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
// expo-speech-recognition = 네이티브 전용 (Expo Go 미지원) → 안전 로드
let ExpoSpeechRecognitionModule = {
  stop: () => {},
  start: () => {},
  requestPermissionsAsync: async () => ({ granted: false }),
};
let useSpeechRecognitionEvent = (_event, _cb) => {};
try {
  const sr = require('expo-speech-recognition');
  if (sr?.ExpoSpeechRecognitionModule) ExpoSpeechRecognitionModule = sr.ExpoSpeechRecognitionModule;
  if (sr?.useSpeechRecognitionEvent) useSpeechRecognitionEvent = sr.useSpeechRecognitionEvent;
} catch (_) {
  // Expo Go: 네이티브 모듈 없음 — 스텁으로 동작
}

import CameraView from '../components/CameraView';
import FooterButtons from '../components/FooterButtons';
import LiveChat from '../components/LiveChat';
import { useCamera } from '../hooks/useCamera';
import { useStore } from '../state/store';
import { theme } from '../styles/theme';
import { CONFIG } from '../config/constants';
import { getTTSLanguage } from '../services/PromptService';
// 관리자 판정 = 저장된 계정 1벌. 도시 카드 [해설 만들기](CityCardScreen.tsx) 와 완전히 같은 방식(§16 재발명 금지).
import { getUserData } from '@/lib/auth';
import { Icon } from '@/components/Icon';
import {
  Brand,
  Colors,
  Fonts,
  BorderRadius,
  Spacing,
  Shadows,
} from '@/constants/theme';

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

  // ⚠️ 2026-08-02 사장님 지시 = [업로드] 는 **관리자에게만** 갈림길을 띄운다.
  //   일반 사용자는 종전 그대로 곧장 갤러리가 열린다 = 이 화면의 다른 동작은 하나도 바뀌지 않는다.
  const [isAdmin, setIsAdmin] = useState(false);
  // 창 단계 = null(안 뜸) | 'pick'(무엇으로) | 'number'(장소번호 입력).
  //   창은 **하나**만 쓴다 = iOS 는 창을 겹쳐 띄우면 뒤 창이 안 뜬다(§8·§11 공식 동작).
  const [sourceStep, setSourceStep] = useState(null);
  const [placeIdText, setPlaceIdText] = useState('');

  // 관리자 여부 = 저장된 계정의 role 1벌. 아이디 문자열·is_admin 으로 판단하지 않는다(§9 표7).
  React.useEffect(() => {
    let alive = true;
    getUserData()
      .then((u) => {
        if (alive) setIsAdmin(u?.role === 'admin');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      // #15-1 다이얼 = CONFIG.IMAGE 1벌(2026-08-01 사장님 선택 800px/0.7).
      //   옛날엔 리사이즈 없이 갤러리 원본을 통째로 저장 = 장당 수백 KB 들어가던 근본 원인.
      const optimized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: CONFIG.IMAGE.MAX_PX } }],
        { compress: CONFIG.IMAGE.QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!optimized.base64) return;

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
        onNavigateToWebView('detail', { imageBase64: optimized.base64 });
      }
    } catch (e) {
      console.error('[업로드 오류]', e.message);
      speak('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
      setActiveFeature(null);
    }
  }, [isProcessing, checkUsageLimit, sendGPSToWebView, onNavigateToWebView, speak, setActiveFeature]);

  // ═══════════════════════════════════════════════
  // 장소번호로 만들기 — 관리자 전용 (2026-08-02 사장님 지시)
  // 우리 DB 장소번호(place_seed_raw.id)만 넘긴다 = 그 뒤 흐름(창고 조회 → 없으면 생성 → 자동 저장)은
  // 해설 화면의 완성된 1벌이 그대로 한다(§16). 사진·GPS·랜드마크는 이 경로에 아예 없다.
  // 크레딧은 이 화면에서 재지 않는다 = 차감은 서버 chargeFeature 1벌(§9). 화면이 또 재면 두 벌이 된다.
  // ═══════════════════════════════════════════════
  const placeIdValue = /^[0-9]+$/.test(placeIdText) ? Number(placeIdText) : 0;

  const handlePlaceIdConfirm = useCallback(() => {
    if (placeIdValue <= 0) return;
    setSourceStep(null);
    setPlaceIdText('');
    if (onNavigateToWebView) {
      onNavigateToWebView('detail', { placeId: placeIdValue });
    }
  }, [placeIdValue, onNavigateToWebView]);

  // [업로드] 입구 = 관리자면 갈림길, 아니면 종전 handleUpload 를 **그대로** 부른다(코드 이동 없음 = 회귀 0).
  const handleUploadPress = useCallback(() => {
    if (isProcessing) return;
    if (isAdmin) {
      setPlaceIdText('');
      setSourceStep('pick');
      return;
    }
    handleUpload();
  }, [isProcessing, isAdmin, handleUpload]);

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
        handleUploadPress();
        break;
      case 'assistant':
        handleAssistant();
        break;
      case 'archive':
        debounceClick('archive', () => handleArchive(), 300);
        break;
    }
  }, [handleLive, handleCapture, handleUploadPress, handleAssistant, handleArchive]);

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

      {/* ⚠️ 2026-08-02 사장님 지시 = 관리자 전용 갈림길. [업로드] 를 누른 관리자에게만 뜬다.
          일반 사용자는 sourceStep 이 영영 null = 이 창이 존재하지 않는 것과 같다. */}
      <Modal
        visible={sourceStep !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSourceStep(null)}
      >
        <View style={pickerStyles.backdrop}>
          {/* 바깥을 누르면 닫힘 = 카드 뒤에 깔린 판. 카드 위 터치는 카드가 먹는다. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSourceStep(null)}
            accessibilityLabel="닫기"
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={pickerStyles.cardWrap}
          >
            <View style={pickerStyles.card}>
              {sourceStep === 'pick' ? (
                <>
                  <Text style={pickerStyles.title}>무엇으로 만들까요</Text>
                  <View style={pickerStyles.row}>
                    <Pressable
                      style={[pickerStyles.btn, pickerStyles.btnPrimary]}
                      onPress={() => {
                        setSourceStep(null);
                        handleUpload();
                      }}
                    >
                      <Icon name="camera" size={18} color="#FFFFFF" />
                      <Text style={[pickerStyles.btnText, pickerStyles.btnTextPrimary]}>
                        내 기기
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[pickerStyles.btn, pickerStyles.btnGhost]}
                      onPress={() => setSourceStep('number')}
                    >
                      <Icon name="tag" size={18} color={Colors.light.text} />
                      <Text style={pickerStyles.btnText}>장소번호</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={pickerStyles.title}>장소번호</Text>
                  <TextInput
                    style={pickerStyles.input}
                    value={placeIdText}
                    onChangeText={(v) => setPlaceIdText(v.replace(/[^0-9]/g, '').slice(0, 8))}
                    keyboardType="number-pad"
                    placeholder="0000"
                    placeholderTextColor={Colors.light.textTertiary}
                    autoFocus
                    maxLength={8}
                    onSubmitEditing={handlePlaceIdConfirm}
                  />
                  <View style={pickerStyles.row}>
                    <Pressable
                      style={[pickerStyles.btn, pickerStyles.btnGhost]}
                      onPress={() => setSourceStep(null)}
                    >
                      <Icon name="x" size={18} color={Colors.light.text} />
                      <Text style={pickerStyles.btnText}>닫기</Text>
                    </Pressable>
                    {/* 빈 값·0·숫자 아님 = 만들기 꺼짐 (placeIdValue 0) */}
                    <Pressable
                      style={[
                        pickerStyles.btn,
                        placeIdValue > 0 ? pickerStyles.btnPrimary : pickerStyles.btnDisabled,
                      ]}
                      onPress={handlePlaceIdConfirm}
                      disabled={placeIdValue <= 0}
                    >
                      <Icon name="check" size={18} color="#FFFFFF" />
                      <Text style={[pickerStyles.btnText, pickerStyles.btnTextPrimary]}>
                        만들기
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ⚠️ 2026-08-02 = 관리자 전용 갈림길 창 스타일. 앱 톤(글라스 미니멀리즘 = 둥근 모서리 + 낮은 대비 그림자) 그대로.
//   색·둥글기·간격 = 전부 @/constants/theme 토큰 = 새 색을 만들지 않는다(사장님 톤앤매너 유지).
//   카메라(어두움) 위에 뜨므로 배경은 반투명 어둡게 + 카드만 밝게 = 미니앱 다른 창과 충돌 없음.
const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 340,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    ...Shadows.elevated,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.light.backgroundDefault,
    paddingHorizontal: Spacing.lg,
    fontFamily: Fonts.medium,
    fontSize: 18,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  btn: {
    flex: 1,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnPrimary: { backgroundColor: Brand.primary },
  btnGhost: { backgroundColor: Colors.light.backgroundSecondary },
  btnDisabled: { backgroundColor: Colors.light.textTertiary },
  btnText: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.light.text },
  btnTextPrimary: { color: '#FFFFFF' },
});
