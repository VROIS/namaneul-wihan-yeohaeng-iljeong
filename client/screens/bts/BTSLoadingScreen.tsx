/**
 * BTS 미니앱 - Scene 3: AI 일정 생성 로딩
 * 단계별 메시지 + 네온 링 애니메이션
 */

import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeInUp,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { BTSColors } from "@/constants/bts-theme";
import { useBTS } from "@/contexts/BTSContext";
import { getApiUrl } from "@/lib/query-client";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";

const LOADING_MESSAGES = [
  { text: "바이브 동기화 중...", emoji: "🎵" },
  { text: "경로 최적화 연산 중...", emoji: "🗺️" },
  { text: "현지 정보 스캔 완료!", emoji: "📡" },
  { text: "날씨·교통 체킹 완료", emoji: "☁️" },
  { text: "최종 동선 생성 완료 ✨", emoji: "🎉" },
];

export default function BTSLoadingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const {
    selectedCharacter,
    selectedCity,
    selectedPlaceIds,
    setItinerary,
    setIsGenerating,
    setError,
  } = useBTS();

  const [msgIndex, setMsgIndex] = useState(0);
  const baseUrl = getApiUrl();

  // 링 회전 애니메이션
  const rotation = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const msgOpacity = useSharedValue(1);

  useEffect(() => {
    // 회전
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
    // 펄스
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  // 메시지 순환
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => {
        if (prev < LOADING_MESSAGES.length - 1) return prev + 1;
        return prev;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  // API 호출
  useEffect(() => {
    if (!selectedCity || !selectedCharacter || selectedPlaceIds.length === 0) return;

    setIsGenerating(true);

    fetch(`${baseUrl}/api/bts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cityId: selectedCity.id,
        memberId: selectedCharacter.id,
        selectedPlaceIds,
      }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "생성 실패");
        return data;
      })
      .then((data) => {
        setItinerary(data);
        // 최소 3초 대기 후 결과 화면으로 (로딩 메시지 다 보여주기)
        setTimeout(() => {
          navigation.replace("BTSDashboard");
        }, Math.max(0, 3000));
      })
      .catch((e) => {
        setError(e?.message || "일정 생성에 실패했어요");
        navigation.goBack();
      })
      .finally(() => setIsGenerating(false));
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: ringScale.value },
    ],
  }));

  const currentMsg = LOADING_MESSAGES[msgIndex];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[BTSColors.deepViolet, BTSColors.spaceBlack]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
      />

      {/* 로딩 링 */}
      <Animated.View style={[styles.ringOuter, ringStyle]}>
        <LinearGradient
          colors={[BTSColors.neonPurple, "transparent", "transparent"]}
          style={styles.ringGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* 중앙 이모지 */}
      <Animated.View entering={FadeIn.delay(300)} style={styles.centerIcon}>
        <Text style={styles.centerEmoji}>{selectedCharacter?.emoji || "🎵"}</Text>
      </Animated.View>

      {/* 메시지 영역 */}
      <View style={styles.msgArea}>
        <Animated.Text
          key={msgIndex}
          entering={FadeInUp.duration(400)}
          style={styles.msgEmoji}
        >
          {currentMsg.emoji}
        </Animated.Text>
        <Animated.Text
          key={`t-${msgIndex}`}
          entering={FadeInUp.delay(100).duration(400)}
          style={styles.msgText}
        >
          {currentMsg.text}
        </Animated.Text>
      </View>

      {/* 도시 정보 */}
      <Animated.View entering={FadeIn.delay(600)} style={styles.infoArea}>
        <Text style={styles.infoText}>
          {selectedCity?.nameKo} · {selectedCharacter?.name} · {selectedPlaceIds.length}곳
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BTSColors.spaceBlack,
    justifyContent: "center",
    alignItems: "center",
  },

  // Ring
  ringOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.08)",
    borderTopColor: BTSColors.neonPurple,
    justifyContent: "center",
    alignItems: "center",
  },
  ringGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 75,
  },

  // Center
  centerIcon: {
    position: "absolute",
    top: "50%",
    marginTop: -85,
  },
  centerEmoji: {
    fontSize: 40,
  },

  // Message
  msgArea: {
    marginTop: 40,
    alignItems: "center",
    gap: 8,
  },
  msgEmoji: {
    fontSize: 28,
  },
  msgText: {
    fontSize: 18,
    fontWeight: "700",
    color: BTSColors.textPrimary,
    letterSpacing: 0.5,
  },

  // Info
  infoArea: {
    position: "absolute",
    bottom: 80,
  },
  infoText: {
    fontSize: 13,
    color: BTSColors.textMuted,
    fontWeight: "500",
  },
});
