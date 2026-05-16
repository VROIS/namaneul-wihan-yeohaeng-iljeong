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
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";

import {
  Spacing,
  BorderRadius,
  Brand,
  Typography,
  Colors,
  Fonts,
} from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import Icon from "@/components/Icon";
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
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
        const response = await apiRequest(
          "GET",
          `/api/itineraries/${itineraryId}`,
        );
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
        const response = await apiRequest(
          "GET",
          `/api/itineraries/${itineraryId}/video`,
        );
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
      const response = await apiRequest(
        "POST",
        `/api/itineraries/${itineraryId}/video/generate`,
      );
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
        Alert.alert(
          t("saved.permissionRequired"),
          t("saved.permissionMsg"),
        );
        return;
      }

      Alert.alert(t("saved.videoDownloading"), t("saved.videoDownloadingMsg"));

      // 파일 다운로드
      const filename = `tripis_trip_${itineraryId}_${Date.now()}.mp4`;
      const fileUri = (FileSystem as any).documentDirectory + filename;

      const downloadResult = await FileSystem.downloadAsync(videoUrl, fileUri);

      if (downloadResult.status === 200) {
        // 갤러리에 저장
        const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
        await MediaLibrary.createAlbumAsync("TRIPIS 여행", asset, false);

        Alert.alert(t("saved.videoSaveComplete"), t("saved.videoSaveCompleteMsg"));
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
          t("saved.videoSaveFailed"),
          t("saved.videoSaveFailedMsg"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.share"), onPress: () => Sharing.shareAsync(videoUrl) },
          ],
        );
      } else {
        Alert.alert(t("common.error"), t("saved.videoSaveErrorMsg"));
      }
    }
  };

  const getVideoButtonText = () => {
    switch (videoStatus) {
      case "idle":
        return t("saved.videoCreate");
      case "generating":
        return t("saved.videoRequesting");
      case "polling":
        return t("saved.videoGenerating");
      case "succeeded":
        return t("saved.videoComplete");
      case "failed":
        return t("saved.videoFailed");
    }
  };

  const isVideoButtonDisabled =
    videoStatus === "generating" || videoStatus === "polling";

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Brand.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {t("saved.loading")}
          </Text>
        </View>
      </View>
    );
  }

  if (!itinerary) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={48} color={theme.textTertiary} />
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            {t("saved.notFound")}
          </Text>
        </View>
      </View>
    );
  }

  // 라벨 매핑
  const curationLabels: Record<string, string> = {
    Kids: t("labels.curationKids"),
    Parents: t("labels.curationParents"),
    Everyone: t("labels.curationEveryone"),
    Self: t("labels.curationSelf"),
  };
  const companionLabels: Record<string, string> = {
    Single: t("labels.companionSingle"),
    Couple: t("labels.companionCouple"),
    Family: t("labels.companionFamily"),
    ExtendedFamily: t("labels.companionExtended"),
    Group: t("labels.companionGroup"),
  };
  const paceLabels: Record<string, string> = {
    Relaxed: t("labels.paceRelaxed"),
    Normal: t("labels.paceNormal"),
    Packed: t("labels.pacePacked"),
  };

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
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.title}>{itinerary.title}</ThemedText>
        </View>

        {/* 🎬 영상 카드 */}
        <View
          style={[
            styles.videoCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
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
              <Pressable
                style={styles.saveVideoButton}
                onPress={handleSaveVideo}
              >
                <Icon name="download" size={20} color="#FFFFFF" />
                <Text style={styles.saveVideoButtonText}>{t("saved.videoSave")}</Text>
              </Pressable>
              <Pressable
                style={[styles.regenerateButton, { borderColor: theme.border }]}
                onPress={handleGenerateVideo}
              >
                <Icon name="refresh-cw" size={16} color={theme.textSecondary} />
                <Text
                  style={[
                    styles.regenerateButtonText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {t("saved.videoRegenerate")}
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
                <Icon name="film" size={24} color={Brand.primary} />
                <Text style={[styles.videoCardTitle, { color: theme.text }]}>
                  {t("saved.videoTitle")}
                </Text>
              </View>
              <Text
                style={[styles.videoCardDesc, { color: theme.textSecondary }]}
              >
                {t("saved.videoDesc")}
              </Text>

              <Pressable
                style={[
                  styles.videoButton,
                  isVideoButtonDisabled && styles.videoButtonDisabled,
                ]}
                onPress={handleGenerateVideo}
                disabled={isVideoButtonDisabled}
              >
                {isVideoButtonDisabled && (
                  <ActivityIndicator
                    color="#fff"
                    style={styles.videoButtonSpinner}
                  />
                )}
                <Text style={styles.videoButtonText}>
                  {getVideoButtonText()}
                </Text>
              </Pressable>

              {videoStatus === "polling" && (
                <Text
                  style={[styles.progressText, { color: theme.textSecondary }]}
                >
                  {t("saved.videoPolling")}
                </Text>
              )}
            </LinearGradient>
          )}
        </View>

        {/* 일정 정보 */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Text style={[styles.infoTitle, { color: theme.text }]}>
            {t("saved.tripInfo")}
          </Text>

          <View style={styles.infoRow}>
            <Icon name="calendar" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.date")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {itinerary.startDate?.split("T")[0]} ~{" "}
              {itinerary.endDate?.split("T")[0]}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Icon name="users" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.companion")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {companionLabels[itinerary.companionType] ||
                itinerary.companionType}{" "}
              ({itinerary.companionCount}명)
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Icon name="heart" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.curationFocus")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {curationLabels[itinerary.curationFocus] ||
                itinerary.curationFocus}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Icon name="zap" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
              {t("saved.travelPace")}
            </Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {paceLabels[itinerary.travelPace] || itinerary.travelPace}
            </Text>
          </View>

          {itinerary.vibes && itinerary.vibes.length > 0 && (
            <View style={styles.vibesRow}>
              <Icon name="star" size={16} color={theme.textSecondary} />
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>
                {t("saved.vibes")}
              </Text>
              <View style={styles.vibesTags}>
                {itinerary.vibes.map((vibe, index) => (
                  <View
                    key={index}
                    style={[
                      styles.vibeTag,
                      { backgroundColor: `${Brand.primary}15` },
                    ]}
                  >
                    <Text
                      style={[styles.vibeTagText, { color: Brand.primary }]}
                    >
                      {vibe}
                    </Text>
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
    fontFamily: Fonts.bold,
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
    fontFamily: Fonts.bold,
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
    fontFamily: Fonts.bold,
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
    fontFamily: Fonts.bold,
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
    fontFamily: Fonts.medium,
  },
  infoCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
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
    fontFamily: Fonts.semiBold,
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
    fontFamily: Fonts.semiBold,
  },
});
