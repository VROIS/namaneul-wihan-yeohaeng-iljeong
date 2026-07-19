// ⚠️ 수정금지(승인필요): 카메라 라이브뷰 컴포넌트
// reference-LiveCameraView.kt 구조: 전체 화면 카메라 + 프레임 캡처
import React from 'react';
import { CameraView as ExpoCameraView } from 'expo-camera';
import { theme } from '../styles/theme';
import { CONFIG } from '../config/constants';

// ⚠️ 수정금지(승인필요): 전체 화면 카메라 배경 — 후면 고정 (삼성 전후면 전환 버그 방지)
export default React.forwardRef(function CameraView(props, ref) {
  return (
    <ExpoCameraView
      ref={ref}
      style={theme.cameraFull}
      facing="back"
    />
  );
});
