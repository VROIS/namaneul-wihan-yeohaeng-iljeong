// ⚠️ 수정금지(승인필요) — BTS 세계지도 (보라 도트맵 + 캡슐 알림판 줌인)
// 줌인 시 대상 도시 캡슐이 확대되며 도시명+공연기간+D-Day 텍스트 등장
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { BTS_WORLD_MAP_SVG } from "@/constants/bts-world-map-svg";

const { width: SW, height: SH } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 지도 크기 (viewBox 99x50 비율 유지)
const MAP_W = SW;
const MAP_H = SW * (50 / 99);
const MAP_TOP = (SH - MAP_H) / 2;

// ⚠️ 수정금지(승인필요) — 고양 좌표 (dotted-map getPoints 검증)
const GOYANG_VB_X = 87;
const GOYANG_VB_Y = 18.19;
const GOYANG_X = (GOYANG_VB_X / 99) * MAP_W;
const GOYANG_Y = (GOYANG_VB_Y / 50) * MAP_H;

// ⚠️ 수정금지(승인필요) — 캡슐 초기 크기 (SVG의 캡슐 마커와 일치)
const CAPSULE_INIT_W = (0.8 / 99) * MAP_W;   // viewBox 0.8 → 화면 크기
const CAPSULE_INIT_H = (1.2 / 99) * MAP_W;   // viewBox 1.2 → 화면 크기

type RouteParams = { city?: string; cityId?: number; dates?: string; dDay?: number };

export default function BTSWorldMapScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ BTSWorldMap: RouteParams }, "BTSWorldMap">>();
  const targetCity = route.params?.city || "GOYANG";
  const concertDates = route.params?.dates || "4/09~12";
  const dDay = route.params?.dDay ?? -3;

  // ⚠️ 수정금지(승인필요) — 줌인 애니메이션 값
  const mapScale = useSharedValue(1);
  const mapTx = useSharedValue(0);
  const mapTy = useSharedValue(0);
  const fadeOut = useSharedValue(0);

  // ⚠️ 수정금지(승인필요) — 캡슐 알림판 애니메이션 값
  const capsuleProgress = useSharedValue(0); // 0=작은점, 1=알림판
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    // ⚠️ 수정금지(승인필요) — 줌인 좌표 계산 (수학 검증)
    const S = 6;
    const tx = SW / 2 - MAP_W / 2 - (GOYANG_X - MAP_W / 2) * S;
    const ty = SH / 2 - MAP_TOP - MAP_H / 2 - (GOYANG_Y - MAP_H / 2) * S;

    // 1초 후 줌인 시작 (1.5초 동안)
    const zoomTimer = setTimeout(() => {
      mapScale.value = withTiming(S, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      mapTx.value = withTiming(tx, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      mapTy.value = withTiming(ty, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      // 캡슐 확대 동기화 (줌인과 함께)
      capsuleProgress.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
    }, 1000);

    // 줌인 70% 시점에 텍스트 페이드인
    const textTimer = setTimeout(() => {
      textOpacity.value = withTiming(1, { duration: 600 });
    }, 2000);

    // 줌인 완료 후 → BTSMiniApp (총 4초)
    let innerTimer: NodeJS.Timeout;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 4000);

    return () => { clearTimeout(zoomTimer); clearTimeout(textTimer); clearTimeout(navTimer); clearTimeout(innerTimer); };
  }, []);

  // ⚠️ 수정금지(승인필요) — 지도 transform
  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mapTx.value },
      { translateY: mapTy.value },
      { scale: mapScale.value },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 캡슐 알림판 스타일 (줌인과 동기화)
  const capsuleStyle = useAnimatedStyle(() => {
    // ⚠️ 수정금지(승인필요) — Layla식 3D 입체 카드: pill → FULL 클로즈업
    const w = interpolate(capsuleProgress.value, [0, 1], [CAPSULE_INIT_W * 6, SW * 0.85], Extrapolation.CLAMP);
    const h = interpolate(capsuleProgress.value, [0, 1], [CAPSULE_INIT_H * 6, SH * 0.4], Extrapolation.CLAMP);
    // 둥근 모서리: pill → 20px (Layla 카드)
    const borderRadius = interpolate(capsuleProgress.value, [0, 1], [CAPSULE_INIT_W * 3, 20], Extrapolation.CLAMP);

    return {
      width: w,
      height: h,
      borderRadius,
      // 글래스모피즘 배경 — 반투명 보라
      backgroundColor: `rgba(124, 58, 237, ${interpolate(capsuleProgress.value, [0, 0.5, 1], [0.85, 0.9, 0.92], Extrapolation.CLAMP)})`,
      // 입체 그림자 — 카드가 떠있는 느낌
      shadowColor: "rgba(0,0,0,0.5)",
      shadowOpacity: interpolate(capsuleProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
      shadowRadius: interpolate(capsuleProgress.value, [0, 1], [0, 24], Extrapolation.CLAMP),
      shadowOffset: { width: 0, height: interpolate(capsuleProgress.value, [0, 1], [0, 8], Extrapolation.CLAMP) },
      elevation: interpolate(capsuleProgress.value, [0, 1], [0, 16], Extrapolation.CLAMP),
      // 글래스 테두리
      borderWidth: 1,
      borderColor: `rgba(255,255,255,${interpolate(capsuleProgress.value, [0, 1], [0.3, 0.15], Extrapolation.CLAMP)})`,
    };
  });

  // ⚠️ 수정금지(승인필요) — 텍스트 페이드인
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeOut.value }));

  const dDayText = dDay > 0 ? `D-${dDay}` : dDay === 0 ? "D-Day" : `D+${Math.abs(dDay)}`;

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <View style={styles.bg} />

      {/* 도트맵 SVG */}
      <Animated.View style={[styles.mapArea, mapStyle]}>
        <SvgXml xml={BTS_WORLD_MAP_SVG} width={MAP_W} height={MAP_H} />
      </Animated.View>

      {/* ⚠️ 수정금지(승인필요) — 캡슐 알림판 오버레이 (화면 중앙 고정) */}
      <View style={styles.capsuleContainer} pointerEvents="none">
        <Animated.View style={[styles.capsule, capsuleStyle]}>
          <Animated.View style={[styles.capsuleContent, textStyle]}>
            <Text style={styles.capsuleCity}>{targetCity.toUpperCase()}</Text>
            <View style={styles.divider} />
            <Text style={styles.capsuleDates}>{concertDates}</Text>
            <Text style={styles.capsuleDDay}>{dDayText}</Text>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF" },
  mapArea: {
    position: "absolute",
    left: 0,
    top: MAP_TOP,
    width: MAP_W,
    height: MAP_H,
  },
  // ⚠️ 수정금지(승인필요) — 캡슐을 화면 중앙에 고정 (줌인 완료 시 도시 위치 = 화면 중앙)
  capsuleContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  capsule: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  // ⚠️ 수정금지(승인필요) — 캡슐 내부 텍스트 (FULL 클로즈업 크기)
  capsuleContent: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: 20,
  },
  capsuleCity: {
    fontSize: 36,
    fontFamily: "SpaceGrotesk-Bold",
    color: "#FFFFFF",
    letterSpacing: 4,
    marginBottom: 10,
  },
  // ⚠️ 수정금지(승인필요) — 구분선 (Layla식 subtle divider)
  divider: {
    width: 40,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
  capsuleDates: {
    fontSize: 18,
    fontFamily: "SpaceGrotesk-Regular",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 2,
    marginBottom: 6,
  },
  capsuleDDay: {
    fontSize: 28,
    fontFamily: "SpaceGrotesk-Bold",
    color: "#FFFFFF",
    letterSpacing: 3,
  },
});
