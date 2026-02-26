import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
  useColorScheme,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";

import {
  Spacing,
  BorderRadius,
  Fonts,
  Colors,
  Shadows,
} from "@/constants/theme";
import Icon from "@/components/Icon";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

// ─── BTS 테마 컬러 ─────────────────────────────────────────
const BTS = {
  purple: "#8B5CF6",
  purpleDark: "#6D28D9",
  purpleLight: "#A78BFA",
  purpleGlow: "rgba(139, 92, 246, 0.35)",
  bg: "#0F0F14",
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.1)",
  selectedBorder: "#8B5CF6",
  textPrimary: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
};

// ─── 멤버 아키타입 데이터 ──────────────────────────────────
const ARCHETYPES = [
  { id: "rm", name: "RM", title: "문화 수집가", icon: "🎨", emoji: "palette", tags: ["#문화", "#힐링"], pace: "Normal", desc: "RM처럼 여행하기: 미술관, 서점, 고즈넉한 자연 공원 탐방!" },
  { id: "v", name: "V", title: "낭만주의자", icon: "💜", emoji: "heart", tags: ["#로맨틱", "#예술"], pace: "Relaxed", desc: "뷔처럼 여행하기: 골목길 산책, 재즈 바, 감성 넘치는 카페!" },
  { id: "jhope", name: "j-hope", title: "미학적 탐험가", icon: "✨", emoji: "sparkles", tags: ["#핫스팟", "#로컬"], pace: "Packed", desc: "제이홉처럼 여행하기: 트렌디한 팝업, 스트리트 아트, 브런치!" },
  { id: "jk", name: "정국", title: "아드레날린 미식가", icon: "⚡", emoji: "zap", tags: ["#모험", "#미식"], pace: "Packed", desc: "정국처럼 여행하기: 번지점프, 히든 맛집, 하루 8곳 풀코스!" },
  { id: "jimin", name: "지민", title: "배려형 동행자", icon: "🤝", emoji: "users", tags: ["#동행", "#감성"], pace: "Normal", desc: "지민처럼 여행하기: 일행과 교감할 수 있는 아늑한 장소 중심!" },
  { id: "jin", name: "진", title: "럭셔리 휴식가", icon: "👑", emoji: "crown", tags: ["#프리미엄", "#휴식"], pace: "Relaxed", desc: "진처럼 여행하기: 최고급 식사, 편안한 이동, 하루 3곳만!" },
  { id: "suga", name: "슈가", title: "궁극의 힐러", icon: "😴", emoji: "moon", tags: ["#미니멀", "#칠"], pace: "Ultra-Relaxed", desc: "슈가처럼 여행하기: 카페에서 창밖 구경, 온전한 나만의 시간!" },
];

// ─── 샘플 장소 카드 데이터 (34개 콘서트 도시 raw data 기반) ──
const SAMPLE_SPOTS = [
  { id: 1, name: "LA Arts District", category: "🎨 아트 스팟", rating: 4.7, distance: "1.2km from SoFi Stadium", image: "https://images.unsplash.com/photo-1534190239940-9ba8944ea261?w=600&h=800&fit=crop" },
  { id: 2, name: "Grand Central Market", category: "🍽️ 맛집", rating: 4.8, distance: "3.5km from SoFi Stadium", image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=800&fit=crop" },
  { id: 3, name: "Griffith Observatory", category: "📸 명소", rating: 4.9, distance: "18km from SoFi Stadium", image: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&h=800&fit=crop" },
  { id: 4, name: "Santa Monica Pier", category: "🎡 액티비티", rating: 4.5, distance: "12km from SoFi Stadium", image: "https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=600&h=800&fit=crop" },
  { id: 5, name: "The Getty Center", category: "🏛️ 문화", rating: 4.8, distance: "15km from SoFi Stadium", image: "https://images.unsplash.com/photo-1580537659466-0a9bfa916a54?w=600&h=800&fit=crop" },
];

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

export default function BTSConcertPlannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ─── State ───────────────────────────────────────────────
  const [selectedArchetype, setSelectedArchetype] = useState(ARCHETYPES[3]); // 정국 default
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cart, setCart] = useState<number[]>([]);
  const maxSlots = selectedArchetype.pace === "Packed" ? 5 : selectedArchetype.pace === "Normal" ? 4 : 3;

  // ─── Swipe Animation ────────────────────────────────────
  const pan = useRef(new Animated.ValueXY()).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  const resetCard = useCallback(() => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
  }, [pan]);

  const swipeCard = useCallback((direction: "left" | "right") => {
    const toX = direction === "right" ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;
    Animated.parallel([
      Animated.timing(pan, { toValue: { x: toX, y: 0 }, duration: 300, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      if (direction === "right" && currentCardIndex < SAMPLE_SPOTS.length) {
        setCart((prev) => [...prev, SAMPLE_SPOTS[currentCardIndex].id]);
      }
      pan.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      setCurrentCardIndex((prev) => prev + 1);
    });
  }, [pan, cardOpacity, currentCardIndex]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeCard("right");
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeCard("left");
        } else {
          resetCard();
        }
      },
    })
  ).current;

  const rotateCard = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ["-8deg", "0deg", "8deg"],
    extrapolate: "clamp",
  });

  const addOpacity = pan.x.interpolate({
    inputRange: [0, SCREEN_WIDTH / 4],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const passOpacity = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 4, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const gaugePercent = Math.min(cart.length / maxSlots, 1);
  const isCartFull = cart.length >= maxSlots;
  const currentSpot = SAMPLE_SPOTS[currentCardIndex];
  const allSwiped = currentCardIndex >= SAMPLE_SPOTS.length;

  // ─── Render ──────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={22} color={BTS.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>나만의 방탄 투어</Text>
          <Text style={styles.headerSub}>My BTS Concert Tour</Text>
        </View>
        <Text style={styles.cityBadge}>🏟️ LA</Text>
      </View>

      {/* ─── Section 1: 아키타입 캐러셀 ─── */}
      <View style={styles.archetypeSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.archetypeScroll}>
          {ARCHETYPES.map((a) => {
            const isSelected = a.id === selectedArchetype.id;
            return (
              <Pressable
                key={a.id}
                style={[
                  styles.archetypeCard,
                  isSelected && styles.archetypeCardSelected,
                ]}
                onPress={() => { setSelectedArchetype(a); setCart([]); setCurrentCardIndex(0); }}
              >
                <Text style={styles.archetypeIcon}>{a.icon}</Text>
                <Text style={[styles.archetypeName, isSelected && { color: BTS.purple }]}>{a.name}</Text>
                <Text style={styles.archetypeTitle}>{a.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* 선택된 아키타입 설명 */}
        <View style={styles.archetypeDescRow}>
          <Text style={styles.archetypeDesc}>{selectedArchetype.desc}</Text>
          <View style={styles.tagRow}>
            {selectedArchetype.tags.map((t) => (
              <View key={t} style={styles.tagChip}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
            <View style={[styles.tagChip, { backgroundColor: "rgba(139,92,246,0.15)" }]}>
              <Text style={[styles.tagText, { color: BTS.purpleLight }]}>{selectedArchetype.pace}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── Section 2: 스와이프 카드 ─── */}
      <View style={styles.swipeArea}>
        {allSwiped || isCartFull ? (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 48 }}>{isCartFull ? "🎉" : "✅"}</Text>
            <Text style={styles.emptyTitle}>
              {isCartFull ? "장바구니가 꽉 찼어요!" : "모든 장소를 확인했어요!"}
            </Text>
            <Text style={styles.emptyDesc}>
              {isCartFull
                ? "이제 AI 동선 최적화를 시작할 수 있어요"
                : `${cart.length}개의 장소를 담았습니다`}
            </Text>
          </View>
        ) : currentSpot ? (
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.swipeCard,
              {
                transform: [{ translateX: pan.x }, { rotate: rotateCard }],
                opacity: cardOpacity,
              },
            ]}
          >
            {/* 배경 이미지 */}
            <Image source={{ uri: currentSpot.image }} style={styles.cardImage} />

            {/* 스와이프 힌트 오버레이 */}
            <Animated.View style={[styles.swipeLabel, styles.swipeLabelRight, { opacity: addOpacity }]}>
              <Text style={styles.swipeLabelText}>ADD! 💜</Text>
            </Animated.View>
            <Animated.View style={[styles.swipeLabel, styles.swipeLabelLeft, { opacity: passOpacity }]}>
              <Text style={[styles.swipeLabelText, { color: "#EF4444", borderColor: "#EF4444" }]}>PASS ✋</Text>
            </Animated.View>

            {/* 하단 그라데이션 정보 */}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.85)"]}
              style={styles.cardGradient}
            >
              <Text style={styles.cardName}>{currentSpot.name}</Text>
              <View style={styles.cardMeta}>
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{currentSpot.category}</Text>
                </View>
                <Text style={styles.cardRating}>⭐ {currentSpot.rating}</Text>
              </View>
              <Text style={styles.cardDistance}>{currentSpot.distance}</Text>
            </LinearGradient>

            {/* 카드 카운터 */}
            <View style={styles.cardCounter}>
              <Text style={styles.cardCounterText}>
                {currentCardIndex + 1}/{SAMPLE_SPOTS.length}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* 스와이프 버튼 (보조) */}
        {!allSwiped && !isCartFull && currentSpot && (
          <View style={styles.swipeButtons}>
            <Pressable style={styles.swipeBtnPass} onPress={() => swipeCard("left")}>
              <Icon name="x" size={28} color="#EF4444" />
            </Pressable>
            <Pressable style={styles.swipeBtnAdd} onPress={() => swipeCard("right")}>
              <Icon name="heart" size={28} color={BTS.purple} />
            </Pressable>
          </View>
        )}
      </View>

      {/* ─── Section 3: 아미밤 게이지 (하단 고정) ─── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {/* 아미밤 게이지 */}
        <View style={styles.gaugeContainer}>
          <View style={styles.gaugeBg}>
            <Animated.View
              style={[
                styles.gaugeFill,
                { width: `${gaugePercent * 100}%` as any },
              ]}
            />
          </View>
          <Text style={styles.gaugeLabel}>
            💜 {cart.length}/{maxSlots} 슬롯 채움
          </Text>
        </View>

        {/* CTA 버튼 */}
        <Pressable
          style={[
            styles.ctaButton,
            !isCartFull && styles.ctaButtonDisabled,
          ]}
          onPress={() => {
            if (isCartFull) {
              // TODO: 제미나이 최적화 API 호출
              alert("🧠 AI 동선 최적화를 시작합니다!\nPowered by Gemini");
            }
          }}
          disabled={!isCartFull}
        >
          <Text style={styles.ctaIcon}>🧠</Text>
          <Text style={[styles.ctaText, !isCartFull && { opacity: 0.5 }]}>
            {isCartFull ? "AI 동선 최적화" : "더 담아주세요"}
          </Text>
        </Pressable>

        <Text style={styles.poweredBy}>Powered by Gemini — 현실 검증 포함</Text>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BTS.bg,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.xs,
    backgroundColor: BTS.card,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: BTS.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: BTS.textMuted,
  },
  cityBadge: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: BTS.textPrimary,
    backgroundColor: BTS.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: BTS.cardBorder,
    overflow: "hidden",
  },

  // Archetype Carousel
  archetypeSection: {
    paddingTop: Spacing.sm,
  },
  archetypeScroll: {
    paddingHorizontal: Spacing.lg,
    gap: 10,
  },
  archetypeCard: {
    width: 80,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: BTS.card,
    borderWidth: 1.5,
    borderColor: BTS.cardBorder,
    gap: 4,
  },
  archetypeCardSelected: {
    borderColor: BTS.selectedBorder,
    backgroundColor: "rgba(139,92,246,0.12)",
    ...Shadows.card,
    shadowColor: BTS.purple,
  },
  archetypeIcon: {
    fontSize: 24,
  },
  archetypeName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: BTS.textPrimary,
  },
  archetypeTitle: {
    fontSize: 9,
    fontFamily: Fonts.medium,
    color: BTS.textSecondary,
  },
  archetypeDescRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: 6,
  },
  archetypeDesc: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: BTS.purpleLight,
  },
  tagRow: {
    flexDirection: "row",
    gap: 6,
  },
  tagChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  tagText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: BTS.textSecondary,
  },

  // Swipe Area
  swipeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  swipeCard: {
    width: SCREEN_WIDTH - 48,
    height: "100%",
    maxHeight: 420,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    backgroundColor: BTS.card,
    ...Shadows.elevated,
    shadowColor: BTS.purple,
  },
  cardImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    resizeMode: "cover",
  },
  cardGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 80,
  },
  cardName: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  categoryChip: {
    backgroundColor: "rgba(139,92,246,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  cardRating: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  cardDistance: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  cardCounter: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  cardCounterText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },

  // Swipe Labels
  swipeLabel: {
    position: "absolute",
    top: 40,
    zIndex: 10,
  },
  swipeLabelRight: {
    left: 20,
  },
  swipeLabelLeft: {
    right: 20,
  },
  swipeLabelText: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: BTS.purple,
    borderWidth: 3,
    borderColor: BTS.purple,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: "hidden",
  },

  // Swipe Buttons
  swipeButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    marginTop: 12,
  },
  swipeBtnPass: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  swipeBtnAdd: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(139,92,246,0.15)",
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty State
  emptyCard: {
    alignItems: "center",
    gap: 12,
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: BTS.textPrimary,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: BTS.textSecondary,
    textAlign: "center",
  },

  // Bottom Bar
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: BTS.cardBorder,
    backgroundColor: "rgba(15,15,20,0.95)",
    gap: 8,
  },
  gaugeContainer: {
    gap: 4,
  },
  gaugeBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: BTS.purple,
  },
  gaugeLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: BTS.textSecondary,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BTS.purple,
    paddingVertical: 14,
    borderRadius: BorderRadius.sm,
    gap: 8,
    ...Shadows.fab,
    shadowColor: BTS.purple,
  },
  ctaButtonDisabled: {
    backgroundColor: "rgba(139,92,246,0.2)",
  },
  ctaIcon: {
    fontSize: 20,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  poweredBy: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: BTS.textMuted,
    textAlign: "center",
  },
});
