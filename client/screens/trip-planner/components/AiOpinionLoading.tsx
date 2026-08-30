import React from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Brand, Colors, Spacing, Fonts } from "@/constants/theme";
import { useTranslation } from "react-i18next";

// 🧠 2026-07-04 사장님 SSOT = AI 의견(5크레딧 유료호출) 오버레이 로딩 UX.
export default function AiOpinionLoading({
  theme,
}: {
  theme: (typeof Colors)["light"];
}) {
  const { t } = useTranslation();
  const flowAnim = React.useRef(new Animated.Value(0)).current;
  const [trackW, setTrackW] = React.useState(0);
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
    const timer = setInterval(() => {
      setStep((prev) => (prev < STEP_KEYS.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(timer);
  }, []);

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
