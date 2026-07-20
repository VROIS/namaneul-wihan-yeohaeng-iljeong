// ⚠️ 수정금지(승인필요): 가이드 미니앱 공용 SVG 아이콘 = 운영앱(index.html·index.js) SVG 경로 그대로
// = 2026-07-20 사장님 실기기 SSOT: iOS Expo Go 에서 Ionicons(글꼴 계열)가 렌더 안 됨(터치만 됨).
//   5단 버튼(FooterButtons)만 보였던 이유 = react-native-svg 직접 렌더. → 모든 버튼 아이콘을 이 방식으로 통일.
// = stroke 형(outline)과 fill 형(solid)을 운영 원본과 동일하게 구분.
import React from 'react';
import Svg, { Path } from 'react-native-svg';

// 운영 원본 SVG path (1글자 불변): index.html backBtn·textToggleBtn·saveBtn·locationInfo·detailMicBtn,
// index.js closeWindowBtn·play-icon·pause-icon.
const STROKE_ICONS = {
  close: ['M6 18L18 6M6 6l12 12'],
  back: ['M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18'],
  documentText: [
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  ],
  bookmark: ['M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'],
  mic: [
    'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  ],
  // 저장 성공 체크마크 = 운영 index.js:3120 그대로(stroke-width 3). 1.5초 후 bookmark 복원.
  check: ['M5 13l4 4L19 7'],
};

const FILL_ICONS = {
  play: [
    'M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.648c1.295.748 1.295 2.538 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653z',
  ],
  pause: [
    'M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z',
  ],
  location: [
    'M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z',
  ],
};

export default function GuideIcon({ name, size = 24, color = '#4285F4', strokeWidth = 2 }) {
  const stroke = STROKE_ICONS[name];
  const fill = FILL_ICONS[name];
  if (!stroke && !fill) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {(stroke || []).map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {(fill || []).map((d, i) => (
        <Path key={i} d={d} fill={color} fillRule="evenodd" clipRule="evenodd" />
      ))}
    </Svg>
  );
}
