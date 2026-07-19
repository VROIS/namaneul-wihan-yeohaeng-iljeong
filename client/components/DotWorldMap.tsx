// ⚠️ 수정금지(승인필요) — 도트 세계지도 재사용 컴포넌트
// BTS 모드: 공연도시 캡슐 마커 + 줌인 + D-Day
// 메인 모드: 전체 도시 탭 선택 (추후 확장)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  SharedValue,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";
import { loadBtsWorldMapSvg } from "@/constants/bts-world-map-svg";

const { width: SW, height: SH } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — viewBox 99x50 비율 유지
const MAP_W = SW;
const MAP_H = SW * (50 / 99);

export interface DotWorldMapProps {
  // 줌인 애니메이션 값 (외부에서 제어)
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  // 줌인 대상 도시 정보 (캡슐 확대 시 표시)
  targetCity?: string;
  targetDate?: string;
  targetDDay?: number;
}

// ⚠️ 수정금지(승인필요) — 도트 세계지도 컴포넌트
export default function DotWorldMap({
  scale,
  translateX,
  translateY,
  targetCity,
  targetDate,
  targetDDay,
}: DotWorldMapProps) {
  // ⚠️ 수정금지(승인필요) — SVG 에셋 비동기 로딩 (번들 크기 축소)
  const [svgXml, setSvgXml] = useState<string | null>(null);
  useEffect(() => {
    loadBtsWorldMapSvg().then(setSvgXml);
  }, []);

  // ⚠️ 수정금지(승인필요) — transform: translate 먼저 → scale 나중 (RN 순서)
  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          top: (SH - MAP_H) / 2,
          width: MAP_W,
          height: MAP_H,
        },
        mapStyle,
      ]}
    >
      {svgXml ? <SvgXml xml={svgXml} width={MAP_W} height={MAP_H} /> : null}
    </Animated.View>
  );
}

// ⚠️ 수정금지(승인필요) — viewBox 좌표 변환 유틸리티
// 위경도 → viewBox(99x50) 좌표
export function geoToViewBox(latitude: number, longitude: number) {
  const x = ((longitude + 180) / 360) * 99;
  const y = ((90 - latitude) / 180) * 50;
  return { x, y };
}

// ⚠️ 수정금지(승인필요) — viewBox 좌표 → 화면 좌표
export function viewBoxToScreen(vbX: number, vbY: number) {
  return {
    screenX: (vbX / 99) * MAP_W,
    screenY: (vbY / 50) * MAP_H,
  };
}

// ⚠️ 수정금지(승인필요) — 줌인 좌표 계산 (수학 검증)
// 목표 도시를 화면 중앙으로 줌인할 때 필요한 translate 값
export function calcZoomTranslate(vbX: number, vbY: number, zoomScale: number) {
  const targetX = (vbX / 99) * MAP_W;
  const targetY = (vbY / 50) * MAP_H;
  const mapTop = (SH - MAP_H) / 2;

  const tx = SW / 2 - MAP_W / 2 - (targetX - MAP_W / 2) * zoomScale;
  const ty = SH / 2 - mapTop - MAP_H / 2 - (targetY - MAP_H / 2) * zoomScale;

  return { tx, ty };
}
