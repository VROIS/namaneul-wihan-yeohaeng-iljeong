// ⚠️ 수정금지(승인필요) — BTS 세계지도 줌인 + 3D 글래스 알림판
// 마커가 mapArea 안에 배치 → 줌인과 함께 자연스럽게 확대
// 데이터: /api/bts/next-concert 실시간 (날짜, D-Day, 공연장)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { loadBtsWorldMapSvg } from "@/constants/bts-world-map-svg";
import { geoToViewBox } from "@/components/DotWorldMap";

const { width: SW, height: SH } = Dimensions.get("window");

// ⚠️ 수정금지(승인필요) — 지도 크기 (viewBox 99x50 비율 유지)
const MAP_W = SW;
const MAP_H_ORIGINAL = SW * (50 / 99);
// ⚠️ 수정금지(승인필요) — 원본 비율 유지, 화면 폭 꽉 채움
// ⚠️ 수정금지(승인필요) — 세로 1.6배 확장 (K6 최종안)
const MAP_H = MAP_H_ORIGINAL * 1.6;
const MAP_TOP = (SH - MAP_H) / 2;

// ⚠️ 수정금지(승인필요) — 도시 좌표 DB (위경도 → viewBox 변환)
// 추후 API에서 가져오도록 확장 가능
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  GOYANG: { lat: 37.6584, lng: 126.832 },
  TOKYO: { lat: 35.6762, lng: 139.6503 },
  TAMPA: { lat: 27.9506, lng: -82.4572 },
  PARIS: { lat: 48.8566, lng: 2.3522 },
  LONDON: { lat: 51.5074, lng: -0.1278 },
  "LOS ANGELES": { lat: 34.0522, lng: -118.2437 },
  BUSAN: { lat: 35.1796, lng: 129.0756 },
  MADRID: { lat: 40.4168, lng: -3.7038 },
  MUNICH: { lat: 48.1351, lng: 11.5820 },
  SINGAPORE: { lat: 1.3521, lng: 103.8198 },
  BANGKOK: { lat: 13.7563, lng: 100.5018 },
  SYDNEY: { lat: -33.8688, lng: 151.2093 },
  MANILA: { lat: 14.5995, lng: 120.9842 },
};

type RouteParams = { city?: string; cityId?: number; date?: string; dDay?: number; venue?: string };

export default function BTSWorldMapScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ BTSWorldMap: RouteParams }, "BTSWorldMap">>();

  // ⚠️ 수정금지(승인필요) — SVG 에셋 비동기 로딩 (번들 크기 축소)
  const [svgXml, setSvgXml] = useState<string | null>(null);
  useEffect(() => {
    loadBtsWorldMapSvg().then(setSvgXml);
  }, []);

  // ⚠️ 수정금지(승인필요) — API 실시간 데이터 (랜딩 params + API fallback)
  const [concert, setConcert] = useState({
    city: route.params?.city || "GOYANG",
    date: route.params?.date || "",
    dDay: route.params?.dDay ?? 0,
    venue: route.params?.venue || "",
  });

  // ⚠️ 수정금지(승인필요) — params 없으면 API에서 직접 가져옴
  useEffect(() => {
    if (!concert.date) {
      fetch(`${getApiUrl()}/api/bts/next-concert`)
        .then(r => r.json())
        .then(d => {
          if (d.city) setConcert({ city: d.city.toUpperCase(), date: d.date, dDay: d.dDay, venue: d.venue || "" });
        })
        .catch(() => {}); // fallback 유지
    }
  }, []);

  const targetCity = concert.city;
  const concertDate = concert.date;
  const dDay = concert.dDay;
  const venue = concert.venue;

  // ⚠️ 수정금지(승인필요) — 도시 좌표 → viewBox → 화면 좌표
  const coords = CITY_COORDS[targetCity.toUpperCase()] || CITY_COORDS.GOYANG;
  const vb = geoToViewBox(coords.lat, coords.lng);
  const targetX = (vb.x / 99) * MAP_W;
  const targetY = (vb.y / 50) * MAP_H;

  // ⚠️ 수정금지(승인필요) — 애니메이션 값
  const mapScale = useSharedValue(1);
  const mapTx = useSharedValue(0);
  const mapTy = useSharedValue(0);
  const fadeOut = useSharedValue(0);
  const cardScale = useSharedValue(0);   // 카드 팽창: 0=점, 1=풀카드
  const textOpacity1 = useSharedValue(0); // 도시명
  const textOpacity2 = useSharedValue(0); // 날짜
  const textOpacity3 = useSharedValue(0); // D-Day
  const textOpacity4 = useSharedValue(0); // 공연장

  useEffect(() => {
    // ⚠️ 수정금지(승인필요) — 줌인 좌표 계산
    const S = 6;
    const tx = SW / 2 - MAP_W / 2 - (targetX - MAP_W / 2) * S;
    const ty = SH / 2 - MAP_TOP - MAP_H / 2 - (targetY - MAP_H / 2) * S;

    // ⚠️ 수정금지(승인필요) — 1초 후 줌인 시작 (1.5초, 원본 타이밍)
    const zoomTimer = setTimeout(() => {
      mapScale.value = withTiming(S, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      mapTx.value = withTiming(tx, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
      mapTy.value = withTiming(ty, { duration: 1500, easing: Easing.inOut(Easing.cubic) });
    }, 1000);

    // ⚠️ 수정금지(승인필요) — 줌인 거의 완료 시 (2초) 카드 팽창
    const cardTimer = setTimeout(() => {
      cardScale.value = withSpring(1, { damping: 15, stiffness: 160 });
      textOpacity1.value = withTiming(1, { duration: 300 });
      textOpacity2.value = withDelay(100, withTiming(1, { duration: 300 }));
      textOpacity3.value = withDelay(200, withTiming(1, { duration: 300 }));
      textOpacity4.value = withDelay(300, withTiming(1, { duration: 300 }));
    }, 2000);

    // ⚠️ 수정금지(승인필요) — 알림판 유지 후 전환 (총 3.5초, 원본 타이밍)
    let innerTimer: NodeJS.Timeout;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 3500);

    return () => { clearTimeout(zoomTimer); clearTimeout(cardTimer); clearTimeout(navTimer); clearTimeout(innerTimer); };
  }, []);

  // ⚠️ 수정금지(승인필요) — 지도 transform
  const mapStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mapTx.value },
      { translateY: mapTy.value },
      { scale: mapScale.value },
    ],
  }));

  // ⚠️ 수정금지(승인필요) — 카드 스타일 (도시 위치에서 팽창)
  const cardAnimStyle = useAnimatedStyle(() => {
    const s = interpolate(cardScale.value, [0, 1], [0.1, 1], Extrapolation.CLAMP);
    return {
      transform: [{ scale: s }],
      opacity: interpolate(cardScale.value, [0, 0.3, 1], [0, 0.5, 1], Extrapolation.CLAMP),
    };
  });

  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeOut.value }));
  const t1 = useAnimatedStyle(() => ({ opacity: textOpacity1.value }));
  const t2 = useAnimatedStyle(() => ({ opacity: textOpacity2.value }));
  const t3 = useAnimatedStyle(() => ({ opacity: textOpacity3.value }));
  const t4 = useAnimatedStyle(() => ({ opacity: textOpacity4.value }));

  const dDayText = dDay > 0 ? `D-${dDay}` : dDay === 0 ? "D-Day" : `D+${Math.abs(dDay)}`;
  // ⚠️ 수정금지(승인필요) — 날짜 포맷: 2026.4.17 (전 인류 이해, 년월일 제외)
  const dateDisplay = concertDate ? (() => { const d = new Date(concertDate); return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`; })() : "";

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <View style={styles.bg} />

      {/* ⚠️ 수정금지(승인필요) — 상단 타이틀 (랜딩과 동일, 일관성) */}
      <View style={styles.hero}>
        <Text style={styles.tourLabel}>WORLD TOUR 2026</Text>
        <View style={styles.titleRow}>
          <Text style={styles.titleBTS}>BTS </Text>
          <Text style={styles.titleArirang}>'Arirang'</Text>
        </View>
      </View>

      {/* ⚠️ 수정금지(승인필요) — 도트맵 + 마커 (같은 부모 안) */}
      <Animated.View style={[styles.mapArea, mapStyle]}>
        {svgXml ? <SvgXml xml={svgXml} width={MAP_W} height={MAP_H} /> : null}

        {/* ⚠️ 수정금지(승인필요) — 공연 알림판 카드 (도시 좌표 위에 배치) */}
        <Animated.View
          style={[
            styles.cardAnchor,
            { left: targetX - 100, top: targetY - 70 },
            cardAnimStyle,
          ]}
        >
          <BlurView intensity={100} tint="light" style={styles.cardBlur}>
            <Animated.Text style={[styles.cardCity, t1]}>{targetCity}</Animated.Text>
            <Animated.View style={[styles.divider, t2]} />
            <Animated.Text style={[styles.cardDate, t2]}>{dateDisplay}</Animated.Text>
            <Animated.Text style={[styles.cardDDay, t3]}>{dDayText}</Animated.Text>
            {venue ? <Animated.Text style={[styles.cardVenue, t4]}>{venue}</Animated.Text> : null}
          </BlurView>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF" },
  // ⚠️ 수정금지(승인필요) — 상단 타이틀 (랜딩과 동일 구조, 흰 배경용 색상)
  // ⚠️ 수정금지(승인필요) — 상단 타이틀 (중앙, 지도 위 여백 채움)
  // ⚠️ 수정금지(승인필요) — 타이틀을 지도 바로 위에 배치 (절대 위치)
  hero: {
    position: "absolute" as const,
    top: MAP_TOP - 110, // ⚠️ 수정금지(승인필요) — 지도 위 최소 여백
    left: 0,
    right: 0,
    alignItems: "center" as const,
    zIndex: 20,
  },
  tourLabel: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 8,
    color: "rgba(0,0,0,0.35)",
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
  },
  titleBTS: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    color: "#6C2DC7",
  },
  titleArirang: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    fontStyle: "italic" as const,
    color: "#6C2DC7",
  },
  mapArea: {
    position: "absolute",
    left: 0,
    top: MAP_TOP,
    width: MAP_W,
    height: MAP_H,
  },
  // ⚠️ 수정금지(승인필요) — 카드 앵커 (도시 좌표 위)
  cardAnchor: {
    position: "absolute",
    width: 200,
    height: 140,
    zIndex: 10,
  },
  // ⚠️ 수정금지(승인필요) — 3D 글래스 카드 (최대한 옅은 보라 + 입체)
  cardBlur: {
    flex: 1,
    borderRadius: 20,
    borderCurve: "continuous" as any, // ⚠️ 수정금지(승인필요) — iOS 스무스 코너 (RN 베스트프랙티스)
    // ⚠️ 수정금지(승인필요) — 흰색 글래스 배경 (보라 도트맵 위에서 돋보임)
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(108, 45, 199, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
    overflow: "hidden",
    // ⚠️ 수정금지(승인필요) — 3D 그림자 (RN 베스트프랙티스: boxShadow CSS 문법)
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(108, 45, 199, 0.3)" as any,
  },
  divider: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(108, 45, 199, 0.3)",
    marginVertical: 3,
  },
  // ⚠️ 수정금지(승인필요) — 카드 텍스트 (흰 배경 + 보라 텍스트)
  cardCity: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    color: "#1A1A1A",
    letterSpacing: 2,
  },
  cardDate: {
    fontSize: 6,
    fontFamily: "Pretendard-Bold",
    color: "rgba(0,0,0,0.6)",
    letterSpacing: 0.5,
  },
  cardDDay: {
    fontSize: 10,
    fontFamily: "Pretendard-Bold",
    color: "#6C2DC7",
  },
  cardVenue: {
    fontSize: 5,
    fontFamily: "Pretendard-Bold",
    color: "rgba(0,0,0,0.5)",
    marginTop: 2,
  },
});
