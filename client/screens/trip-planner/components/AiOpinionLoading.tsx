// AI 의견 로딩(부정형 흐름 바 + 단계 문구) = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Brand, Colors, Spacing, Fonts } from "@/constants/theme";
import { useTranslation } from "react-i18next";

// 🧠 2026-07-04 사장님 SSOT = AI 의견(5크레딧 유료호출) 오버레이 로딩 UX.
//   Gemini 그라운딩 호출 = 스트리밍 아님(8~9초 뒤 JSON 한 방) = 진짜 진행률 물리적으로 없음.
//   → 퍼센트 막대바(가짜 숫자=역효과) 대신, 부정형(indeterminate) 흐름 바 + 시간 기반 정직한 단계 문구.
//   단계 문구 = 실제 파이프라인에 매칭(살펴봄→그라운딩→검토→정리). 마지막 단계는 응답 늦어도 계속 유지.
//   크레딧(5) 언급 = 로딩 중엔 없음(사장님 SSOT), 결과 하단에만 조용히.
export default function AiOpinionLoading({
  theme,
}: {
  theme: (typeof Colors)["light"];
}) {
  const { t } = useTranslation();
  // 흐름 바 = 좌→우 반복 이동(멈춤 아님 신호). 기존 CrisisAlertBanner의 Animated.loop 패턴 재사용(§16).
  const flowAnim = React.useRef(new Animated.Value(0)).current;
  // 트랙 폭 실측(onLayout) = translateX를 퍼센트 아닌 숫자 px로 이동(useNativeDriver 안정, RN 부정형 바 표준).
  const [trackW, setTrackW] = React.useState(0);
  // 단계 인덱스 = 2.5초 간격 전진, 마지막 단계에서 멈춤(응답이 늦어도 어색하지 않게).
  const [step, setStep] = React.useState(0);
  const STEP_KEYS = [
    "aiOpinion.loadingStep1",
    "aiOpinion.loadingStep2",
    "aiOpinion.loadingStep3",
    "aiOpinion.loadingStep4",
  ];

  React.useEffect(() => {
    const flow = Animated.loop(
      Animated.timing(flowAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    flow.start();
    return () => flow.stop();
  }, [flowAnim]);

  React.useEffect(() => {
    // 마지막 단계(3)에 도달하면 더 전진 안 함 = 그 문구에 머무름.
    const timer = setInterval(() => {
      setStep((prev) => (prev < STEP_KEYS.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  // 흐름 바(폭=트랙40%) = 왼쪽 밖(-barW px)에서 오른쪽 밖(trackW px)까지 왕복 = 부정형 로딩.
  const barW = trackW * 0.4;
  const translateX = flowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-barW, trackW],
  });

  return (
    <View style={aiLoadingStyles.container}>
      <View
        style={[aiLoadingStyles.track, { backgroundColor: theme.border }]}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            aiLoadingStyles.bar,
            {
              backgroundColor: Brand.primary,
              width: barW,
              // 트랙폭 측정(onLayout) 전 첫 프레임 = trackW 0 = 바를 숨김(왼쪽 정지처럼 보이는 것 방지, 멈춤신호 X).
              opacity: trackW === 0 ? 0 : 1,
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
      <Text style={[aiLoadingStyles.stepText, { color: theme.text }]}>
        {t(STEP_KEYS[step])}
      </Text>
      <Text style={[aiLoadingStyles.hintText, { color: theme.textTertiary }]}>
        {t("aiOpinion.loadingHint")}
      </Text>
    </View>
  );
}

const aiLoadingStyles = StyleSheet.create({
  container: {
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  track: {
    width: "70%",
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: Spacing.xl,
  },
  bar: {
    // 폭 = 코드의 barW(=trackW*0.4) 인라인 지정으로 일원화(SSOT 이중정의 방지).
    height: "100%",
    borderRadius: 2,
  },
  stepText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    textAlign: "center",
  },
  hintText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});
