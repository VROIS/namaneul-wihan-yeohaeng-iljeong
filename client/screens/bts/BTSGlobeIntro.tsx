// ⚠️ 수정금지(승인필요) 2026-07-30 사장님 지시 = **지구본 인트로 = 웹·앱 1벌.**
//   사장님 SSOT = "앱 버전 최우선". 옛것(웹만 cobe 지구본 / 앱은 SVG 평면지도 = 2벌 공존)은
//   같은 앱인데 기기마다 다른 화면이 나오는 원인이었다 = 삭제 §19.
//
//   그림·움직임의 정본 = bts-globe-html.ts 한 곳. 이 파일은 **그것을 화면에 얹는 일만** 한다.
//     · 웹  = iframe (srcDoc)
//     · 앱  = react-native-webview  (= 이 앱이 지도·장소검색에 이미 쓰는 방식 §16)
//
//   이 화면이 하는 일 = 인트로(누르는 화면 아님):
//   아미봉 인증화면에 나온 그 도시로 지구본을 반 바퀴 돌려 정면에 세우고, 피켓을 키우며 멈춘다.
import React, { useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import { formatDDay, type BTSCity } from "@/contexts/BTSContext";
import { buildGlobeHtml } from "./bts-globe-html";

// ⚠️ 수정금지(승인필요) = 인트로 연출값(사장님 확정 2026-07-30).
//   ⚠️ 피켓 배율은 지구본 배율이 **곱해지므로** HTML 안에서 역수로 상쇄한다.
//     (안 하면 아이폰12 에서 피켓이 화면의 2.8배로 터져 잘렸다 = 실측 사고)
const ROTATE_MS = 1700; // 반 바퀴 도는 시간 = 어느 기기에서도 동일(시간 기준)
const GLOBE_ZOOM = 2.6; // 도착 후 지구본 확대 배율
const PICKET_ZOOM = 1.25; // 피켓 확대 배율(= 눈에 보이는 그대로)

const BG = "#070514";

type Props = {
  cities: BTSCity[]; // 임박 5개(pickImminentCities 결과)
  targetCityEn: string; // 랜딩(아미봉)에서 넘어온 줌인 대상 도시
};

export default function BTSGlobeIntro({ cities, targetCityEn }: Props) {
  // ⚠️ 줌인 대상 판단 = **여기 1벌만**. 지구본 점과 피켓이 항상 같은 도시를 가리키게 한다.
  const target = useMemo(
    () =>
      cities.find(
        (c) => (c.nameEn || "").toUpperCase() === targetCityEn.toUpperCase(),
      ) || cities[0],
    [cities, targetCityEn],
  );

  // ⚠️ 수정금지(승인필요) 2026-07-30 = **한 번 만든 화면은 다시 만들지 않는다.**
  //   이유: 대상 도시는 목록이 도착하면 한 번 더 바뀐다. 그때마다 HTML 을 새로 만들면
  //   **지구본이 통째로 다시 켜져 회전이 처음부터 다시 시작**된다(인트로가 3.5초뿐이라 줌인을 못 봄).
  //   그래서 **처음 정해진 도시로 만든 것을 끝까지 쓴다**(인트로는 3초 남짓 지나가는 연출이다).
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

  // WebView 에 넘기는 통도 고정한다. 매번 새 통을 주면 그것만으로 화면을 다시 읽어들인다.
  const source = useMemo(() => (html ? { html } : null), [html]);

  // 도시 목록이 아직 안 왔으면 배경만(도착하면 다시 그려진다)
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
        // 인트로 연출 = 사용자가 만지는 화면이 아니다(3초 남짓 지나간다)
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={["*"]}
        // WebGL·투명배경 = 지구본이 그려지려면 필요
        javaScriptEnabled
        domStorageEnabled={false}
        androidLayerType="hardware"
        allowsInlineMediaPlayback
        // 흰 화면 깜빡임 방지
        containerStyle={{ backgroundColor: BG }}
      />
    </View>
  );
}
