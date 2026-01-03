import React, { useState } from "react";
import { View, FlatList, StyleSheet, TextInput, Pressable, Text, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Brand, Typography, Shadows, getVibeScoreGradient } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.4;

const VIBE_CATEGORIES = [
  { id: "all", label: "전체", icon: "grid" },
  { id: "dreamy", label: "몽환적인", icon: "cloud" },
  { id: "hip", label: "힙한", icon: "zap" },
  { id: "classic", label: "클래식", icon: "award" },
  { id: "romantic", label: "로맨틱", icon: "heart" },
  { id: "adventure", label: "모험적인", icon: "compass" },
];

const SAMPLE_DESTINATIONS = [
  { id: 1, name: "도쿄", country: "일본", image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf", score: 8.7, tags: ["힙한", "맛집"] },
  { id: 2, name: "파리", country: "프랑스", image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34", score: 9.2, tags: ["로맨틱", "클래식"] },
  { id: 3, name: "바르셀로나", country: "스페인", image: "https://images.unsplash.com/photo-1583422409516-2895a77efded", score: 8.4, tags: ["모험적인", "맛집"] },
  { id: 4, name: "뉴욕", country: "미국", image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9", score: 8.9, tags: ["힙한", "럭셔리"] },
  { id: 5, name: "교토", country: "일본", image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e", score: 9.1, tags: ["클래식", "평화로운"] },
  { id: 6, name: "런던", country: "영국", image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad", score: 8.5, tags: ["클래식", "힙한"] },
];

interface DestinationCardProps {
  destination: typeof SAMPLE_DESTINATIONS[0];
  onPress: () => void;
}

function DestinationCard({ destination, onPress }: DestinationCardProps) {
  const { theme } = useTheme();
  const vibeGradient = getVibeScoreGradient(destination.score);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <Image
        source={{ uri: destination.image }}
        style={styles.cardImage}
        contentFit="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.7)"]}
        style={styles.cardGradient}
      />
      
      <LinearGradient
        colors={vibeGradient as [string, string]}
        style={styles.vibeScore}
      >
        <Text style={styles.vibeScoreText}>{destination.score.toFixed(1)}</Text>
      </LinearGradient>

      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{destination.name}</Text>
        <Text style={styles.cardSubtitle}>{destination.country}</Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedVibe, setSelectedVibe] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: cities } = useQuery({
    queryKey: ["/api/cities"],
  });

  const filteredDestinations = SAMPLE_DESTINATIONS.filter(dest => {
    if (selectedVibe === "all") return true;
    const vibeMap: Record<string, string[]> = {
      dreamy: ["몽환적인"],
      hip: ["힙한"],
      classic: ["클래식"],
      romantic: ["로맨틱"],
      adventure: ["모험적인"],
    };
    return dest.tags.some(tag => vibeMap[selectedVibe]?.includes(tag));
  });

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={[styles.searchContainer, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="search" size={20} color={theme.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="어디로 떠나볼까요?"
          placeholderTextColor={theme.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <Pressable style={[styles.filterButton, { backgroundColor: `${Brand.primary}15` }]}>
          <Feather name="sliders" size={18} color={Brand.primary} />
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={VIBE_CATEGORIES}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.vibeChipsContainer}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedVibe(item.id)}
            style={[
              styles.vibeChip,
              { backgroundColor: selectedVibe === item.id ? Brand.primary : theme.backgroundDefault },
            ]}
          >
            <Feather
              name={item.icon as any}
              size={16}
              color={selectedVibe === item.id ? "#FFFFFF" : theme.textSecondary}
            />
            <Text
              style={[
                styles.vibeChipText,
                { color: selectedVibe === item.id ? "#FFFFFF" : theme.textSecondary },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      <ThemedText style={styles.sectionTitle}>인기 여행지</ThemedText>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl + 60,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      ListHeaderComponent={renderHeader}
      data={filteredDestinations}
      numColumns={2}
      columnWrapperStyle={styles.row}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <DestinationCard
          destination={item}
          onPress={() => navigation.navigate("DestinationDetail", { placeId: item.id })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    marginBottom: Spacing.lg,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    ...Typography.body,
  },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  vibeChipsContainer: {
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  vibeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
  },
  vibeChipText: {
    ...Typography.label,
  },
  sectionTitle: {
    ...Typography.h2,
    marginBottom: Spacing.md,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    ...Shadows.card,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  vibeScore: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  vibeScoreText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  cardContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
  },
  cardTitle: {
    ...Typography.h3,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  cardSubtitle: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.8)",
  },
});
