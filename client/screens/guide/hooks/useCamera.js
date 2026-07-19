// ⚠️ 수정금지(승인필요): 카메라 훅 — 프레임 캡처 + AI 전송
// reference-LiveCameraView.kt의 ImageAnalysis 패턴을 RN으로 구현
// preferredSize=500, STRATEGY_KEEP_ONLY_LATEST (최신 프레임만 유지)
import { useRef, useCallback } from 'react';
import { useStore } from '../state/store';
import { CONFIG } from '../config/constants';

export function useCamera() {
  const cameraRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const setPhotoUri = useStore((s) => s.setPhotoUri);

  // ⚠️ 수정금지(승인필요): 즉시 촬영 (촬영 버튼)
  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: CONFIG.CAMERA.QUALITY,
        base64: true, // AI 분석용 base64 포함
      });
      setPhotoUri(photo.uri);
      return photo;
    } catch (error) {
      console.error('[useCamera] 촬영 실패:', error.message);
      return null;
    }
  }, [setPhotoUri]);

  // ⚠️ 수정금지(승인필요): 라이브 모드 — 주기적 프레임 캡처 (1-3fps)
  // reference-LiveCameraView.kt: ImageAnalysis + STRATEGY_KEEP_ONLY_LATEST
  const startFrameCapture = useCallback((onFrame) => {
    if (frameIntervalRef.current) return; // 이미 실행 중

    const intervalMs = 1000 / CONFIG.CAMERA.FPS;
    frameIntervalRef.current = setInterval(async () => {
      if (!cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.3,  // 프레임용 저품질
          base64: true,
          skipProcessing: true, // 빠른 캡처
        });
        onFrame?.(photo);
      } catch {
        // 프레임 드롭 무시 (STRATEGY_KEEP_ONLY_LATEST와 동일)
      }
    }, intervalMs);
  }, []);

  // ⚠️ 수정금지(승인필요): 프레임 캡처 중지
  const stopFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  return {
    cameraRef,
    takePicture,
    startFrameCapture,
    stopFrameCapture,
  };
}
