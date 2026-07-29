import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Image, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand } from "@/constants/theme";

export default function ShinyPillBanner() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: true,
      }),
    ).start();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-160, 280],
  });

  return (
    <View style={styles.pillWrap}>
      {/* Pill Outer Border Glow & Glass Background */}
      <View style={styles.pillContainer}>
        {/* Shimmer Light Beam Sweeping Across the Pill */}
        <Animated.View
          style={[
            styles.shimmerBeam,
            { transform: [{ translateX }, { skewX: "-25deg" }] },
          ]}
        >
          <LinearGradient
            colors={[
              "transparent",
              "rgba(192, 132, 252, 0.15)",
              "rgba(255, 255, 255, 0.85)",
              "rgba(192, 132, 252, 0.3)",
              "transparent",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Content Row */}
        <View style={styles.contentRow}>
          {/* Glowing Pulse Dot */}
          <View style={styles.pulseDotOuter}>
            <View style={styles.pulseDotInner} />
          </View>

          <Text style={styles.pillTextLeading}>지금 핫한</Text>

          <View style={styles.logoRow}>
            <Image
              source={require("../../assets/images/tripis-mark.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>TRIPIS</Text>
          </View>

          <Text style={styles.pillTextTrailing}>여정</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  pillContainer: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 50,
    backgroundColor: "rgba(18, 12, 38, 0.92)",
    borderWidth: 1.2,
    borderColor: "rgba(168, 85, 247, 0.65)",
    overflow: "hidden",
    boxShadow:
      "0 4px 20px rgba(147, 51, 234, 0.35), 0 0 12px rgba(168, 85, 247, 0.25)" as any,
  },
  shimmerBeam: {
    position: "absolute",
    top: -10,
    bottom: -10,
    width: 90,
    zIndex: 2,
    pointerEvents: "none",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    zIndex: 5,
  },
  pulseDotOuter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#A855F7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 2,
    boxShadow: "0 0 8px #A855F7" as any,
  },
  pulseDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  pillTextLeading: {
    fontSize: 16,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 1,
  },
  logoImage: {
    width: 19,
    height: 19,
    borderRadius: 5,
  },
  logoText: {
    fontSize: 18,
    fontFamily: "Pretendard-Bold",
    fontWeight: "900",
    color: "#C084FC",
    letterSpacing: -0.5,
  },
  pillTextTrailing: {
    fontSize: 16,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
});
