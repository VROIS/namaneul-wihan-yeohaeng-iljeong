// 위기 경보 깜박이 배너 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import { Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { CrisisAlert } from "@/types/trip";
import { useTranslation } from "react-i18next";

// 🚨 위기 경보 깜박이는 배너 컴포넌트
export default function CrisisAlertBanner({
  alerts,
  onPress,
}: {
  alerts: CrisisAlert[];
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const highSeverity = alerts.some((a) => a.severity >= 7);
  const bgColor = highSeverity ? "#DC2626" : "#F59E0B";

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          crisisStyles.banner,
          { backgroundColor: bgColor, opacity: pulseAnim },
        ]}
      >
        <Icon name="alert-triangle" size={18} color="#FFFFFF" />
        <Text style={crisisStyles.bannerText}>
          {highSeverity ? t("trip.crisisAlert") : t("trip.crisisInfo")}{" "}
          {t("trip.crisisCount", { count: alerts.length })}
        </Text>
        <Icon name="chevron-right" size={18} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}

const crisisStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    gap: 8,
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bold,
    flex: 1,
    textAlign: "center",
  },
});
