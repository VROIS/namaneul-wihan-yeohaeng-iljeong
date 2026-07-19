// 저장된 여정 상세 = 일정 로드 + 영상 생성/폴링/저장 상태머신 = SavedTripDetailScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import { useState, useEffect } from "react";
import { Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { apiRequest } from "@/lib/query-client";

export type VideoStatus =
  | "idle"
  | "generating"
  | "polling"
  | "succeeded"
  | "failed";

export interface ItineraryDetail {
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

export function useVideoGeneration({
  itineraryId,
  t,
}: {
  itineraryId: number;
  t: (key: string, opts?: any) => string;
}) {
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
        Alert.alert(t("saved.permissionRequired"), t("saved.permissionMsg"));
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

        Alert.alert(
          t("saved.videoSaveComplete"),
          t("saved.videoSaveCompleteMsg"),
        );
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
        Alert.alert(t("saved.videoSaveFailed"), t("saved.videoSaveFailedMsg"), [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.share"),
            onPress: () => Sharing.shareAsync(videoUrl),
          },
        ]);
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

  return {
    itinerary,
    isLoading,
    videoStatus,
    videoUrl,
    taskId,
    handleGenerateVideo,
    handleSaveVideo,
    getVideoButtonText,
    isVideoButtonDisabled,
  };
}
