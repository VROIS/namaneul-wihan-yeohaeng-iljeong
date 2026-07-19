// ⚠️ 수정금지(승인필요) — 아미봉 SVG 아이콘 (지도 핀 / 버튼 아이콘 겸용)
// 구체(Circle) + 손잡이(Rect) + 글로우(RadialGradient)
// Props: size(12/24/48), color, glowing
import React from "react";
import Svg, {
  Circle,
  Rect,
  Defs,
  RadialGradient,
  Stop,
  G,
} from "react-native-svg";

const BORAHAE = "#6C2DC7";

interface ArmyBombIconProps {
  size?: number;
  color?: string;
  glowing?: boolean;
}

export function ArmyBombIcon({
  size = 24,
  color = BORAHAE,
  glowing = false,
}: ArmyBombIconProps) {
  // ⚠️ 수정금지(승인필요) — 아미봉 비율: 구체 60%, 손잡이 40%
  const globeR = size * 0.3; // 구체 반지름
  const handleW = size * 0.15; // 손잡이 너비
  const handleH = size * 0.35; // 손잡이 높이
  const cx = size / 2; // 중심 X
  const globeCy = size * 0.35; // 구체 중심 Y
  const handleY = globeCy + globeR - 1; // 손잡이 시작 (겹침)

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        {/* 구체 글로우 그라디언트 */}
        <RadialGradient id="globeGlow" cx="50%" cy="40%" r="50%">
          <Stop
            offset="0%"
            stopColor="#FFFFFF"
            stopOpacity={glowing ? 0.9 : 0.5}
          />
          <Stop
            offset="50%"
            stopColor={color}
            stopOpacity={glowing ? 0.6 : 0.3}
          />
          <Stop
            offset="100%"
            stopColor={color}
            stopOpacity={glowing ? 0.3 : 0.1}
          />
        </RadialGradient>
        {/* 글로우 후광 */}
        {glowing && (
          <RadialGradient id="outerGlow" cx="50%" cy="35%" r="70%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        )}
      </Defs>

      <G>
        {/* 글로우 후광 (glowing일 때만) */}
        {glowing && (
          <Circle
            cx={cx}
            cy={globeCy}
            r={globeR * 1.8}
            fill="url(#outerGlow)"
          />
        )}

        {/* 구체 */}
        <Circle cx={cx} cy={globeCy} r={globeR} fill="url(#globeGlow)" />
        <Circle
          cx={cx}
          cy={globeCy}
          r={globeR}
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          opacity={0.5}
        />

        {/* 손잡이 */}
        <Rect
          x={cx - handleW / 2}
          y={handleY}
          width={handleW}
          height={handleH}
          rx={handleW / 3}
          fill={color}
          opacity={0.6}
        />
      </G>
    </Svg>
  );
}
