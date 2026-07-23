// 🎬 일별 여행영상 미리보기 (정본 = docs/여정 미리보기 영상 구현.md)
// = Day 칩 선택 → 일별 3분기: 미생성(생성 버튼) / 생성중(진행률 % 3초 폴링) / 완료(mp4 재생 + 글라스 카드 + 기기 저장).
// = A(지브리)·B(실사 포토무비) 모두 서버가 mp4 생성 = 재생 화면 1벌(옛 클라 슬라이드쇼 폐기 2026-07-23 §19).
// = 글라스 카드(Scene n/N·장소명·요약) = 2026-07-23 사장님 목업 = video_by_day.scenes 메타를 재생 위치에 맞춰 전환.
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
// expo-file-system@19(SDK54) = 메인 엔트리에서 documentDirectory/downloadAsync 제거 = legacy 엔트리가 정식 경로 (§22 react-best 실측)
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { apiRequest } from "@/lib/query-client";
import Icon from "@/components/Icon";
import { Brand, Fonts } from "@/constants/theme";

interface DayVideo {
  status: "processing" | "succeeded" | "failed";
  url: string | null;
  taskId: string;
  scenesDone: number;
  totalScenes: number;
  scenes?: { placeName: string; summary?: string }[]; // 글라스 카드(Scene n/N·장소명·요약)용 씬 메타
}

export default function VideoPreviewScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const itineraryId: number = route?.params?.itineraryId;

  const [itinerary, setItinerary] = useState<any | null>(null);
  const [videoByDay, setVideoByDay] = useState<Record<string, DayVideo>>({});
  const [selectedDay, setSelectedDay] = useState(1);
  const [isRequesting, setIsRequesting] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0); // 재생 위치 기반 현재 씬(글라스 카드 전환)
  const [pollTick, setPollTick] = useState(0); // 폴링 재가동 신호 = 네트워크 1회 오류에도 다음 폴링 이어감(§22 react-best)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 저장 = Tripis 해설화면(DetailViewer) 저장 패턴 이식(2026-07-22 사장님 SSOT = 완전 동일 구현):
  //   스피너 → 체크 1.5초 → 복원 + 안내음성("저장이 되었습니다"/"이미 저장되었습니다") + 영상 잠시 정지 후 자동 재개.
  const videoRef = useRef<Video | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success">(
    "idle",
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const days: any[] = itinerary?.rawData?.days || [];
  const dayVideo = videoByDay[String(selectedDay)];
  const slots: any[] = days[selectedDay - 1]?.places || [];

  // 여정 + 영상 상태 로드
  const loadAll = useCallback(async () => {
    try {
      const [ir, vr] = await Promise.all([
        apiRequest("GET", `/api/itineraries/${itineraryId}`),
        apiRequest("GET", `/api/itineraries/${itineraryId}/video`),
      ]);
      setItinerary(await ir.json());
      const v = await vr.json();
      setVideoByDay(v.videoByDay || {});
    } catch (e) {
      console.error("[VideoPreview] 로드 오류:", e);
    }
  }, [itineraryId]);

  useEffect(() => {
    loadAll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      Speech.stop();
    };
  }, [loadAll]);

  // 생성중 = 3초 폴링 (진행률 %). pollTick = 응답 성공/실패와 무관하게 다음 폴링 예약(영구정지 방지)
  useEffect(() => {
    if (dayVideo?.status !== "processing") return;
    pollRef.current = setTimeout(async () => {
      try {
        const r = await apiRequest(
          "GET",
          `/api/itineraries/${itineraryId}/video`,
        );
        const v = await r.json();
        setVideoByDay(v.videoByDay || {});
      } catch {
      } finally {
        setPollTick((n) => n + 1);
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [dayVideo?.status, itineraryId, pollTick]);

  // 일별 생성 요청
  const handleGenerate = async () => {
    setIsRequesting(true);
    try {
      const r = await apiRequest(
        "POST",
        `/api/itineraries/${itineraryId}/video/generate`,
        { day: selectedDay },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `요청 실패(${r.status})`);
      }
      await loadAll();
    } catch (e: any) {
      Alert.alert("영상 생성", e.message || "요청에 실패했습니다.");
    } finally {
      setIsRequesting(false);
    }
  };

  // 안내음성 = 해설화면 announce 패턴 이식: 영상 잠시 정지 → 안내 → 자동 재개(끝나면/끊겨도 재개)
  const announce = (message: string) => {
    videoRef.current?.pauseAsync().catch(() => {});
    const resume = () => {
      videoRef.current?.playAsync().catch(() => {});
    };
    Speech.speak(message, {
      language: "ko-KR",
      rate: 1.0,
      onDone: resume,
      onStopped: resume,
    });
  };

  // 완료 영상 기기 저장(갤러리) = 해설화면 handleSave 패턴: 이미 저장 = 재저장 없이 안내음성만(중복 차단, 기기 파일 존재로 판별)
  const handleSaveVideo = async () => {
    const url = dayVideo?.url;
    if (!url || saveState !== "idle") return;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
      return;
    }
    const fileUri =
      FileSystem.documentDirectory +
      `tripis_ghibli_${itineraryId}_day${selectedDay}.mp4`;
    try {
      const existing = await FileSystem.getInfoAsync(fileUri);
      if (existing.exists) {
        setSaveState("success");
        announce("이미 저장되었습니다");
        saveTimerRef.current = setTimeout(() => setSaveState("idle"), 1500);
        return;
      }

      setSaveState("saving");
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setSaveState("idle");
        Alert.alert("권한 필요", "갤러리 저장 권한을 허용해 주세요.");
        return;
      }
      const dl = await FileSystem.downloadAsync(url, fileUri);
      const asset = await MediaLibrary.createAssetAsync(dl.uri);
      await MediaLibrary.createAlbumAsync("TRIPIS 여행", asset, false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaveState("success");
      announce("저장이 되었습니다");
      saveTimerRef.current = setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      console.error("[VideoPreview] 저장 오류:", e);
      setSaveState("idle");
      Alert.alert("저장 실패", "영상 저장에 실패했습니다.");
    }
  };

  // 재생 위치 → 현재 씬 인덱스 (씬 길이 = 전체길이/씬수 = 동적, 글라스 카드 전환)
  const handlePlaybackStatus = (status: any) => {
    const scenes = dayVideo?.scenes;
    if (!status?.isLoaded || !scenes?.length || !status.durationMillis) return;
    const per = status.durationMillis / scenes.length;
    const idx = Math.min(
      Math.floor((status.positionMillis || 0) / per),
      scenes.length - 1,
    );
    setSceneIdx((prev) => (prev === idx ? prev : idx));
  };
  const sceneCard = dayVideo?.scenes?.length
    ? {
        index: Math.min(sceneIdx, dayVideo.scenes.length - 1),
        total: dayVideo.scenes.length,
        placeName:
          dayVideo.scenes[Math.min(sceneIdx, dayVideo.scenes.length - 1)]
            .placeName,
        summary:
          dayVideo.scenes[Math.min(sceneIdx, dayVideo.scenes.length - 1)]
            .summary,
      }
    : null;

  if (!itinerary) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={Brand.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* 헤더 = Tripis 공통 투명 오버레이 아이콘(2026-07-22 사장님 SSOT): 좌상단 X(닫기) + 우상단 저장(완료 영상 있을 때만) = 영상 방해 0 */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Icon name="x" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          🎬 {itinerary.title || "여정 미리보기"}
        </Text>
        {dayVideo?.status === "succeeded" && dayVideo.url ? (
          <Pressable style={styles.headerBtn} onPress={handleSaveVideo}>
            {saveState === "saving" ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Icon
                name={saveState === "success" ? "check" : "download"}
                size={22}
                color={saveState === "success" ? "#22c55e" : "#FFFFFF"}
              />
            )}
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {/* Day 칩 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dayChips}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {days.map((d: any, i: number) => {
          const dv = videoByDay[String(i + 1)];
          return (
            <Pressable
              key={i}
              style={[styles.chip, selectedDay === i + 1 && styles.chipActive]}
              onPress={() => {
                setSelectedDay(i + 1);
                setSceneIdx(0);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedDay === i + 1 && styles.chipTextActive,
                ]}
              >
                Day {i + 1}
                {dv?.status === "succeeded"
                  ? " ✓"
                  : dv?.status === "processing"
                    ? " …"
                    : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 본문 = 일별 상태 분기 (A·B 모두 서버 mp4 = 재생 화면 1벌. 옛 클라 슬라이드쇼 = 폐기 2026-07-23 §19) */}
      <View style={styles.body}>
        {dayVideo?.status === "succeeded" && dayVideo.url ? (
          // ✅ 완료 = 전체 재생 + 하단 글라스 카드(Scene n/N·장소명·요약 = 2026-07-23 사장님 목업. 버튼은 기존 그대로)
          <View style={styles.playerBox}>
            <Video
              ref={videoRef}
              source={{ uri: dayVideo.url }}
              style={styles.player}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping
              onPlaybackStatusUpdate={handlePlaybackStatus}
            />
            {sceneCard && (
              <View style={styles.sceneCard} pointerEvents="none">
                <View style={styles.sceneCardRow}>
                  <Icon name="map-pin" size={14} color="#93c5fd" />
                  <Text style={styles.sceneCardIndex}>
                    Scene {sceneCard.index + 1}/{sceneCard.total}
                  </Text>
                </View>
                <Text style={styles.sceneCardTitle} numberOfLines={1}>
                  {sceneCard.placeName}
                </Text>
                {!!sceneCard.summary && (
                  <Text style={styles.sceneCardSummary} numberOfLines={2}>
                    {sceneCard.summary}
                  </Text>
                )}
              </View>
            )}
          </View>
        ) : dayVideo?.status === "processing" ? (
          // ⏳ 생성중 = 진행률
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Brand.primary} />
            <Text style={styles.progressText}>
              지브리 영상 생성 중{" "}
              {dayVideo.totalScenes
                ? `${Math.round((dayVideo.scenesDone / dayVideo.totalScenes) * 100)}%`
                : ""}
            </Text>
            <Text style={styles.progressSub}>
              장면 {dayVideo.scenesDone}/{dayVideo.totalScenes} · 약 1~2분 소요
            </Text>
          </View>
        ) : (
          // 🎬 미생성(또는 실패) = 생성 버튼
          <View style={styles.center}>
            <Icon name="film" size={56} color={Brand.primary} />
            <Text style={styles.introTitle}>
              Day {selectedDay} 지브리 여행 만화영상
            </Text>
            <Text style={styles.introDesc}>
              나의 실제 일정이 코믹한 지브리 애니메이션 브이로그가 됩니다.
            </Text>
            {dayVideo?.status === "failed" && (
              <Text style={styles.failText}>
                이전 생성에 실패했어요. 다시 시도해 주세요.
              </Text>
            )}
            <Pressable
              style={[styles.genBtn, isRequesting && { opacity: 0.6 }]}
              onPress={handleGenerate}
              disabled={isRequesting || !slots.length}
            >
              {isRequesting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Icon name="play" size={18} color="#FFFFFF" />
              )}
              <Text style={styles.genBtnText}>영상 만들기 (약 1~2분)</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: "#FFFFFF",
    fontFamily: Fonts?.bold || undefined,
    fontSize: 16,
  },
  dayChips: { flexGrow: 0, marginVertical: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1e293b",
  },
  chipActive: { backgroundColor: Brand.primary },
  chipText: {
    color: "#94a3b8",
    fontSize: 13,
    fontFamily: Fonts?.medium || undefined,
  },
  chipTextActive: { color: "#FFFFFF" },
  body: { flex: 1 },
  playerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
  },
  player: { width: "100%", flex: 1, borderRadius: 16, overflow: "hidden" },
  // 글라스 카드(2026-07-23 사장님 목업) = 영상 하단 반투명 오버레이: Scene n/N + 장소명 + 요약
  sceneCard: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 88,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sceneCardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sceneCardIndex: {
    color: "#93c5fd",
    fontSize: 12,
    fontFamily: Fonts?.medium || undefined,
  },
  sceneCardTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontFamily: Fonts?.bold || undefined,
  },
  sceneCardSummary: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    lineHeight: 19,
  },
  progressText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts?.bold || undefined,
  },
  progressSub: { color: "#94a3b8", fontSize: 13 },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: Fonts?.bold || undefined,
    marginTop: 8,
  },
  introDesc: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 19,
  },
  failText: { color: "#f87171", fontSize: 13 },
  genBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Brand.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    marginTop: 12,
  },
  genBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts?.bold || undefined,
  },
});
