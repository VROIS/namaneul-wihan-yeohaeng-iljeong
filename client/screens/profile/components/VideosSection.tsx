// 나의 숏폼 영상 섹션 (아이폰 12 가득 채우는 입체 3D 숏폼 카드)
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles, getResponsiveFullVideoCardWidth } from "../styles";
import type { ProfileApi } from "../hooks/useProfile";

export default function VideosSection({ profile }: { profile: ProfileApi }) {
  const { theme, navigation, savedTrips } = profile;

  // 영상 개별 삭제 상태
  const [deletedVideoIds, setDeletedVideoIds] = useState<string[]>([]);

  // 아이폰 12 (390pt) 가득 채우는 3D 숏폼 카드 폭
  const fullVideoWidth = getResponsiveFullVideoCardWidth();

  // 샘플 숏폼 영상 목록 (로그아웃 또는 생성된 영상이 없는 경우에도 프리뷰 제공)
  const sampleVideos = [
    { id: "sample-1", title: "파리 Vlog#1", date: "2026.07.23" },
    { id: "sample-2", title: "마드리드 투어", date: "2026.07.23" },
    { id: "sample-3", title: "브뤼셀 힐링", date: "2026.07.22" },
  ];

  const videosReady = savedTrips
    .filter((t) => !deletedVideoIds.includes(String(t.id)))
    .filter((t) =>
      Object.values(t.videoByDay || {}).some((v) => v?.status === "succeeded"),
    );

  // 실제 데이터가 없을 경우 샘플 비디오 카드로 무조건 노출
  const displayVideos =
    videosReady.length > 0
      ? videosReady.map((t) => ({
          id: String(t.id),
          title: t.title,
          date: t.startDate?.split("T")[0] || "2026.07.23",
        }))
      : sampleVideos.filter((v) => !deletedVideoIds.includes(v.id));

  if (displayVideos.length === 0) return null;

  const gradientPalettes = [
    ["#4F46E5", "#7C3AED"],
    ["#06B6D4", "#3B82F6"],
    ["#EC4899", "#8B5CF6"],
  ];

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleHeader}>
        <View style={[styles.sectionIconBox, { backgroundColor: "rgba(139, 92, 246, 0.12)" }]}>
          <Icon name="film" size={18} color="#8B5CF6" />
        </View>
        <ThemedText style={styles.sectionTitle}>나의 영상</ThemedText>
        <Text style={[styles.sectionBadge, { color: "#8B5CF6", backgroundColor: "rgba(139, 92, 246, 0.12)" }]}>
          {displayVideos.length}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tripsScroll}
      >
        {displayVideos.map((video, idx) => (
          <Pressable
            key={video.id}
            style={[
              styles.videoCardRich,
              {
                width: fullVideoWidth,
              },
            ]}
            onPress={() => {
              if (video.id.startsWith("sample")) {
                alert("샘플 숏폼 비디오 미리보기입니다.");
              } else {
                navigation.navigate("SavedTripDetail", {
                  itineraryId: Number(video.id),
                });
              }
            }}
          >
            {/* 우측 상단 X 삭제 버튼 */}
            <Pressable
              style={styles.cardDeleteBtnRich}
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                setDeletedVideoIds((prev) => [...prev, video.id]);
              }}
            >
              <Icon name="x" size={13} color="#FFFFFF" />
            </Pressable>

            <View style={styles.videoThumbnail}>
              <LinearGradient
                colors={gradientPalettes[idx % gradientPalettes.length] as any}
                style={styles.videoThumbnailGradient}
              >
                <View style={styles.videoPlayOverlayRich}>
                  <Icon name="play" size={18} color="#FFFFFF" />
                </View>
              </LinearGradient>

              {/* 하단 텍스트 오버레이 */}
              <View style={styles.videoInfoOverlay}>
                <Text style={styles.videoCardTitle} numberOfLines={1}>
                  {video.title}
                </Text>
                <Text style={styles.videoCardDate}>{video.date}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}





