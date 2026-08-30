// ⚠️ 수정금지(승인필요) — BTS 지구본 인트로 = **연출 화면**(누르는 화면 아님)
// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 이 화면은 **인트로 연출**이다(아미봉 인증창과 같은 성격).
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import { pickImminentCities, type BTSCity } from "@/contexts/BTSContext";
import BTSGlobeIntro from "./BTSGlobeIntro";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";

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

  // ⚠️ 수정금지(승인필요) — 줌인할 도시 = 랜딩(아미봉)에서 넘어온 값. 없으면 아래에서 가장 임박한 공연으로 채운다.
  const [targetCity, setTargetCity] = useState(route.params?.city || "");

  const [btsCities, setBtsCities] = useState<BTSCity[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`${getApiUrl()}/api/bts/cities`)
      .then((r) => r.json())
      .then((list: BTSCity[]) => {
        if (!alive || !Array.isArray(list) || list.length === 0) return;
        setBtsCities(pickImminentCities(list));
        setTargetCity((prev) => prev || (list[0].nameEn || "").toUpperCase());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const fadeOut = useSharedValue(0);

  useEffect(() => {
    // ⚠️ 수정금지(승인필요) = 인트로는 **도시 목록과 무관하게 항상 끝나고 다음 화면으로 넘어간다.**
    let innerTimer: ReturnType<typeof setTimeout> | undefined;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 3500);

    return () => {
      clearTimeout(navTimer);
      clearTimeout(innerTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - fadeOut.value }));

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

      <BTSGlobeIntro cities={btsCities} targetCityEn={targetCity} />
    </Animated.View>
  );
}

// ⚠️ 수정금지(승인필요) 2026-07-30 = 배경·글자색이 **흰 배경 → 어두운 BTS 톤**으로 바뀌었다.
const styles = StyleSheet.create({
  container: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#070514" },
  // ⚠️ 수정금지(승인필요) 2026-07-30 = 제목을 **위로 올렸다**(실측 후 조정).
  hero: {
    position: "absolute",
    top: 44,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  tourLabel: {
    fontSize: 12,
    fontFamily: "Pretendard-Bold",
    letterSpacing: 8,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  titleBTS: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    color: "#FFFFFF",
  },
  titleArirang: {
    fontSize: 44,
    fontFamily: "Pretendard-Bold",
    fontStyle: "italic",
    color: "#C084FC",
  },
});
