// = 2026-08-01 사장님 B-0 배선: 카드 터치 = 통합 모달(TripisModal) 1벌로 열기.
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { apiRequest } from "@/lib/query-client";
import TripisModal, {
  type GuideRow,
  type TripisOpenParams,
} from "@/components/tripis/TripisModal";
// 📥 영상 카드 데이터 = saved_videos(내가 담은 것만) 1벌 (2026-08-03 사장님 확정 = 해설과 같은 DB 방식)
import {
  listSavedVideos,
  type SavedVideoRow,
} from "@/components/tripis/savedVideosApi";
import { styles, getResponsiveFullVideoCardWidth } from "../styles";
import type { ProfileApi } from "../hooks/useProfile";
import { cardKey } from "../hooks/useHiddenCards";

// ⚠️ 수정금지(승인필요) 2026-08-14 = 영상 카드 제목 = itineraries.title = "{도시} {여행/Trips/Voyages/...}"
const TRIP_TITLE_SUFFIXES = [
  "여행",
  "Trips",
  "Voyages",
  "Viajes",
  "Reisen",
  "旅行",
];
// ⚠️ 수정금지(승인필요) 2026-08-14 판단검증 지적 반영 = 여정을 명시로 "저장" 안 해도 영상 완료 시 자동게시된다
const DAY_COUNT_TITLE_RE = /^(.+?)\s*\d+일\s*여행$/;
// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = cityNameEn(서버가 읽을 때 이어붙인 cities.name_en)이 있으면
function localizeVideoTitle(
  title: string,
  t: (k: string) => string,
  cityNameEn?: string | null,
): string {
  const pick = (fromTitle: string) => (cityNameEn || "").trim() || fromTitle;
  const dayCountMatch = DAY_COUNT_TITLE_RE.exec(title);
  if (dayCountMatch) {
    const destination = pick(dayCountMatch[1].trim());
    if (destination) return `${destination} ${t("profile.trips")}`;
  }
  for (const suf of TRIP_TITLE_SUFFIXES) {
    if (title.endsWith(suf)) {
      const destination = pick(
        title.slice(0, title.length - suf.length).trim(),
      );
      if (destination) return `${destination} ${t("profile.trips")}`;
    }
  }
  return title; // 패턴이 안 맞으면 원본 그대로(안전한 폴백, 데이터 손실 없음)
}

export default function VideosSection({ profile }: { profile: ProfileApi }) {
  // 섹션 제목 = 7언어 사전(profile.myTripis). 하드코딩 금지 = 2026-08-01 사장님 §B-0.
  const { t } = useTranslation();

  // ⚠️ 수정금지(승인필요) 숨김 목록 = 공용 1벌(2026-08-08 §16) = 여정 카드도 같은 것을 쓴다.
  const { hiddenKeys, hiddenReady, hideCard } = profile;

  const [guides, setGuides] = useState<GuideRow[]>([]);
  //   = 2026-08-03 사장님 확정: 사용자가 저장한 것만 프로필에서 본다. 완성 자동게시(is_new)도 이 표로 들어온다.
  const [savedVideos, setSavedVideos] = useState<SavedVideoRow[]>([]);
  const [modalParams, setModalParams] = useState<TripisOpenParams | null>(null);

  const loadGuides = useCallback(async () => {
    if (!profile.authReady) return;
    if (!profile.user?.id) {
      setGuides([]); // 미로그인·계정 전환 = 이전 계정 목록을 남기지 않는다
      setSavedVideos([]);
      return;
    }
    try {
      const r = await apiRequest("GET", "/api/guides");
      const rows = await r.json();
      setGuides(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error("[VideosSection] TRIPIS 목록 조회 실패:", e); // 실패 = 직전 목록 유지(loadTrips 와 같은 정책)
    }
    setSavedVideos(await listSavedVideos());
  }, [profile.authReady, profile.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadGuides();
    }, [loadGuides]),
  );

  const fullVideoWidth = getResponsiveFullVideoCardWidth();

  // ⚠️ 수정금지(승인필요) 2026-08-01 사장님 = 가짜 샘플 카드 완전삭제 §19.
  const seenVideoIds = new Set<string>();
  const displayVideos = savedVideos
    .filter((v) => {
      const id = `${v.itineraryId}:${v.day}`;
      if (seenVideoIds.has(id)) return false;
      seenVideoIds.add(id);
      return !hiddenKeys.includes(cardKey("video", id));
    })
    .map((v) => ({
      id: `${v.itineraryId}:${v.day}`,
      itineraryId: v.itineraryId,
      day: v.day,
      isNew: v.isNew,
      title: v.title,
      cityNameEn: v.cityNameEn,
      date: v.startDate?.split("T")[0] || "",
    }));

  const displayGuides = guides.filter(
    (g) => !hiddenKeys.includes(cardKey("guide", g.id)),
  );

  if (!hiddenReady) return null;

  if (displayVideos.length === 0 && displayGuides.length === 0) return null;

  const gradientPalettes = [
    ["#4F46E5", "#7C3AED"],
    ["#06B6D4", "#3B82F6"],
    ["#EC4899", "#8B5CF6"],
  ];

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleHeader}>
        <View
          style={[
            styles.sectionIconBox,
            { backgroundColor: "rgba(139, 92, 246, 0.12)" },
          ]}
        >
          <Icon name="film" size={18} color="#8B5CF6" />
        </View>
        <ThemedText style={styles.sectionTitle}>
          {t("profile.myTripis")}
        </ThemedText>
        <Text
          style={[
            styles.sectionBadge,
            { color: "#8B5CF6", backgroundColor: "rgba(139, 92, 246, 0.12)" },
          ]}
        >
          {displayVideos.length + displayGuides.length}
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
            // ⚠️ 수정금지(승인필요) 2026-08-01 사장님 B-0 = 카드 터치 = 통합 모달로 곧바로 영상(그 일차).
            onPress={() => {
              if (video.isNew)
                setSavedVideos((prev) =>
                  prev.map((v) =>
                    v.itineraryId === video.itineraryId && v.day === video.day
                      ? { ...v, isNew: false }
                      : v,
                  ),
                );
              setModalParams({
                mode: "itinerary",
                itineraryId: video.itineraryId,
                day: video.day,
              });
            }}
          >
            {/* 좌측 상단 ★ = 막 완성돼 자동 게시된 영상 표식(2026-08-03 사장님) = 1회 열면 사라짐 */}
            {video.isNew && (
              <View style={localStyles.newStar}>
                <Icon name="star" size={13} color="#FFFFFF" />
              </View>
            )}
            {/* 우측 상단 X = 이 기기에서만 숨김(기억됨). DB 는 건드리지 않는다 */}
            <Pressable
              style={styles.cardDeleteBtnRich}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.hide")}
              onPress={(e) => {
                e.stopPropagation();
                hideCard(cardKey("video", video.id));
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

              {/* 하단 텍스트 오버레이 = 제목 + n일차·시작일 */}
              <View style={styles.videoInfoOverlay}>
                <Text style={styles.videoCardTitle} numberOfLines={1}>
                  {localizeVideoTitle(video.title, t, video.cityNameEn)}
                </Text>
                <Text style={styles.videoCardDate}>
                  {t("common.dayCount", { count: video.day })} · {video.date}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}

        {/* TRIPIS 콘텐츠 카드 = 영상 카드 다음(같은 가로 스크롤, B-0). 썸네일 = 저장 사진(base64) */}
        {displayGuides.map((g, i) => (
          <Pressable
            key={g.id}
            style={[styles.videoCardRich, { width: fullVideoWidth }]}
            onPress={() =>
              setModalParams({ mode: "guide", guides: displayGuides, index: i })
            }
          >
            {/* 우측 상단 X = 숏폼과 같은 함수 1벌: 이 기기에서만 숨김(기억됨, DB 보존) */}
            <Pressable
              style={styles.cardDeleteBtnRich}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.hide")}
              onPress={(e) => {
                e.stopPropagation();
                hideCard(cardKey("guide", g.id));
              }}
            >
              <Icon name="x" size={13} color="#FFFFFF" />
            </Pressable>

            <View style={styles.videoThumbnail}>
              {g.imageUrl ? (
                <Image
                  source={{ uri: g.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={gradientPalettes[i % gradientPalettes.length] as any}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View style={localStyles.thumbCenter}>
                <View style={styles.videoPlayOverlayRich}>
                  <Icon name="book-open" size={18} color="#FFFFFF" />
                </View>
              </View>

              {/* 하단 텍스트 오버레이 = 제목(장소명 우선) + 저장일 앞 10자 */}
              <View style={styles.videoInfoOverlay}>
                <Text style={styles.videoCardTitle} numberOfLines={1}>
                  {g.locationName || g.title}
                </Text>
                <Text style={styles.videoCardDate}>
                  {(g.createdAt || "").slice(0, 10)}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* 통합 모달 = 껍데기 1벌(B-0). 닫기 = params null = 렌더 자체 종료 */}
      <TripisModal
        visible={modalParams !== null}
        params={modalParams}
        onClose={() => setModalParams(null)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  thumbCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  newStar: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(250, 204, 21, 0.92)",
  },
});
