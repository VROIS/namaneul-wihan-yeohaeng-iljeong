// 🧩 TRIPIS 통합 모달 껍데기 1벌 (정본 = docs/2026-07-30 도시버튼·베스트갤러리·BTS 통합.md §B-0)
// = 사장님 SSOT 2026-08-01: "껍데기 안에 숏폼 혹은 TRIPIS 콘텐츠를 끼우는 것" —
//   숏폼(VideoPlaySlot)도 TRIPIS(GuideViewSlot=DetailViewer)도 장소명·해설을 자체 표시하므로
//   이 모달의 책임 = 껍데기 + 상단 칩줄 + 우측 버튼 + 배선뿐. 요약 화면 없음(B-0 확정).
// = 디자인 = 여정 생성 플래너와 같은 결(애플 느낌·모서리 최대한 둥글게) = 기존 테마 토큰만 사용.
// = 라우트 아님 = RN Modal (RootStackNavigator OS별 presentation 사고 이력 회피).
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { apiRequest } from "@/lib/query-client";
import { Icon } from "@/components/Icon";
import {
  Brand,
  BorderRadius,
  Spacing,
  Fonts,
  Shadows,
} from "@/constants/theme";
import VideoPlaySlot, { type DayVideo } from "./VideoPlaySlot";
import GuideViewSlot from "./GuideViewSlot";
import CityCardScreen from "./CityCardScreen";
import { openGuideForPlace } from "./openGuide";

// GET /api/cities/:id/representative 응답 1벌 (B2). 이 칸들 = 도시 카드가 그리는 전부.
// = 대표여정이 없는 도시도 서버가 도시 DB 로 채워 내려준다 → itineraryId=null·dayCount=0·hasVideo=false (2026-08-02).
export interface RepCard {
  itineraryId: number | null;
  cityId: number;
  nameKo: string;
  nameEn: string;
  country: string | null;
  tagline: string;
  highlights: string[];
  dayCount: number;
  imageUrl: string | null;
  // 🎙️ 그 도시 대표장소(place_seed_raw.id) = 해설 배지가 여는 장소. 쓸 장소가 없으면 null (2026-08-02).
  placeId: number | null;
  // 🎙️ 그 장소 + 지금 화면 언어의 해설이 창고에 있으면 서버가 true 로 내려준다 = [해설] 배지 스위치(2026-08-02).
  hasGuide: boolean;
  hasVideo: boolean;
}

// GET /api/guides 응답 행 (서버 guide-routes.ts ④ 보관함 목록 = 본인 것만)
export interface GuideRow {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null; // base64 data URL
  locationName: string | null;
  aiGeneratedContent: string | null;
  voiceLang: string;
  voiceName: string | null;
  createdAt: string;
}

// 열기 인자 = 3모드: 도시 카드(대표여정 미리보기) / 숏폼 영상(여정) / TRIPIS 콘텐츠(장소별 여러 건 중 index 번째)
export type TripisOpenParams =
  | { mode: "city"; rep: RepCard }
  | { mode: "itinerary"; itineraryId: number; day?: number }
  | { mode: "guide"; guides: GuideRow[]; index: number };

interface Props {
  visible: boolean;
  params: TripisOpenParams | null;
  onClose(): void;
}

// 껍데기 밖 = 조건 렌더만 담당. 닫히면 Inner 가 통째로 언마운트 = 폴링·낭독 완전 중단.
export default function TripisModal({ visible, params, onClose }: Props) {
  if (!visible || !params) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TripisModalInner params={params} onClose={onClose} />
    </Modal>
  );
}

// 열릴 때마다 새로 마운트되는 본체 = 상태(선택 날짜·콘텐츠 index)가 이전 열림에 남지 않음.
function TripisModalInner({
  params,
  onClose,
}: {
  params: TripisOpenParams;
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // 지금 이 모달이 보여주는 것 = 처음엔 열기 인자 그대로.
  //   도시 카드에서 ▶ 대표 숏폼 배지를 누르면 여기만 "itinerary" 로 바뀌어 카드가 사라지고 영상 화면이 된다(B-0 도면).
  const [viewMode, setViewMode] = useState<TripisOpenParams["mode"]>(
    params.mode,
  );

  // ── itinerary 모드 상태 ──────────────────────────────────────────
  const [itinerary, setItinerary] = useState<any | null>(null);
  const [videoByDay, setVideoByDay] = useState<Record<string, DayVideo>>({});
  // null = 아직 사용자가 안 고름 → 열기 인자 day > 첫 성공 날짜 > 1일차 순으로 자동 결정
  const [selectedDay, setSelectedDay] = useState<number | null>(
    params.mode === "itinerary" ? (params.day ?? null) : null,
  );
  const [isRequesting, setIsRequesting] = useState(false);

  // ── guide 모드 상태 = 칩 터치로 장소별 콘텐츠 전환 ────────────────
  const [guideIdx, setGuideIdx] = useState(
    params.mode === "guide" ? params.index : 0,
  );

  // 이 모달이 다루는 여정 번호 = 여정 모드는 인자 그대로, 도시 모드는 그 도시 대표여정 번호(▶ 전환용).
  const itineraryId =
    params.mode === "itinerary"
      ? params.itineraryId
      : params.mode === "city"
        ? params.rep.itineraryId
        : null;

  // 여정 + 영상 상태 로드 = 열릴 때 1회
  //   도시 카드 상태에서는 부르지 않는다 = ▶ 를 누른 뒤에야 영상 정보를 가져온다(불필요한 호출 0).
  const loadAll = useCallback(async () => {
    if (itineraryId == null || viewMode !== "itinerary") return;
    try {
      const [ir, vr] = await Promise.all([
        apiRequest("GET", `/api/itineraries/${itineraryId}`),
        apiRequest("GET", `/api/itineraries/${itineraryId}/video`),
      ]);
      setItinerary(await ir.json());
      const v = await vr.json();
      setVideoByDay(v.videoByDay || {});
    } catch (e) {
      console.error("[TripisModal] 로드 오류:", e);
    }
  }, [itineraryId, viewMode]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const days: any[] = itinerary?.rawData?.days || [];
  // 칩 = 영상이 실제 만들어진(succeeded) 날짜만 (B-0: "숏폼 = 만들어진 날짜만 노출"). 미생성 날짜 = 칩 없음.
  const succeededDays = Object.keys(videoByDay)
    .filter((k) => videoByDay[k]?.status === "succeeded")
    .map(Number)
    .sort((a, b) => a - b);
  const effectiveDay = selectedDay ?? succeededDays[0] ?? 1;
  const dayVideo = videoByDay[String(effectiveDay)];
  const slots: any[] = days[effectiveDay - 1]?.places || [];
  // "보는 중" 판정 = 그 날짜 영상 완성 + url 존재 → 우측 버튼이 [여정 보기]로 바뀜
  const viewing =
    viewMode === "itinerary" &&
    dayVideo?.status === "succeeded" &&
    !!dayVideo.url;

  // 일별 생성 요청 = 함수 소유는 껍데기(상단 버튼 + 본문 버튼이 같은 함수 1벌 §0)
  const handleGenerate = async () => {
    if (itineraryId == null) return;
    setIsRequesting(true);
    try {
      const r = await apiRequest(
        "POST",
        `/api/itineraries/${itineraryId}/video/generate`,
        { day: effectiveDay },
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

  // [여정 보기] = 모달 닫고 그 여정 화면으로 (저장여정 카드와 같은 경로 1벌 = TripsSection §16)
  const handleViewItinerary = () => {
    if (itineraryId == null) return;
    onClose();
    navigation.navigate("Main", {
      screen: "Home",
      params: { itineraryId },
    } as any);
  };

  // 🎙️ 해설 배지 = 이 모달을 닫고 **가이드 미니앱의 해설 화면**을 그 장소로 연다 (2026-08-02 사장님 확정).
  //   보기와 만들기가 같은 곳인 이유 = 그 화면이 이미 "창고에 있으면 그대로 보여주고(호출 0), 없으면 만들어 담는다"를 한다 = 1벌(§16).
  //   여는 방식 = openGuideForPlace 1벌(2026-08-03 §22 수정 = 300ms 이중탭 잠금 + 앱 언어 전달).
  const handleOpenGuide = (placeId: number) => {
    onClose();
    openGuideForPlace(navigation, placeId);
  };

  const currentGuide =
    params.mode === "guide" ? params.guides[guideIdx] : undefined;

  // 도시 카드 = 콘텐츠 풀 채움이 아니라 어두운 배경 위 카드 1장 = 칩줄·상단 버튼을 그리지 않는다(B-0 "A. 도시 카드").
  //   [여정 만들기] = 도시 칩을 누른 순간 뒤 플래너 도시입력칸이 이미 채워졌으므로 카드만 닫으면 바로 생성 가능.
  //   배지 3단(영상·해설·코스) = 셋 다 같은 흐름 = 카드는 사라지고 화면만 갈린다(2026-08-02 사장님).
  if (viewMode === "city" && params.mode === "city") {
    return (
      <CityCardScreen
        rep={params.rep}
        onCreateTrip={onClose}
        // [영상] = 이 모달 안에서 숏폼 영상 화면으로
        onVideo={() => setViewMode("itinerary")}
        // [해설]·[해설 만들기] = **같은 곳** = 가이드 미니앱 해설 화면을 그 장소번호로 연다(2026-08-02 사장님 확정).
        //   배지가 보일 때만 눌리므로 여기 오면 장소번호가 반드시 있다.
        onGuide={() => {
          if (params.rep.placeId !== null) handleOpenGuide(params.rep.placeId);
        }}
        // [코스] = 그 여정 화면 = 프로필 '나의 여정' 카드와 같은 경로 1벌(handleViewItinerary §16)
        onCourse={handleViewItinerary}
        onClose={onClose}
      />
    );
  }

  return (
    <View style={styles.backdrop}>
      {/* ⚠️ 2026-08-01 사장님 = 스크린 완전 투명 + 콘텐츠 풀 채움. 이전 모듈의 비밀 = CONTAIN(전체 항상 보임) —
          비율 고정이 아니라 contain 이었음(실측). 상단 줄은 콘텐츠 위에 얹힘. */}
      <View style={styles.sheet}>
        {/* 본문 = 콘텐츠가 화면 전체를 차지(투명 스크린 위 풀 채움). 모달이 장소명·해설을 또 그리지 않는다(사장님 SSOT). */}
        <View style={styles.contentFrame}>
          {viewMode === "itinerary" && itineraryId != null ? (
            itinerary ? (
              // key=날짜 = 날짜 전환 시 슬롯 새 마운트(씬 인덱스·폴링 초기화)
              <VideoPlaySlot
                key={effectiveDay}
                itineraryId={itineraryId}
                day={effectiveDay}
                dayVideo={dayVideo}
                hasSlots={slots.length > 0}
                isRequesting={isRequesting}
                onGenerate={handleGenerate}
                onVideoByDay={setVideoByDay}
              />
            ) : (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Brand.primary} />
              </View>
            )
          ) : currentGuide ? (
            // key=콘텐츠 id = 칩 전환 시 뷰어 새 마운트(낭독·하이라이트 처음부터)
            <GuideViewSlot
              key={currentGuide.id}
              guide={currentGuide}
              onClose={onClose}
            />
          ) : null}
        </View>

        {/* 상단 줄 = 콘텐츠 위 오버레이: 왼쪽 칩줄 + 오른쪽 버튼 1개 + [X] (§23 = 아이콘 + 짧은 동사만) */}
        <View style={[styles.topRow, { paddingTop: insets.top + Spacing.sm }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chips}
            contentContainerStyle={styles.chipsContent}
          >
            {viewMode === "itinerary"
              ? succeededDays.map((d) => (
                  <Pressable
                    key={d}
                    style={[
                      styles.chip,
                      effectiveDay === d && styles.chipActive,
                    ]}
                    onPress={() => setSelectedDay(d)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        effectiveDay === d && styles.chipTextActive,
                      ]}
                    >
                      {d}일차 ✓
                    </Text>
                  </Pressable>
                ))
              : params.mode !== "guide"
                ? null
                : params.guides.map((g, i) => (
                    <Pressable
                      key={g.id}
                      style={[styles.chip, guideIdx === i && styles.chipActive]}
                      onPress={() => setGuideIdx(i)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          guideIdx === i && styles.chipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {g.locationName || g.title}
                      </Text>
                    </Pressable>
                  ))}
          </ScrollView>

          {/* 우측 버튼 = 상황표(B-0): 보는 중 → [여정 보기] / 만드는 자리 → [영상 만들기].
              guide 모드 = 버튼 없음(guides 표에 여정 연결 열쇠가 없음 = 지어내지 않음). */}
          {viewMode === "itinerary" &&
            (viewing ? (
              <Pressable style={styles.topBtn} onPress={handleViewItinerary}>
                <Icon name="map" size={14} color="#FFFFFF" />
                <Text style={styles.topBtnText}>여정 보기</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.topBtn,
                  (isRequesting || dayVideo?.status === "processing") &&
                    styles.topBtnDisabled,
                ]}
                disabled={isRequesting || dayVideo?.status === "processing"}
                onPress={handleGenerate}
              >
                <Icon name="film" size={14} color="#FFFFFF" />
                <Text style={styles.topBtnText}>영상 만들기</Text>
              </Pressable>
            ))}

          {/* guide 모드 = 뷰어 자체 닫기(←)가 오른쪽 위에 있음 → X 대신 그 폭만큼 빈 자리를 확보
              (칩이 ← 밑으로 파고들어 오터치 나던 것 수정 = 2026-08-01 사장님 지적) */}
          {viewMode === "itinerary" ? (
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={8}
              // 아이콘뿐인 버튼 = 스크린리더용 이름 필수(CityBadge 와 같은 수준 = 2026-08-03 §22 판단검증)
              accessibilityRole="button"
              accessibilityLabel="닫기"
            >
              <Icon name="x" size={22} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={styles.closeBtn} pointerEvents="none" />
          )}
        </View>
      </View>
    </View>
  );
}

// 디자인(2026-08-01 사장님) = 스크린 완전 투명 + 콘텐츠 풀 채움. 알약 칩·버튼(플래너 토큰)만 위에 얹힘.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { flex: 1 },
  topRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  chips: { flex: 1, flexGrow: 1 },
  chipsContent: {
    gap: Spacing.sm,
    alignItems: "center",
    paddingRight: Spacing.sm,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    maxWidth: 140,
  },
  chipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chipText: { fontSize: 12, fontFamily: Fonts.bold, color: "#0F172A" },
  chipTextActive: { color: "#FFFFFF" },
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Brand.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    ...Shadows.card,
  },
  topBtnDisabled: { opacity: 0.5 },
  topBtnText: { color: "#FFFFFF", fontSize: 12, fontFamily: Fonts.bold },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  // 콘텐츠 프레임 = 화면 전체(투명 스크린 위 풀 채움). 컨테인 여백 = 뒤 화면이 어둡게 비침(투명).
  contentFrame: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
