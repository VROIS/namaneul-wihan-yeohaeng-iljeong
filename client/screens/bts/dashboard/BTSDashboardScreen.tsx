/**
 * BTS 미니앱 - Scene 4: 결과 대시보드
 * 릴스 스타일 미리보기 + 스마트 타임라인 카드 + 저장/공유
 * = 2026-07-16 §0 슬림화 분리(옛 587줄 단일파일 → bts/dashboard/ 폴더 완전분리, 순수 이동)
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
  ScrollView,
  Share,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { BTSColors } from "@/constants/bts-theme";
import { useBTS } from "@/contexts/BTSContext";
import type { BTSStackParamList } from "@/navigation/BTSStackNavigator";

import ReelCard from "./components/ReelCard";
import TimelineCard from "./components/TimelineCard";
import SummaryItem from "./components/SummaryItem";
import { styles, REEL_W } from "./styles";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Main Screen ───
export default function BTSDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<BTSStackParamList>>();
  const { itinerary, selectedCharacter, reset } = useBTS();
  const scrollX = useSharedValue(0);

  const day = itinerary?.days?.[0];
  const places = day?.places || [];

  const handleShare = useCallback(async () => {
    if (!itinerary) return;
    const placeList = places
      .map((p) => `  ${p.startTime} ${p.name}`)
      .join("\n");
    try {
      await Share.share({
        message: `🎵 ${itinerary.title}\n\n${placeList}\n\n#TRIPIS #BTS투어 #방탄투어`,
      });
    } catch {}
  }, [itinerary, places]);

  const handleRestart = useCallback(() => {
    reset();
    navigation.popToTop();
  }, [reset, navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[BTSColors.deepViolet, BTSColors.spaceBlack]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.3 }}
      />

      {/* 헤더 */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.headerWrap}>
        <BlurView intensity={40} tint="dark" style={styles.header}>
          <Pressable onPress={handleRestart} style={styles.backBtn}>
            <Text style={styles.backText}>✕</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {itinerary?.title || "나만의 방탄 투어"}
            </Text>
          </View>
          <Pressable onPress={handleShare} style={styles.shareBtn}>
            <Text style={styles.shareIcon}>↗</Text>
          </Pressable>
        </BlurView>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* 릴스 프리뷰 */}
        <Animated.View
          entering={FadeInUp.delay(200)}
          style={styles.reelsSection}
        >
          <Text style={styles.sectionTitle}>미리보기</Text>
          <Text style={styles.sectionSub}>스와이프해서 장소를 탐색하세요</Text>

          <Animated.FlatList
            data={places}
            keyExtractor={(_, i) => `reel-${i}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={REEL_W + 16}
            decelerationRate="fast"
            contentContainerStyle={{
              paddingHorizontal: (SCREEN_W - REEL_W) / 2,
            }}
            onScroll={(e) => {
              scrollX.value = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <View style={{ width: REEL_W, marginHorizontal: 8 }}>
                <ReelCard place={item} index={index} scrollX={scrollX} />
              </View>
            )}
          />
        </Animated.View>

        {/* 스마트 타임라인 */}
        <Animated.View
          entering={FadeInUp.delay(400)}
          style={styles.timelineSection}
        >
          <Text style={styles.sectionTitle}>스마트 타임라인</Text>
          <Text style={styles.sectionSub}>
            {day?.city} · {places.length}곳 · {selectedCharacter?.name} 바이브
          </Text>

          {places.map((place, i) => (
            <TimelineCard
              key={`tl-${i}`}
              place={place}
              index={i}
              isLast={i === places.length - 1}
            />
          ))}
        </Animated.View>

        {/* 요약 */}
        <Animated.View
          entering={FadeInUp.delay(600)}
          style={styles.summarySection}
        >
          <LinearGradient
            colors={[BTSColors.purpleGlowLight, "transparent"]}
            style={styles.summaryCard}
          >
            <Text style={styles.summaryTitle}>📊 여행 요약</Text>
            <View style={styles.summaryRow}>
              <SummaryItem label="장소" value={`${places.length}곳`} />
              <SummaryItem
                label="예상 시간"
                value={`${places.length * 1.5}시간`}
              />
              <SummaryItem
                label="예상 비용"
                value={`€${places.reduce((sum, p) => sum + parseFloat(p.priceEstimate?.replace("€", "") || "0"), 0).toFixed(0)}`}
              />
            </View>
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* 하단 액션 버튼 */}
      <View
        style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}
      >
        <Pressable onPress={handleRestart} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>처음부터 다시</Text>
        </Pressable>
        <Pressable onPress={handleShare} style={{ flex: 2 }}>
          <LinearGradient
            colors={[BTSColors.neonPurple, BTSColors.deepViolet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>🗺️ 이 일정 공유하기</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
