import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  useColorScheme,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

import { Spacing, BorderRadius, Brand, Typography, Colors } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type VideoStatus = "idle" | "generating" | "polling" | "succeeded" | "failed";

interface ItineraryDetail {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  curationFocus: string;
  companionType: string;
  companionCount: number;
  vibes: string[];
  travelPace: string;
  travelStyle: string;
  mobilityStyle: string;
  videoStatus?: string;
  videoUrl?: string;
  videoTaskId?: string;
}

export default function SavedTripDetailScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "SavedTripDetail">>();
  const { itineraryId } = route.params;

  const [itinerary, setItinerary] = useState<ItineraryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  // 일정 상세 불러오기
  useEffect(() => {
    const loadItinerary = async () => {
      try {
        const response = await apiRequest("GET", `/api/itineraries/${itineraryId}`);
        const data = await response.json();
        setItinerary(data);
        
        // 기존 영상 상태 확인
        if (data.videoStatus === "succeeded" && data.videoUrl) {
          setVideoStatus("succeeded");
          setVideoUrl(data.videoUrl);
        } else if (data.videoTaskId) {
          setTaskId(data.videoTaskId);
          setVideoStatus("polling");
          pollVideoStatus();
        }
      } catch (error) {
        console.error("[SavedTripDetail] 로드 오류:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadItinerary();
  }, [itineraryId]);

  // 영상 상태 폴링
  const pollVideoStatus = async () => {
    const poll = async () => {
      try {
        const response = await apiRequest("GET", `/api/itineraries/${itineraryId}/video`);
        const data = await response.json();

        if (data.status === "succeeded" && data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setVideoStatus("succeeded");
          return;
        } else if (data.status === "failed") {
          setVideoStatus("failed");
          return;
        }
        // 아직 진행 중이면 3초 후 다시 폴링
        setTimeout(poll, 3000);
      } catch (error) {
        console.error("[SavedTripDetail] 폴링 오류:", error);
        setVideoStatus("failed");
      }
    };
    poll();
  };

  // 영상 생성 시작
  const handleGenerateVideo = async () => {
    setVideoStatus("generating");
    try {
      const response = await apiRequest("POST", `/api/itineraries/${itineraryId}/video/generate`);
      const data = await response.json();

      if (data.success && data.taskId) {
        setTaskId(data.taskId);
        setVideoStatus("polling");
        pollVideoStatus();
      } else {
        throw new Error(data.error || "영상 생성 요청 실패");
      }
    } catch (error) {
      console.error("[SavedTripDetail] 영상 생성 오류:", error);
      setVideoStatus("failed");
    }
  };

  // 영상 저장 (기기에 다운로드)
  const handleSaveVideo = async () => {
    if (!videoUrl) return;

    try {
      // 권한 요청
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 필요", "영상을 저장하려면 미디어 라이브러리 접근 권한이 필요합니다.");
        return;
      }

      Alert.alert("다운로드 중", "영상을 저장하고 있습니다...");

      // 파일 다운로드
      const filename = `nubi_trip_${itineraryId}_${Date.now()}.mp4`;
      const fileUri = FileSystem.documentDirectory + filename;

      const downloadResult = await FileSystem.downloadAsync(videoUrl, fileUri);

      if (downloadResult.status === 200) {
        // 갤러리에 저장
        const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
        await MediaLibrary.createAlbumAsync("누비 여행", asset, false);

        Alert.alert("저장 완료! ✅", "영상이 갤러리에 저장되었습니다.");
      } else {
        throw new Error("다운로드 실패");
      }
    } catch (error) {
      console.error("[SavedTripDetail] 영상 저장 오류:", error);
      
      // 웹에서는 공유 기능 사용
      if (Platform.OS === "web" && videoUrl) {
        window.open(videoUrl, "_blank");
        return;
      }
      
      // 공유 폴백
      if (await Sharing.isAvailableAsync()) {
        Alert.alert(
          "저장 실패",
          "갤러리 저장에 실패했습니다. 공유하시겠습니까?",
          [
            { text: "취소", style: "cancel" },
            { text: "공유", onPress: () => Sharing.shareAsync(videoUrl) }
          ]
        );
      } else {
        Alert.alert("오류", "영상 저장에 실패했습니다.");
      }
    }
  };

  const getVideoButtonText = () => {
    switch (videoStatus) {
      case "idle": return "✨ AI 영상 만들기";
      case "generating": return "🔄 요청 중...";
      case "polling": return "⏳ 생성 중... (약 4분 소요)";
      case "succeeded": return "✅ 완료! 다시 만들기";
      case "failed": return "❌ 실패 - 다시 시도";
    }
  };

  const isVideoButtonDisabled = videoStatus === "generating" || videoStatus === "polling";

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Brand.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>불러오는 중...</Text>
        </View>
      </View>
    );
  }

  if (!itinerary) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={theme.textTertiary} />
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>일정을 찾을 수 없습니다</Text>
        </View>
      </View>
    );
  }

  // 라벨 매핑
  const curationLabels: Record<string, string> = { Kids: "아이", Parents: "부모님", Everyone: "모두", Self: "나" };
  const companionLabels: Record<string, string> = { Single: "혼자", Couple: "커플", Family: "가족", ExtendedFamily: "대가족", Group: "친구들" };
  const paceLabels: Record<string, string> = { Relaxed: "여유롭게", Normal: "적당히", Packed: "빡빡하게" };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        {/* 헤더 */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.title}>{itinerary.title}</ThemedText>
        </View>

        {/* 🎬 영상 카드 */}
        <View style={[styles.videoCard, { backgroundColor: theme.backgroundDefault }]}>
          {videoStatus === "succeeded" && videoUrl ? (
            // ✅ 영상 완료: 비디오 플레이어 + 저장 버튼
            <View style={styles.videoPlayerContainer}>
              <Video
                source={{ uri: videoUrl }}
                style={styles.videoPlayer}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
                shouldPlay={false}
              />
              <Pressable style={styles.saveVideoButton} onPress={handleSaveVideo}>
                <Feather name="download" size={20} color="#FFFFFF" />
                <Text style={styles.saveVideoButtonText}>💾 영상 저장</Text>
              </Pressable>
              <Pressable 
                style={[styles.regenerateButton, { borderColor: theme.border }]} 
                onPress={handleGenerateVideo}
              >
                <Feather name="refresh-cw" size={16} color={theme.textSecondary} />
                <Text style={[styles.regenerateButtonText, { color: theme.textSecondary }]}>
                  다시 생성하기
                </Text>
              </Pressable>
            </View>
          ) : (
            // 🎬 영상 미생성 또는 생성 중
            <LinearGradient
              colors={[`${Brand.primary}20`, `${Brand.secondary}10`]}
              style={styles.videoCardGradient}
            >
              <View style={styles.videoCardHeader}>
                <Feather name="film" size={24} color={Brand.primary} />
                <Text style={[styles.videoCardTitle, { color: theme.text }]}>AI 여행 영상</Text>
              </View>
              <Text style={[styles.videoCardDesc, { color: theme.textSecondary }]}>
                저장된 일정을 기반으로 지브리 스타일의 감동 영상을 만들어 드려요
              </Text>

              <Pressable
                style={[
                  styles.videoButton,
                  isVideoButtonDisabled && styles.videoButtonDisabled,
                ]}
                onPress={handleGenerateVideo}
                disabled={isVideoButtonDisabled}
              >
                {isVideoButtonDisabled && <ActivityIndicator color="#fff" style={styles.videoButtonSpinner} />}
                <Text style={styles.videoButtonText}>{getVideoButtonText()}</Text>
              </Pressable>

              {videoStatus === "polling" && (
                <Text style={[styles.progressText, { color: theme.textSecondary }]}>
                  여러 장면을 순차적으로 생성하고 있습니다...
                </Text>
              )}
            </LinearGradient>
          )}
        </View>

        {/* 일정 정보 */}
        <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }]}>
          <Text style={[styles.infoTitle, { color: theme.text }]}>여행 정보</Text>
          
          <View style={styles.infoRow}>
            <Feather name="calendar" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>날짜</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {itinerary.startDate?.split("T")[0]} ~ {itinerary.endDate?.split("T")[0]}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Feather name="users" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>동행</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {companionLabels[itinerary.companionType] || itinerary.companionType} ({itinerary.companionCount}명)
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Feather name="heart" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>누구를 위한</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {curationLabels[itinerary.curationFocus] || itinerary.curationFocus}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Feather name="zap" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>일정 밀도</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {paceLabels[itinerary.travelPace] || itinerary.travelPace}
            </Text>
          </View>

          {itinerary.vibes && itinerary.vibes.length > 0 && (
            <View style={styles.vibesRow}>
              <Feather name="star" size={16} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>바이브</Text>
              <View style={styles.vibesTags}>
                {itinerary.vibes.map((vibe, index) => (
                  <View key={index} style={[styles.vibeTag, { backgroundColor: `${Brand.primary}15` }]}>
                    <Text style={[styles.vibeTagText, { color: Brand.primary }]}>{vibe}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    flex: 1,
  },
  videoCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  videoCardGradient: {
    padding: Spacing.lg,
  },
  videoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  videoCardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  videoCardDesc: {
    fontSize: 14,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  videoButton: {
    backgroundColor: Brand.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  videoButtonDisabled: {
    opacity: 0.6,
  },
  videoButtonSpinner: {
    marginRight: Spacing.xs,
  },
  videoButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  progressText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  // 비디오 플레이어 스타일
  videoPlayerContainer: {
    padding: Spacing.md,
  },
  videoPlayer: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: BorderRadius.md,
    backgroundColor: "#000",
  },
  saveVideoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  saveVideoButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  regenerateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  regenerateButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  infoCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: 14,
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  vibesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  vibesTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    gap: Spacing.xs,
  },
  vibeTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  vibeTagText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
