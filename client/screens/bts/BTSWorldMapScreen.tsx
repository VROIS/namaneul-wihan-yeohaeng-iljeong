// ⚠️ 수정금지(승인필요) — BTS 지구본 인트로 = **연출 화면**(누르는 화면 아님)
// 데이터: /api/bts/cities (임박 5개 도시의 이름·좌표·D-Day) + 랜딩에서 넘어온 줌인 대상 도시
//
// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = 이 화면은 **인트로 연출**이다(아미봉 인증창과 같은 성격).
//   · 사용자가 누르는 화면이 아니다 = 3초 남짓 지나가므로 클릭을 받을 수 없다.
//   · 하는 일 = 공연할 도시를 **정확히 보여주는 것**뿐. 아미봉 인증화면(랜딩)에 나온 그 도시로
//     지구본을 반 바퀴 돌려 정면에 세우고, 피켓을 키우며 멈춘다.
//   · 도시 목록·좌표는 DB 에서 온다(GET /api/bts/cities). 손으로 적어둔 좌표표 완전삭제 §19.
//   · 5개를 고르는 규칙은 **BTS 앱 도시 탭(8장 화면)과 같은 함수 1벌**(pickImminentCities, §16).
//   · 그림·움직임은 **웹·앱 공통 1벌**(BTSGlobeIntro → bts-globe-html.ts).
//     옛 SVG 평면지도 + 글래스 알림판 카드 = 앱에서만 뜨던 2벌째 = 완전삭제 §19.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { getApiUrl } from "@/lib/query-client";
// 임박 5개 규칙·도시 타입 = 8장 화면과 같은 1벌(§16)
import { pickImminentCities, type BTSCity } from "@/contexts/BTSContext";
// 지구본 = 웹·앱 공통 1벌
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

  // 🌍 지구본에 찍을 도시 = **BTS 앱 도시 탭과 같은 임박 5개**(pickImminentCities 1벌).
  const [btsCities, setBtsCities] = useState<BTSCity[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`${getApiUrl()}/api/bts/cities`)
      .then((r) => r.json())
      .then((list: BTSCity[]) => {
        if (!alive || !Array.isArray(list) || list.length === 0) return;
        setBtsCities(pickImminentCities(list));
        // 랜딩(아미봉)에서 도시를 못 받았을 때만 = 가장 임박한 공연 도시로 잡는다.
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
    //   이 화면은 뒤로가기·스와이프가 없으므로(RootStackNavigator), 여기서 멈추면 앱을 강제종료해야 벗어난다.
    //   목록이 늦게 오거나 못 오더라도 넘어가는 것이 맞다 = 인트로는 연출일 뿐 필수 관문이 아니다.
    //   ⚠️ 총 3.5초 = 지구본이 반 바퀴 돌고(1.7초) 줌인까지(1.4초) 끝나는 시간보다 길어야 한다.
    let innerTimer: ReturnType<typeof setTimeout> | undefined;
    const navTimer = setTimeout(() => {
      fadeOut.value = withTiming(1, { duration: 400 });
      innerTimer = setTimeout(() => navigation.replace("BTSMiniApp"), 500);
    }, 3500);

    return () => {
      clearTimeout(navTimer);
      clearTimeout(innerTimer);
    };
    // 마운트 시 1회만 = 인트로 타이머가 도중에 다시 시작되지 않게 한다.
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
//   사유: 옛 SVG 평면지도(흰 바탕)가 사라지고 지구본(어두운 우주)이 그 자리에 오므로,
//   흰 배경·검은 글자를 그대로 두면 지구본 위아래로 흰 띠가 남는다. 글자 크기·굵기·자간은 원본 유지.
const styles = StyleSheet.create({
  container: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#070514" },
  // ⚠️ 수정금지(승인필요) 2026-07-30 = 제목을 **위로 올렸다**(실측 후 조정).
  //   사유: 피켓이 화면 위쪽(약 y=290)에 서는데 제목이 y=90 에 있어 **글자끼리 겹쳐 보였다**.
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
