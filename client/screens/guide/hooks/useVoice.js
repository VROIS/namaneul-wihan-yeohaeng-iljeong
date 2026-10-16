// ⚠️ 수정금지(승인필요): 자비스의 귀 — Gemma 4 네이티브 오디오 우선, STT 폴백
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

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) return null;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await FileSystem.deleteAsync(uri, { idempotent: true });

      return base64;
    } catch (e) {
      console.error('[useVoice] 녹음 중지 실패:', e.message);
      recordingRef.current = null;
      return null;
    }
  }, []);

  // ⚠️ 수정금지(승인필요): 녹음 중지 → Gemma에 전송 → 응답 대기 → 다시 녹음
  const stopAndSend = useCallback(async () => {
    const audioBase64 = await stopRecording();
    if (!audioBase64) {
      if (isListeningRef.current) startRecording();
      return;
    }

    setLiveMode('thinking');
    addMessage({ role: 'user', text: '[음성 입력]' });

    let LiteRTBridge = null;
    try {
      LiteRTBridge = require('../../litert-bridge/src').default;
    } catch { /* 네이티브 모듈 없음 */ }

    if (LiteRTBridge) {
      try {
        await LiteRTBridge.sendAudio(audioBase64, '');
        setLiveMode('speaking');
      } catch {
        await fallbackSTT(audioBase64);
      }
    } else {
      await fallbackSTT(audioBase64);
    }

    if (isListeningRef.current) {
      setLiveMode('listening');
      startRecording();
    }
  }, [stopRecording, startRecording, setLiveMode, addMessage]);

  // ⚠️ 수정금지(승인필요): STT 폴백 (Gemma 오디오 불가 시)
  const fallbackSTT = useCallback(async (audioBase64) => {
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
