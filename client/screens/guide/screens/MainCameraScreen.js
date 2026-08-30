// ⚠️ 수정금지(승인필요): RN 메인 입력 페이지 — WebView 메인 완전 대체
import React, { useState, useCallback } from "react";
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
} from "react-native";
import { StatusBar } from "expo-status-bar";
// ⚠️ 수정금지(승인필요) 2026-08-08 = 이 화면이 **지금 보이는 화면인지** 판단용.
import { useIsFocused } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Speech from "expo-speech";
import * as Location from "expo-location";
let ExpoSpeechRecognitionModule = {
  stop: () => {},
  start: () => {},
  requestPermissionsAsync: async () => ({ granted: false }),
};
let useSpeechRecognitionEvent = (_event, _cb) => {};
try {
  const sr = require("expo-speech-recognition");
  if (sr?.ExpoSpeechRecognitionModule)
    ExpoSpeechRecognitionModule = sr.ExpoSpeechRecognitionModule;
  if (sr?.useSpeechRecognitionEvent)
    useSpeechRecognitionEvent = sr.useSpeechRecognitionEvent;
} catch (_) {
}

import CameraView from "../components/CameraView";
import FooterButtons from "../components/FooterButtons";
import LiveChat from "../components/LiveChat";
import { useCamera } from "../hooks/useCamera";
import { useStore } from "../state/store";
import { theme } from "../styles/theme";
import { t } from "../i18n/translations";
import { CONFIG } from "../config/constants";
import { getTTSLanguage } from "../services/PromptService";
import { getUserData } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import {
  Brand,
  Colors,
  Fonts,
  BorderRadius,
  Spacing,
  Shadows,
} from "@/constants/theme";

// ⚠️ 수정금지(승인필요): debounce — 기존 index.js:537-550 debounceClick 클론
const debounceMap = new Map();
function debounceClick(key, callback, delay = 300) {
  const now = Date.now();
  if (now - (debounceMap.get(key) || 0) < delay) return;
  debounceMap.set(key, now);
  callback();
}

export default function MainCameraScreen({
  onNavigateToWebView,
  onInjectJS,
  lang,
}) {
  const { cameraRef, takePicture } = useCamera();
  const { setActiveFeature, setLanguage } = useStore();

  const language = useStore((s) => s.language) || "ko";

  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = 힌트 물결은 **이 화면이 보일 때만** 산다.
  const isFocused = useIsFocused();

  // ⚠️ 수정금지(승인필요): App.js에서 전달받은 언어를 store에 동기화
  React.useEffect(() => {
    if (lang) setLanguage(lang);
  }, [lang]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // ⚠️ 2026-08-02 사장님 지시 = [업로드] 는 **관리자에게만** 갈림길을 띄운다.
  const [isAdmin, setIsAdmin] = useState(false);
  const [sourceStep, setSourceStep] = useState(null);
  const [placeIdText, setPlaceIdText] = useState("");

  React.useEffect(() => {
    let alive = true;
    getUserData()
      .then((u) => {
        if (alive) setIsAdmin(u?.role === "admin");
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
  const speak = useCallback(
    (text) => {
      if (!text) return;
      Speech.speak(text, {
        language: getTTSLanguage(language),
        rate: CONFIG.VOICE.TTS_RATE,
        pitch: CONFIG.VOICE.TTS_PITCH,
      });
    },
    [language],
  );

  // ⚠️ 수정금지(승인필요): 크레딧 체크 — 프로모션 기간 return true (CLAUDE.md 제9조)
  const checkUsageLimit = useCallback(async () => {
    return true;
  }, []);

  // ⚠️ 수정금지(승인필요): GPS → WebView window.currentGPS 전달
  const sendGPSToWebView = useCallback(() => {
    if (onInjectJS) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") return;
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          onInjectJS(`
            window.currentGPS = {
              latitude: ${loc.coords.latitude},
              longitude: ${loc.coords.longitude},
              locationName: null
            };
            true;
          `);
        } catch (e) {
          console.warn("[GPS] 위치 요청 실패:", e.message);
        }
      })();
    }
  }, [onInjectJS]);

  const handleCapture = useCallback(async () => {
    if (isProcessing) return;

    const canProceed = await checkUsageLimit();
    if (!canProceed) {
      speak(t("creditShort", language));
      return;
    }

    setIsProcessing(true);
    setActiveFeature("capture");

    try {
      const photo = await takePicture();
      if (!photo?.base64) {
        speak(t("captureFailed", language));
        return;
      }

      sendGPSToWebView();

      if (onNavigateToWebView) {
        onNavigateToWebView("detail", { imageBase64: photo.base64 });
      }
    } catch (e) {
      console.error("[촬영 오류]", e.message);
      speak(t("captureError", language));
    } finally {
      setIsProcessing(false);
      setActiveFeature(null);
    }
  }, [
    isProcessing,
    checkUsageLimit,
    takePicture,
    sendGPSToWebView,
    onNavigateToWebView,
    speak,
    setActiveFeature,
  ]);

  const handleUpload = useCallback(async () => {
    if (isProcessing) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      // #15-1 다이얼 = CONFIG.IMAGE 1벌(2026-08-01 사장님 선택 800px/0.7).
      const optimized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: CONFIG.IMAGE.MAX_PX } }],
        {
          compress: CONFIG.IMAGE.QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!optimized.base64) return;

      const canProceed = await checkUsageLimit();
      if (!canProceed) {
        speak(t("creditShort", language));
        return;
      }

      setIsProcessing(true);
      setActiveFeature("upload");

      sendGPSToWebView();

      if (onNavigateToWebView) {
        onNavigateToWebView("detail", { imageBase64: optimized.base64 });
      }
    } catch (e) {
      console.error("[업로드 오류]", e.message);
      speak(t("uploadError", language));
    } finally {
      setIsProcessing(false);
      setActiveFeature(null);
    }
  }, [
    isProcessing,
    checkUsageLimit,
    sendGPSToWebView,
    onNavigateToWebView,
    speak,
    setActiveFeature,
  ]);

  // 장소번호로 만들기 — 관리자 전용 (2026-08-02 사장님 지시)
  const placeIdValue = /^[0-9]+$/.test(placeIdText) ? Number(placeIdText) : 0;

  const handlePlaceIdConfirm = useCallback(() => {
    if (placeIdValue <= 0) return;
    setSourceStep(null);
    setPlaceIdText("");
    if (onNavigateToWebView) {
      onNavigateToWebView("detail", { placeId: placeIdValue });
    }
  }, [placeIdValue, onNavigateToWebView]);

  const handleUploadPress = useCallback(() => {
    if (isProcessing) return;
    if (isAdmin) {
      setPlaceIdText("");
      setSourceStep("pick");
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

  const micTimeoutRef = React.useRef(null);

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript || "";
    if (text) {
      if (micTimeoutRef.current) {
        clearTimeout(micTimeoutRef.current);
        micTimeoutRef.current = null;
      }
      setIsListening(false);
      setActiveFeature(null);

      if (onNavigateToWebView) {
        onNavigateToWebView("voice", { text });
      }
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (micTimeoutRef.current) {
      clearTimeout(micTimeoutRef.current);
      micTimeoutRef.current = null;
    }
    setIsListening(false);
    setActiveFeature(null);
    speak(t("voiceError", language));
  });

  const handleVoice = useCallback(async () => {
    if (isProcessing || isListening) return;

    Speech.stop();

    const canProceed = await checkUsageLimit();
    if (!canProceed) {
      speak(t("creditShort", language));
      return;
    }

    setIsListening(true);
    setActiveFeature("live");

    try {
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        speak(t("micPermission", language));
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

      micTimeoutRef.current = setTimeout(() => {
        stopAllAudio();
        speak(t("voiceNotHeard", language));
      }, 10000);
    } catch (e) {
      console.error("[음성 오류]", e.message);
      setIsListening(false);
      setActiveFeature(null);
      speak(t("voiceStartFailed", language));
    }
  }, [
    isProcessing,
    isListening,
    checkUsageLimit,
    language,
    speak,
    setActiveFeature,
  ]);

  const handleArchive = useCallback(() => {
    stopAllAudio();
    if (onNavigateToWebView) {
      onNavigateToWebView("archive");
    }
  }, [stopAllAudio, onNavigateToWebView]);

  const handleLive = useCallback(() => {
    speak(t("liveComingSoon", language));
  }, [speak, language]);

  const handleAssistant = useCallback(() => {
    speak(t("assistantComingSoon", language));
  }, [speak, language]);

  // ⚠️ 수정금지(승인필요): 5개 버튼 핸들러 분기
  const handleButtonPress = useCallback(
    (buttonId) => {
      switch (buttonId) {
        case "live":
          handleLive();
          break;
        case "capture":
          debounceClick("capture", () => handleCapture(), 300);
          break;
        case "upload":
          handleUploadPress();
          break;
        case "assistant":
          handleAssistant();
          break;
        case "archive":
          debounceClick("archive", () => handleArchive(), 300);
          break;
      }
    },
    [
      handleLive,
      handleCapture,
      handleUploadPress,
      handleAssistant,
      handleArchive,
    ],
  );

  return (
    <View style={theme.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      {/* 카메라 전체 화면 배경 (후방 고정) */}
      <CameraView ref={cameraRef} />

      {/* 라이브 대화 오버레이 */}
      <LiveChat />

      {/* ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 — 뷰(첫 화면)에만 사는 사용법 1줄.
          촬영·업로드를 누르면 isProcessing 이 켜지며 사라지고 곧바로 해설 생성 화면으로 넘어간다
          = 뷰와 생성기는 동작이 다르다. pointerEvents none = 카메라·버튼 터치를 가로채지 않는다. */}
      {/* ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **바탕 없이 글자만, 움직임 없이 정지.**
          옛 방식(어두운 막 + 글자별 흘러내림 = HintWave) 완전삭제 §19 — 실기기에서 막이
          선글라스처럼 드러나 라이브뷰를 가렸다. 읽히게 하는 것은 글자 그림자 하나로 충분하다. */}
      {!isProcessing && isFocused && (
        <View style={theme.hintWrap} pointerEvents="none">
          <Text style={theme.hintText}>{t("hint", language)}</Text>
        </View>
      )}

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
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={pickerStyles.cardWrap}
          >
            <View style={pickerStyles.card}>
              {sourceStep === "pick" ? (
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
                      <Text
                        style={[
                          pickerStyles.btnText,
                          pickerStyles.btnTextPrimary,
                        ]}
                      >
                        내 기기
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[pickerStyles.btn, pickerStyles.btnGhost]}
                      onPress={() => setSourceStep("number")}
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
                    onChangeText={(v) =>
                      setPlaceIdText(v.replace(/[^0-9]/g, "").slice(0, 8))
                    }
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
                        placeIdValue > 0
                          ? pickerStyles.btnPrimary
                          : pickerStyles.btnDisabled,
                      ]}
                      onPress={handlePlaceIdConfirm}
                      disabled={placeIdValue <= 0}
                    >
                      <Icon name="check" size={18} color="#FFFFFF" />
                      <Text
                        style={[
                          pickerStyles.btnText,
                          pickerStyles.btnTextPrimary,
                        ]}
                      >
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

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  cardWrap: {
    width: "100%",
    maxWidth: 340,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    ...Shadows.elevated,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.light.text,
    textAlign: "center",
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
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  btn: {
    flex: 1,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnPrimary: { backgroundColor: Brand.primary },
  btnGhost: { backgroundColor: Colors.light.backgroundSecondary },
  btnDisabled: { backgroundColor: Colors.light.textTertiary },
  btnText: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.light.text },
  btnTextPrimary: { color: "#FFFFFF" },
});
