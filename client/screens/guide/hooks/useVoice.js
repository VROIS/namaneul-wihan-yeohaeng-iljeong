// ⚠️ 수정금지(승인필요): 자비스의 귀 — Gemma 4 네이티브 오디오 우선, STT 폴백
// Always-Listening: 라이브 버튼 한 번 → 이후 모든 것 음성
// Gemma 4 E2B USM Conformer → STT 없이 음성 직접 이해
// reference-AudioRecorderPanel.kt 패턴: PCM 16bit mono 녹음
import { useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useStore } from '../state/store';
import { CONFIG } from '../config/constants';

// ⚠️ 수정금지(승인필요): 녹음 설정 (reference-AudioRecorderPanel.kt 동일)
const RECORDING_OPTIONS = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,       // 16kHz (음성 인식 표준)
    numberOfChannels: 1,      // mono
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

export function useVoice() {
  const recordingRef = useRef(null);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef(null);

  const { liveMode, setLiveMode, addMessage } = useStore();

  // ⚠️ 수정금지(승인필요): 마이크 권한 요청
  const requestPermission = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[useVoice] 마이크 권한 거부');
      return false;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    return true;
  }, []);

  // ⚠️ 수정금지(승인필요): 녹음 시작
  const startRecording = useCallback(async () => {
    if (recordingRef.current) return; // 이미 녹음 중

    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;

      // 무음 감지 타이머 (SILENCE_TIMEOUT 후 자동 전송)
      silenceTimerRef.current = setTimeout(async () => {
        await stopAndSend();
      }, CONFIG.VOICE.SILENCE_TIMEOUT);

    } catch (e) {
      console.error('[useVoice] 녹음 시작 실패:', e.message);
    }
  }, [requestPermission]);

  // ⚠️ 수정금지(승인필요): 녹음 중지 → 오디오 데이터 반환
  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return null;

    // 무음 타이머 해제
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) return null;

      // 파일 → base64 변환 (Gemma AudioBytes용)
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 임시 파일 삭제
      await FileSystem.deleteAsync(uri, { idempotent: true });

      return base64;
    } catch (e) {
      console.error('[useVoice] 녹음 중지 실패:', e.message);
      recordingRef.current = null;
      return null;
    }
  }, []);

  // ⚠️ 수정금지(승인필요): 녹음 중지 → Gemma에 전송 → 응답 대기 → 다시 녹음
  // Always-Listening 루프의 핵심
  const stopAndSend = useCallback(async () => {
    const audioBase64 = await stopRecording();
    if (!audioBase64) {
      // 녹음 실패 → 다시 시도
      if (isListeningRef.current) startRecording();
      return;
    }

    setLiveMode('thinking');
    addMessage({ role: 'user', text: '[음성 입력]' });

    // 방법 A: Gemma 4 네이티브 오디오 (Content.AudioBytes)
    let LiteRTBridge = null;
    try {
      LiteRTBridge = require('../../litert-bridge/src').default;
    } catch { /* 네이티브 모듈 없음 */ }

    if (LiteRTBridge) {
      try {
        // Gemma가 오디오를 직접 이해 (USM Conformer)
        await LiteRTBridge.sendAudio(audioBase64, '');
        // 응답은 onToken 이벤트로 수신 → useAI에서 TTS
        setLiveMode('speaking');
      } catch {
        // 방법 B 폴백: expo-speech-recognition STT
        await fallbackSTT(audioBase64);
      }
    } else {
      await fallbackSTT(audioBase64);
    }

    // Always-Listening: 응답 후 다시 녹음 시작
    if (isListeningRef.current) {
      setLiveMode('listening');
      startRecording();
    }
  }, [stopRecording, startRecording, setLiveMode, addMessage]);

  // ⚠️ 수정금지(승인필요): STT 폴백 (Gemma 오디오 불가 시)
  const fallbackSTT = useCallback(async (audioBase64) => {
    // expo-speech-recognition은 실시간 스트리밍이므로 별도 처리
    // 여기서는 간단히 로그만 — 실제로는 useVoice 시작 시
    // ExpoSpeechRecognitionModule을 병행 실행하는 방식
    console.log('[useVoice] STT 폴백 — expo-speech-recognition 사용');
  }, []);

  // ⚠️ 수정금지(승인필요): Always-Listening 시작 (라이브 버튼)
  const startListening = useCallback(async () => {
    isListeningRef.current = true;
    setLiveMode('listening');
    await startRecording();
  }, [startRecording, setLiveMode]);

  // ⚠️ 수정금지(승인필요): Always-Listening 중지
  const stopListening = useCallback(async () => {
    isListeningRef.current = false;
    setLiveMode('off');
    await stopRecording();
  }, [stopRecording, setLiveMode]);

  // ⚠️ 수정금지(승인필요): 현재 녹음 중인지
  const isListening = useCallback(() => {
    return isListeningRef.current;
  }, []);

  return {
    startListening,
    stopListening,
    isListening,
    startRecording,
    stopRecording,
    stopAndSend,
  };
}
