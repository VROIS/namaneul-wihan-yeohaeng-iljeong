// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **지구본 인트로 = 웹·앱 1벌.**
import React, { useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import { formatDDay, type BTSCity } from "@/contexts/BTSContext";
import { buildGlobeHtml } from "./bts-globe-html";

// ⚠️ 수정금지(승인필요) = 인트로 연출값(사장님 확정 2026-07-30).
const ROTATE_MS = 1700; // 반 바퀴 도는 시간 = 어느 기기에서도 동일(시간 기준)
const GLOBE_ZOOM = 2.6; // 도착 후 지구본 확대 배율
const PICKET_ZOOM = 1.25; // 피켓 확대 배율(= 눈에 보이는 그대로)

const BG = "#070514";

type Props = {
  cities: BTSCity[]; // 임박 5개(pickImminentCities 결과)
  targetCityEn: string; // 랜딩(아미봉)에서 넘어온 줌인 대상 도시
};

export default function BTSGlobeIntro({ cities, targetCityEn }: Props) {
  const target = useMemo(
    () =>
      cities.find(
        (c) => (c.nameEn || "").toUpperCase() === targetCityEn.toUpperCase(),
      ) || cities[0],
    [cities, targetCityEn],
  );

  // ⚠️ 수정금지(승인필요) 2026-07-30 = **한 번 만든 화면은 다시 만들지 않는다.**
  const htmlRef = useRef<string | null>(null);
  if (!htmlRef.current && target) {
    htmlRef.current = buildGlobeHtml({
      target: {
        lat: target.latitude ?? 0,
        lng: target.longitude ?? 0,
        title: (target.nameEn || "").toUpperCase(),
        subtitle: formatDDay(target.dDay),
      },
      rotateMs: ROTATE_MS,
      globeZoom: GLOBE_ZOOM,
      picketZoom: PICKET_ZOOM,
    });
  }
  const html = htmlRef.current;

  const source = useMemo(() => (html ? { html } : null), [html]);

  if (!html || !source)
    return <View style={{ flex: 1, backgroundColor: BG }} />;

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* 웹 = iframe. RN Web 에서 iframe 은 기본 요소로 그대로 쓸 수 있다. */}
        {React.createElement("iframe", {
          srcDoc: html,
          style: {
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            background: BG,
          },
          scrolling: "no",
          title: "BTS globe intro",
        })}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <WebView
        source={source}
        style={{ flex: 1, backgroundColor: BG }}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        androidLayerType="hardware"
        allowsInlineMediaPlayback
        containerStyle={{ backgroundColor: BG }}
      />
    </View>
  );
}
