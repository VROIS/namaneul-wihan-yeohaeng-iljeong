// ⚠️ 수정금지(승인필요) — BTS 세계지도 줌인 + 3D 글래스 알림판 = **인트로 연출**(누르는 화면 아님)
// 마커가 mapArea 안에 배치 → 줌인과 함께 자연스럽게 확대
// 데이터: /api/bts/cities (임박 5개 도시의 이름·좌표·D-Day) + 랜딩에서 넘어온 줌인 대상 도시
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";
// 임박 5개 규칙·도시 타입 = 8장 화면과 같은 1벌(§16)
import {
  pickImminentCities,
  formatDDay,
  type BTSCity,
} from "@/contexts/BTSContext";
// 웹 지구본 = cobe. 네이티브(아래 SVG 지도)와 분리된 파일 1개로 둔다.
import BTSGlobeIntroWeb from "./BTSGlobeIntroWeb";
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

// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 이 화면은 **인트로 연출**이다(아미봉 인증창과 같은 성격).
//   · 사용자가 누르는 화면이 아니다 = 3초 남짓 지나가므로 클릭을 받을 수 없다.
//   · 하는 일 = 공연할 도시를 **정확히 보여주는 것**뿐. 임박한 5개를 피켓으로 찍고,
//     아미봉 인증화면(랜딩)에 나온 그 도시로 줌인해 하이라이트한다.
//   · 도시 목록·좌표는 DB 에서 온다(GET /api/bts/cities). 손으로 적어둔 좌표표 완전삭제 §19.
//   · 5개를 고르는 규칙은 **BTS 앱 도시 탭(8장 화면)과 같은 함수 1벌**(pickImminentCities, §16).

type RouteParams = {
  city?: string;
  cityId?: number;
  date?: string;
  dDay?: number;
  venue?: string;
};

export default function BTSWorldMapScreen() {
  const navigation = useNavigation<any>();
  const route =
    useRoute<RouteProp<{ BTSWorldMap: RouteParams }, "BTSWorldMap">>();

  // ⚠️ 수정금지(승인필요) — SVG 에셋 비동기 로딩 (번들 크기 축소)
  const [svgXml, setSvgXml] = useState<string | null>(null);
  useEffect(() => {
    loadBtsWorldMapSvg().then(setSvgXml);
  }, []);

  // ⚠️ 수정금지(승인필요) — 줌인할 도시 = 랜딩(아미봉)에서 넘어온 값. 없으면 아래에서 가장 임박한 공연으로 채운다.
  const [concert, setConcert] = useState({
    city: route.params?.city || "",
    date: route.params?.date || "",
    dDay: route.params?.dDay ?? 0,
    venue: route.params?.venue || "",
  });

  // 🌍 피켓에 찍을 도시 = **BTS 앱 도시 탭과 같은 임박 5개**(pickImminentCities 1벌).
  const [btsCities, setBtsCities] = useState<BTSCity[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`${getApiUrl()}/api/bts/cities`)
      .then((r) => r.json())
      .then((list: BTSCity[]) => {
        if (!alive || !Array.isArray(list) || list.length === 0) return;
        setBtsCities(pickImminentCities(list));
        // 랜딩(아미봉)에서 도시를 못 받았을 때만 = 가장 임박한 공연 도시로 잡는다.
        setConcert((prev) =>
          prev.date
            ? prev
            : {
                city: (list[0].nameEn || "").toUpperCase(),
                date: list[0].nextConcertDate || "",
                dDay: list[0].dDay ?? 0,
                venue: "",
              },
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const targetCity = concert.city;
  const concertDate = concert.date;
  const dDay = concert.dDay;
  const venue = concert.venue;

  // 도시 좌표 → viewBox → 화면 좌표. 목록에서 이름으로 찾고, 아직 목록이 안 왔으면 지도 중앙(0,0).
  const matched = btsCities.find(
    (c) => (c.nameEn || "").toUpperCase() === targetCity.toUpperCase(),
  );
  const vb = geoToViewBox(matched?.latitude ?? 0, matched?.longitude ?? 0);
  const targetX = (vb.x / 99) * MAP_W;
  const targetY = (vb.y / 50) * MAP_H;

  // ⚠️ 수정금지(승인필요) 2026-07-30 = **줌인 좌표는 "줌이 시작되는 순간"의 값을 읽어야 한다.**
  //   아래 인트로 타이머는 마운트 시 1회만 도는데(그래야 화면에 갇히지 않음),
  //   그 시점엔 도시 목록이 아직 안 와서 좌표가 **(0,0) = 대서양 한복판**이었다.
  //   그래서 어느 도시를 골라도 엉뚱한 곳으로 줌인됐다(앱 화면 결함).
  //   이제 최신 좌표를 이 통에 담아 두고, 1초 뒤 줌이 시작될 때 그 값을 꺼내 쓴다.
  const targetRef = useRef({ x: targetX, y: targetY });
  useEffect(() => {
    targetRef.current = { x: targetX, y: targetY };
  }, [targetX, targetY]);

  // ⚠️ 수정금지(승인필요) — 애니메이션 값
  const mapScale = useSharedValue(1);
  const mapTx = useSharedValue(0);
  const mapTy = useSharedValue(0);
  const fadeOut = useSharedValue(0);
  const cardScale = useSharedValue(0); // 카드 팽창: 0=점, 1=풀카드
  const textOpacity1 = useSharedValue(0); // 도시명
  const textOpacity2 = useSharedValue(0); // 날짜
  const textOpacity3 = useSharedValue(0); // D-Day
  const textOpacity4 = useSharedValue(0); // 공연장

  useEffect(() => {
    // ⚠️ 수정금지(승인필요) = 인트로는 **도시 목록과 무관하게 항상 끝나고 다음 화면으로 넘어간다.**
    //   이 화면은 뒤로가기·스와이프가 없으므로(RootStackNavigator), 여기서 멈추면 앱을 강제종료해야 벗어난다.
    //   목록이 늦게 오거나 못 오더라도 넘어가는 것이 맞다 = 인트로는 연출일 뿐 필수 관문이 아니다.
    // ⚠️ 수정금지(승인필요) — 줌인 배율
    const S = 6;

    // ⚠️ 수정금지(승인필요) — 1초 후 줌인 시작 (1.5초, 원본 타이밍)
    const zoomTimer = setTimeout(() => {
      // 좌표는 **지금 이 순간**의 값을 읽는다(마운트 때 값은 목록이 없어 대서양이었다)
      const { x, y } = targetRef.current;
      const tx = SW / 2 - MAP_W / 2 - (x - MAP_W / 2) * S;
      const ty = SH / 2 - MAP_TOP - MAP_H / 2 - (y - MAP_H / 2) * S;
      mapScale.value = withTiming(S, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      });
      mapTx.value = withTiming(tx, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      });
      mapTy.value = withTiming(ty, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      });
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
    let innerTimer: ReturnType<typeof setTimeout> | undefined;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 3500);

    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(cardTimer);
      clearTimeout(navTimer);
      clearTimeout(innerTimer);
    };
    // 마운트 시 1회만 = 인트로 타이머가 도중에 다시 시작되지 않게 한다.
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
    const s = interpolate(
      cardScale.value,
      [0, 1],
      [0.1, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale: s }],
      opacity: interpolate(
        cardScale.value,
        [0, 0.3, 1],
        [0, 0.5, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeOut.value }));
  const t1 = useAnimatedStyle(() => ({ opacity: textOpacity1.value }));
  const t2 = useAnimatedStyle(() => ({ opacity: textOpacity2.value }));
  const t3 = useAnimatedStyle(() => ({ opacity: textOpacity3.value }));
  const t4 = useAnimatedStyle(() => ({ opacity: textOpacity4.value }));

  const dDayText = formatDDay(dDay);
  // ⚠️ 수정금지(승인필요) — 날짜 포맷: 2026.4.17 (전 인류 이해, 년월일 제외)
  const dateDisplay = concertDate
    ? (() => {
        const d = new Date(concertDate);
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
      })()
    : "";

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = 웹 지구본 = **cobe**(BTSGlobeIntroWeb).
  //   옛 three.js iframe(srcDoc 약 300줄) 완전삭제 §19 = 돌지도 줌인도 안 되고 도시가 글자로 박혀 있었다.
  //   넘어가는 시점은 위 인트로 타이머가 정한다(도시 목록과 무관하게 항상 끝난다).
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: "#070514" }}>
        <BTSGlobeIntroWeb cities={btsCities} targetCityEn={targetCity} />
      </View>
    );
  }

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
            <Animated.Text style={[styles.cardCity, t1]}>
              {targetCity}
            </Animated.Text>
            <Animated.View style={[styles.divider, t2]} />
            <Animated.Text style={[styles.cardDate, t2]}>
              {dateDisplay}
            </Animated.Text>
            <Animated.Text style={[styles.cardDDay, t3]}>
              {dDayText}
            </Animated.Text>
            {venue ? (
              <Animated.Text style={[styles.cardVenue, t4]}>
                {venue}
              </Animated.Text>
            ) : null}
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
    boxShadow:
      "0 12px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(108, 45, 199, 0.3)" as any,
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
