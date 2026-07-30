import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Easing,
  Platform,
  useColorScheme,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand } from "@/constants/theme";

export default function ShinyPillBanner() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#1A1A1A";

  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // ♾️ 1회에 멈추지 않고 멈춤 없이 100% 무한 지속 반복되는 빛줄기 시퀀스
  useEffect(() => {
    let active = true;

    const runInfiniteShimmer = () => {
      if (!active) return;
      shimmerAnim.setValue(0);
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (active && finished) {
          runInfiniteShimmer();
        }
      });
    };

    runInfiniteShimmer();

    return () => {
      active = false;
    };
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 240],
  });

  return (
    <View style={styles.bannerWrap}>
      {/* 🌟 검은 배경 상자 없이 순수 텍스트 & 로고 위로 지나는 무한 샤이니 빛줄기 */}
      <View style={styles.textContainer}>
        {/* Shimmer Light Beam Sweeping Across Text */}
        <Animated.View
          style={[
            styles.shimmerBeam,
            { transform: [{ translateX }, { skewX: "-25deg" }] },
          ]}
        >
          <LinearGradient
            colors={[
              "transparent",
              "rgba(147, 51, 234, 0.25)",
              "rgba(255, 255, 255, 0.95)",
              "rgba(192, 132, 252, 0.4)",
              "transparent",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Text & Logo Content Row */}
        <View style={styles.contentRow}>
          <Text style={[styles.textLeading, { color: textColor }]}>
            지금 핫한
          </Text>

          <View style={styles.logoRow}>
            <Image
              source={require("../../assets/images/tripis-mark.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>TRIPIS</Text>
          </View>

          <Text style={[styles.textTrailing, { color: textColor }]}>여정</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  textContainer: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "transparent", // ⚠️ 검은 배경 제거 (배경 없이 톤앤매너 100% 동기화)
    overflow: "hidden",
    borderRadius: 20,
  },
  shimmerBeam: {
    position: "absolute",
    top: -10,
    bottom: -10,
    width: 75,
    zIndex: 2,
    pointerEvents: "none",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    zIndex: 5,
  },
  textLeading: {
    fontSize: 18,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 1,
  },
  logoImage: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  logoText: {
    fontSize: 21,
    fontFamily: "Pretendard-Bold",
    fontWeight: "900",
    color: Brand.primary,
    letterSpacing: -0.8,
    lineHeight: 25,
  },
  textTrailing: {
    fontSize: 18,
    fontFamily: "Pretendard-Bold",
    fontWeight: "800",
    letterSpacing: -0.4,
  },
});
