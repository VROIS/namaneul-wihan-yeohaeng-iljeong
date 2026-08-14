// '나의 TRIPIS' 섹션 = 숏폼 영상 + TRIPIS 콘텐츠 (아이폰 12 가득 채우는 입체 3D 카드)
// = 2026-08-01 사장님 B-0 배선: 카드 터치 = 통합 모달(TripisModal) 1벌로 열기.
//   영상 카드 → {mode:"itinerary"} / TRIPIS 카드 → {mode:"guide"}. 화면 이동 없음 = 라우트 경유 폐기 = 2026-08-01 §B-0.
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
// 숨김 이름표(종류:id) = 공용 1벌(§16). 목록·저장은 useProfile 이 1번만 부른다.
import { cardKey } from "../hooks/useHiddenCards";

// ⚠️ 수정금지(승인필요) 2026-08-14 = 영상 카드 제목 = itineraries.title = "{도시} {여행/Trips/Voyages/...}"
//   (server/itinerary-save.ts, 저장 시점 언어로 접미사가 고정됨). 도시명은 고유명사라 안 건드리고,
//   접미사만 이미 있는 profile.trips 키 값들과 대조해 지금 화면 언어로 다시 붙인다(서버 무변경, 새 키 0).
const TRIP_TITLE_SUFFIXES = [
  "여행",
  "Trips",
  "Voyages",
  "Viajes",
  "Reisen",
  "旅行",
];
// ⚠️ 수정금지(승인필요) 2026-08-14 판단검증 지적 반영 = 여정을 명시로 "저장" 안 해도 영상 완료 시 자동게시된다
//   (video-routes.ts:367-378, 저장 여부 무관 항상 실행). 그런 여정의 제목은 생성 시점 고정 포맷
//   "{도시} {N}일 여행"(ag4-db-finalize.ts·pipeline-v3-step2-build.ts, 언어 무관 항상 한국어)이 그대로 남아있어
//   숫자를 먼저 떼지 않으면 "Paris 3일 Trips" 처럼 한국어 숫자와 번역 접미사가 섞인다.
const DAY_COUNT_TITLE_RE = /^(.+?)\s*\d+일\s*여행$/;
function localizeVideoTitle(title: string, t: (k: string) => string): string {
  const dayCountMatch = DAY_COUNT_TITLE_RE.exec(title);
  if (dayCountMatch) {
    const destination = dayCountMatch[1].trim();
    if (destination) return `${destination} ${t("profile.trips")}`;
  }
  for (const suf of TRIP_TITLE_SUFFIXES) {
    if (title.endsWith(suf)) {
      const destination = title.slice(0, title.length - suf.length).trim();
      if (destination) return `${destination} ${t("profile.trips")}`;
    }
  }
  return title; // 패턴이 안 맞으면 원본 그대로(안전한 폴백, 데이터 손실 없음)
}

export default function VideosSection({ profile }: { profile: ProfileApi }) {
  // 섹션 제목 = 7언어 사전(profile.myTripis). 하드코딩 금지 = 2026-08-01 사장님 §B-0.
  const { t } = useTranslation();

  // ⚠️ 수정금지(승인필요) 숨김 목록 = 공용 1벌(2026-08-08 §16) = 여정 카드도 같은 것을 쓴다.
  //   본인 기기 화면에서만 숨기고 DB 행은 보존한다 = 서버에 삭제를 요청하지 않는다.
  //   ⚠️ 훅을 여기서 직접 부르지 않는다(§22 판단검증) = useProfile 이 1번만 부른 것을 받아 쓴다.
  const { hiddenKeys, hiddenReady, hideCard } = profile;

  // TRIPIS 보관함(guides) = **프로필 탭이 보일 때마다 + 계정이 바뀔 때** 다시 읽는다
  //   = 같은 훅(useProfile)의 loadTrips·refetchCredits 와 같은 useFocusEffect 1벌 패턴(§16).
  //   mount 1회 방식 폐기 = 2026-08-03 §22 판단검증 지적 — 하단 탭은 계속 마운트 상태라
  //   해설을 저장하고 [보관함]으로 와도 새 카드가 안 보였고, 계정 전환 후 이전 계정 목록이 남았다.
  const [guides, setGuides] = useState<GuideRow[]>([]);
  // 📥 저장한 영상 목록 = saved_videos(내가 담은 것만). 옛 "내 여정 자동 노출"(savedTrips 파생) 폐기 §19
  //   = 2026-08-03 사장님 확정: 사용자가 저장한 것만 프로필에서 본다. 완성 자동게시(is_new)도 이 표로 들어온다.
  const [savedVideos, setSavedVideos] = useState<SavedVideoRow[]>([]);
  // 통합 모달 = null 이면 닫힘(모달이 아예 렌더되지 않아 폴링·낭독 완전 중단)
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
    // 영상 목록 = 같은 초점 시점에 함께 (실패 = listSavedVideos 가 빈 배열 아닌 직전 유지가 아니라 [] 반환 —
    //   401(로그아웃)일 때 이전 계정 카드가 남지 않게 하는 쪽이 우선)
    setSavedVideos(await listSavedVideos());
  }, [profile.authReady, profile.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadGuides();
    }, [loadGuides]),
  );

  // 아이폰 12 (390pt) 가득 채우는 3D 숏폼 카드 폭
  const fullVideoWidth = getResponsiveFullVideoCardWidth();

  // ⚠️ 수정금지(승인필요) 2026-08-01 사장님 = 가짜 샘플 카드 완전삭제 §19.
  //   사유 = 영상이 0건이어도 가짜 카드가 떠서 "저장 실패"를 화면에서 알 수 없었고,
  //   눌러도 안내창만 떠 통합 모달 확인 자체가 막혔다. 이제 실제 영상만 보여준다.
  // 카드 1장 = 담은 영상 1건(여정×일차). id = "여정번호:일차" = 숨김 열쇠도 이 단위.
  // ⚠️ 2026-08-12 = 같은 여정×일차가 여러 줄이면 **최신 1건만**(목록 = 최신순 = 첫 줄이 최신, §14 새것우선).
  //   왜: 관리자(전 사용자 현황판)는 다른 계정이 같은 영상을 담으면 같은 조합이 두 줄로 와서
  //   카드 이름표(key) 충돌 + 같은 카드 2장 + X 한 번에 둘 다 사라짐(아이폰 dev 경고 실측 2026-08-12, §22).
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
      date: v.startDate?.split("T")[0] || "",
    }));

  // TRIPIS 카드 = 기기에서 숨긴 것 제외(숏폼과 같은 목록 1벌 = DB 보존)
  const displayGuides = guides.filter(
    (g) => !hiddenKeys.includes(cardKey("guide", g.id)),
  );

  // 기기에 적어둔 숨김 목록을 아직 못 읽었으면 아무것도 그리지 않는다(깜빡임 방지).
  if (!hiddenReady) return null;

  // 영상도 TRIPIS 도 0건일 때만 섹션 숨김(TRIPIS 만 있어도 보여야 함)
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
            //   ★ 해제(서버 is_new) = 모달이 영상 뷰를 여는 순간 1벌로 처리 = 여기서는 화면 표식만 지운다.
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
              // 아이콘뿐인 버튼 = 스크린리더용 이름 필수(2026-08-03 §22 판단검증)
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
                  {localizeVideoTitle(video.title, t)}
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

// 썸네일 중앙 아이콘 자리 = 이미지 위에 겹치는 정중앙 배치(이 파일 전용 최소 스타일)
const localStyles = StyleSheet.create({
  thumbCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  // ★ 막 완성된 영상 표식(좌측 상단, X 와 대칭 크기)
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
