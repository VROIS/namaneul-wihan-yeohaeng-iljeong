// ⚠️ 수정금지(승인필요) — BTS 세계지도 (dotted-map, 낮모드, 고양 줌인)
// 수학 검증 완료: 고양 viewBox(87, 18.19) → 화면 (88%, 36%) → 중앙 이동
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
// viewBox 내: x=87, y=18.19 (99x50)
// 화면 절대: screenX = (87/99)*SW = SW*0.879, screenY = MAP_TOP + (18.19/50)*MAP_H
const GOYANG_RATIO_X = 87 / 99;  // 0.879
const GOYANG_RATIO_Y = 18.19 / 50; // 0.364
const GOYANG_X = GOYANG_RATIO_X * MAP_W;
const GOYANG_Y = GOYANG_RATIO_Y * MAP_H;
const GOYANG_SCREEN_Y = MAP_TOP + GOYANG_Y;

type RouteParams = { city?: string; cityId?: number };

export default function BTSWorldMapScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ BTSWorldMap: RouteParams }, "BTSWorldMap">>();
  const targetCity = route.params?.city || "Goyang";

  const mapScale = useSharedValue(1);
  const mapTx = useSharedValue(0);
  const mapTy = useSharedValue(0);
  const fadeOut = useSharedValue(0);

  useEffect(() => {
    // ⚠️ 수정금지(승인필요) — 줌인 좌표 계산 (수학 검증)
    // React Native transform 순서: [translateX, translateY, scale]
    // 적용: 먼저 translate → 그 후 뷰 중심에서 scale
    //
    // 목표: 고양(GOYANG_X, GOYANG_Y)이 줌 후 화면 중앙(SW/2, SH/2)에 위치
    //
    // 뷰 중심: (MAP_W/2, MAP_H/2)
    // scale S 후 뷰 중심에서 각 점의 거리가 S배
    // translate (tx, ty) 후 scale S:
    //   결과 x = viewCenterX_screen + (GOYANG_X + tx - MAP_W/2) * S
    //   결과 y = viewCenterY_screen + (GOYANG_Y + ty - MAP_H/2) * S
    // viewCenterX_screen = 0 + tx + MAP_W/2 ... 복잡함
    //
    // 간단한 방법: scale 먼저, translate 나중
    // scale S from view center → 고양 이동 위치:
    //   gx_after = MAP_W/2 + (GOYANG_X - MAP_W/2) * S
    //   gy_after = MAP_TOP + MAP_H/2 + (GOYANG_Y - MAP_H/2) * S
    // 이것을 화면 중앙으로:
    //   tx = SW/2 - gx_after
    //   ty = SH/2 - gy_after

    // React Native transform: [translateX, translateY, scale]
    // 순서: translate 먼저 적용 → 뷰가 이동 → 그 후 뷰 중심에서 scale
    // 목표: scale 후 고양이 화면 중앙(SW/2, SH/2)에 위치
    //
    // translate (tx, ty) 후 뷰 중심 = (MAP_W/2 + tx, MAP_TOP + MAP_H/2 + ty)
    // scale S from 그 중심 후, 고양의 최종 위치:
    //   finalX = (MAP_W/2 + tx) + (GOYANG_X + tx - (MAP_W/2 + tx)) * S
    //          = (MAP_W/2 + tx) + (GOYANG_X - MAP_W/2) * S
    //   finalY = (MAP_TOP + MAP_H/2 + ty) + (GOYANG_Y - MAP_H/2) * S
    //
    // finalX = SW/2, finalY = SH/2 로 풀면:
    //   tx = SW/2 - MAP_W/2 - (GOYANG_X - MAP_W/2) * S
    //   ty = SH/2 - MAP_TOP - MAP_H/2 - (GOYANG_Y - MAP_H/2) * S

    const S = 6;
    const tx = SW / 2 - MAP_W / 2 - (GOYANG_X - MAP_W / 2) * S;
    const ty = SH / 2 - MAP_TOP - MAP_H / 2 - (GOYANG_Y - MAP_H / 2) * S;

    // ⚠️ 수정금지(승인필요) — 1초 후 부드럽게 줌인 (1.5초, ease-in-out)
    const zoomTimer = setTimeout(() => {
      mapScale.value = withTiming(S, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      mapTx.value = withTiming(tx, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      mapTy.value = withTiming(ty, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
    }, 1000);

    // 줌인 완료 후 → 캐릭터 선택 (총 3.5초)
    let innerTimer: NodeJS.Timeout;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 3500);

    return () => { clearTimeout(zoomTimer); clearTimeout(navTimer); clearTimeout(innerTimer); };
  }, []);

  // ⚠️ 수정금지(승인필요) — transform: translate 먼저 → scale 나중 (RN 순서)
  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mapTx.value },
      { translateY: mapTy.value },
      { scale: mapScale.value },
    ],
  }));

  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeOut.value }));

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <View style={styles.bg} />

      <Animated.View style={[styles.mapArea, mapStyle]}>
        <SvgXml xml={BTS_WORLD_MAP_SVG} width={MAP_W} height={MAP_H} />
      </Animated.View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>NEXT CONCERT</Text>
        <Text style={styles.footerCity}>{targetCity.toUpperCase()}</Text>
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
    top: (SH - SW * (50 / 99)) / 2,
    width: SW,
    height: SW * (50 / 99),
  },
  footer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 60 : 40,
    left: 0, right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  footerLabel: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk-Regular",
    color: "rgba(0,0,0,0.4)",
    letterSpacing: 4,
    marginBottom: 4,
  },
  footerCity: {
    fontSize: 28,
    fontFamily: "SpaceGrotesk-Bold",
    color: "#1A1A1A",
    letterSpacing: 2,
  },
});
