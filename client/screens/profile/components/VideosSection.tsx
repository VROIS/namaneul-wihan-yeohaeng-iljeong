// 🎬 나의 영상 섹션 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles } from "../styles";
import type { ProfileApi } from "../hooks/useProfile";

export default function VideosSection({ profile }: { profile: ProfileApi }) {
  const { theme, navigation, savedTrips } = profile;
  const videosReady = savedTrips.filter(
    (t) => t.videoStatus === "succeeded" && t.videoUrl,
  );
  if (videosReady.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>
        🎬 나의 영상 ({videosReady.length})
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tripsScroll}
      >
        {videosReady.map((trip) => (
          <Pressable
            key={trip.id}
            style={[
              styles.videoCard,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() =>
              navigation.navigate("SavedTripDetail", {
                itineraryId: trip.id,
              })
            }
          >
            <View style={styles.videoThumbnail}>
              <LinearGradient
                colors={["#6366f1", "#8b5cf6"]}
                style={styles.videoThumbnailGradient}
              >
                <Icon name="play-circle" size={32} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text
              style={[styles.videoCardTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {trip.title}
            </Text>
            <Text
              style={[styles.videoCardDate, { color: theme.textSecondary }]}
            >
              {trip.startDate?.split("T")[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
