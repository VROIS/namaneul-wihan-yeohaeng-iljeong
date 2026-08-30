// = 사장님 SSOT 2026-08-01: "껍데기 안에 숏폼 혹은 TRIPIS 콘텐츠를 끼우는 것" —
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
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { apiRequest, itineraryUrl } from "@/lib/query-client";
// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 공용 헬퍼(§16 5곳 공용).
import { parseCreditShortfall, useCreditShortfall } from "@/lib/creditError";
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
// 📥 저장(프로필 담기)·열람해제 = savedVideosApi 1벌(2026-08-03 사장님 확정 = 영상은 회사 자산, 저장 = 담기)
import { listSavedVideos, saveVideo, markVideoSeen } from "./savedVideosApi";
import { useMapToggle } from "@/contexts/MapToggleContext";

export interface RepCard {
  itineraryId: number | null;
  cityId: number;
  nameKo: string;
  nameEn: string;
  country: string | null;
  countryCode: string | null; // ⚠️ 수정금지(승인필요) 2026-08-20 = 국가명 영어변환용 ISO코드
  tagline: string;
  highlights: string[];
  dayCount: number;
  imageUrl: string | null;
  placeId: number | null;
  hasGuide: boolean;
  hasVideo: boolean;
  videoItineraryId: number | null;
  videoDay: number | null;
}

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

// ⚠️ 2026-08-03 사장님 확정 = `canGenerate` = **영상을 만들 수 있는 자리인가**(생성기 / 감상).
export type TripisOpenParams =
  | { mode: "city"; rep: RepCard }
  | {
      mode: "itinerary";
      itineraryId: number;
      day?: number;
      canGenerate?: boolean;
    }
  | { mode: "guide"; guides: GuideRow[]; index: number };

interface Props {
  visible: boolean;
  params: TripisOpenParams | null;
  onClose(): void;
}

export default function TripisModal({ visible, params, onClose }: Props) {
  if (!visible || !params) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TripisModalInner params={params} onClose={onClose} />
    </Modal>
  );
}

function TripisModalInner({
  params,
  onClose,
}: {
  params: TripisOpenParams;
  onClose(): void;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const showCreditShortfall = useCreditShortfall();

  const [viewMode, setViewMode] = useState<TripisOpenParams["mode"]>(
    params.mode,
  );

  const [itinerary, setItinerary] = useState<any | null>(null);
  const [videoByDay, setVideoByDay] = useState<Record<string, DayVideo>>({});
  const [selectedDay, setSelectedDay] = useState<number | null>(
    params.mode === "itinerary" ? (params.day ?? null) : null,
  );
  const [isRequesting, setIsRequesting] = useState(false);
  const [savedDays, setSavedDays] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const { bumpVideoData, isAuthed, requestLogin } = useMapToggle();

  const [itineraryId, setItineraryId] = useState<number | null>(
    params.mode === "itinerary"
      ? params.itineraryId
      : params.mode === "city"
        ? params.rep.itineraryId
        : null,
  );

  const loadAll = useCallback(async () => {
    if (itineraryId == null || viewMode !== "itinerary") return;
    try {
      // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 화면 언어를 넘겨 서버가 슬롯 해설을 (place_id, 언어) 캐시로 이어붙임(제미니 호출 0).
      // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = URL 생성 = itineraryUrl() 공용(§16, useTripPlanner.ts 와 중복 제거).
      const [ir, vr] = await Promise.all([
        apiRequest("GET", itineraryUrl(itineraryId, i18n.language)),
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
  // ⚠️ 2026-08-03 사장님 확정 = 칩은 **여는 곳에 따라 다르다**(한 줄로 두 경우를 다 덮지 않는다).
  const canGenerate =
    params.mode === "itinerary" && params.canGenerate === true;
  const succeededDays = Object.keys(videoByDay)
    .filter((k) => videoByDay[k]?.status === "succeeded")
    .map(Number)
    .sort((a, b) => a - b);
  const dayNumbers = canGenerate ? days.map((_, i) => i + 1) : succeededDays;
  const effectiveDay = selectedDay ?? dayNumbers[0] ?? 1;
  const dayVideo = videoByDay[String(effectiveDay)];
  const slots: any[] = days[effectiveDay - 1]?.places || [];
  const viewing =
    viewMode === "itinerary" &&
    dayVideo?.status === "succeeded" &&
    !!dayVideo.url;

  useEffect(() => {
    if (!canGenerate || itineraryId == null) return;
    let alive = true;
    listSavedVideos().then((rows) => {
      if (!alive) return;
      setSavedDays(
        new Set(
          rows.filter((r) => r.itineraryId === itineraryId).map((r) => r.day),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [canGenerate, itineraryId]);

  useEffect(() => {
    if (!viewing || itineraryId == null) return;
    markVideoSeen(itineraryId, effectiveDay).then(bumpVideoData);
  }, [viewing, itineraryId, effectiveDay, bumpVideoData]);

  const handleGenerate = async () => {
    if (itineraryId == null) return;
    // 🔒 수정금지(승인필요) 2026-08-05 사장님 SSOT = 영상 만들기 = 로그인 필수(+60크레딧은 서버 1벌).
    if (!isAuthed) {
      onClose();
      requestLogin();
      return;
    }
    setIsRequesting(true);
    try {
      // ⚠️ 수정금지(승인필요) 2026-08-05 = apiRequest 가 !ok 응답을 이미 throw 하므로(query-client.ts
      await apiRequest(
        "POST",
        `/api/itineraries/${itineraryId}/video/generate`,
        // 2026-08-22 사장님 승인 = 영상 다국어 = 앱 언어 동봉(서버 미지원값 = ko 처리)
        { day: effectiveDay, language: i18n.language },
      );
      await loadAll();
    } catch (e: any) {
      // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 공용 헬퍼(§16 5곳 공용).
      const shortfall = parseCreditShortfall(e?.message);
      if (shortfall) {
        showCreditShortfall(shortfall, onClose);
      } else {
        Alert.alert(
          t("tripisVideo.generateAlertTitle"),
          e.message || t("tripisVideo.generateAlertGeneric"),
        );
      }
    } finally {
      setIsRequesting(false);
    }
  };

  // 📥 [저장] = 나의 프로필에 담기 (생성기 전용, 2026-08-03 사장님 확정 = 기기 다운로드 아님)
  const handleSave = async () => {
    if (itineraryId == null) return;
    setIsSaving(true);
    const r = await saveVideo(itineraryId, effectiveDay);
    setIsSaving(false);
    if (r.ok)
      setSavedDays((prev) => new Set(prev).add(effectiveDay)); // → "저장됨" 비활성
    else
      Alert.alert(
        t("common.save"),
        r.error || t("tripisVideo.saveAlertFailGeneric"),
      ); // 서버 사유 그대로(뭉개기 금지)
  };

  const handleViewItinerary = () => {
    if (itineraryId == null) return;
    onClose();
    navigation.navigate("Main", {
      screen: "Home",
      params: { itineraryId },
    } as any);
  };

  // ⚠️ 수정금지(승인필요) 2026-08-20 사장님 승인 = [해설 만들기]를 관리자 전용에서 누구나(로그인만)로 확장.
  const handleOpenGuide = (placeId: number, hasGuide: boolean) => {
    if (!hasGuide && !isAuthed) {
      onClose();
      requestLogin();
      return;
    }
    onClose();
    openGuideForPlace(
      navigation,
      placeId,
      hasGuide ? "sample" : { isAuthed, requestLogin },
    );
  };

  const currentGuide =
    params.mode === "guide" ? params.guides[params.index] : undefined;

  //   배지 3단(영상·해설·코스) = 셋 다 같은 흐름 = 카드는 사라지고 화면만 갈린다(2026-08-02 사장님).
  if (viewMode === "city" && params.mode === "city") {
    return (
      <CityCardScreen
        rep={params.rep}
        onCreateTrip={onClose}
        onVideo={() => {
          if (params.rep.videoItineraryId != null) {
            setItineraryId(params.rep.videoItineraryId);
            setSelectedDay(params.rep.videoDay);
          }
          setViewMode("itinerary");
        }}
        // [해설]·[해설 만들기] = **같은 곳** = 가이드 미니앱 해설 화면을 그 장소번호로 연다(2026-08-02 사장님 확정).
        onGuide={() => {
          if (params.rep.placeId !== null)
            handleOpenGuide(params.rep.placeId, params.rep.hasGuide);
        }}
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
              <VideoPlaySlot
                key={effectiveDay}
                itineraryId={itineraryId}
                day={effectiveDay}
                dayVideo={dayVideo}
                hasSlots={slots.length > 0}
                canGenerate={canGenerate}
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
            <GuideViewSlot
              key={currentGuide.id}
              guide={currentGuide}
              onClose={onClose}
            />
          ) : null}
        </View>

        {/* 상단 줄 = **영상(itinerary) 모드 전용** = 날짜 칩 + [영상 만들기]/[여정 보기] + [X].
            ⚠️ 2026-08-03 사장님 지시 = 해설(guide) 모드에서는 이 줄을 **완전삭제**(§19).
              사유 = ① 장소명은 뷰어가 자체 입력창 형태로 이미 보여준다 = 칩줄은 같은 정보 두 벌
                     ② 이 줄이 뷰어의 ←(우측상단)를 zIndex 10 으로 덮어 **닫기가 먹통**이 됐다
                        (DevTools elementsFromPoint 실측 = 맨 위 DIV 502x52 z=10).
              → 줄 자체를 안 그리니 미니앱으로 여는 다른 화면과 완전히 같은 모양·같은 동작이 된다. */}
        {viewMode === "itinerary" && (
          <View
            pointerEvents="box-none"
            style={[styles.topRow, { paddingTop: insets.top + Spacing.sm }]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chips}
              contentContainerStyle={styles.chipsContent}
            >
              {dayNumbers.map((d) => {
                const st = videoByDay[String(d)]?.status;
                return (
                  <Pressable
                    key={d}
                    style={[
                      styles.chip,
                      effectiveDay === d && styles.chipActive,
                    ]}
                    onPress={() => setSelectedDay(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: effectiveDay === d }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        effectiveDay === d && styles.chipTextActive,
                      ]}
                    >
                      {t("tripisVideo.dayChip", { d })}
                      {st === "succeeded"
                        ? " ✓"
                        : st === "processing"
                          ? " …"
                          : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 우측 버튼 = 상황표(2026-08-03 사장님 확정):
                · 생성기 + 완성 영상 보는 중 → **[저장]**(나의 프로필에 담기 / 담긴 날 = [저장됨] 비활성).
                  옛 [여정 보기]는 생성기에서 삭제 §19 = 모달 뒤가 이미 그 여정(닫기만 하면 됨).
                · 뷰(도시 대표카드·프로필) + 보는 중 → [여정 보기] = 지금 그대로.
                · 생성기 + 미완성 날 → [영상 만들기]. 감상 자리에서는 만들기 버튼 자체가 없다. */}
            {viewing && canGenerate ? (
              savedDays.has(effectiveDay) ? (
                <View style={[styles.topBtn, styles.topBtnDisabled]}>
                  <Icon name="check" size={14} color="#FFFFFF" />
                  <Text style={styles.topBtnText}>
                    {t("tripisVideo.savedLabel")}
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.topBtn, isSaving && styles.topBtnDisabled]}
                  disabled={isSaving}
                  onPress={handleSave}
                >
                  <Icon name="bookmark" size={14} color="#FFFFFF" />
                  <Text style={styles.topBtnText}>{t("common.save")}</Text>
                </Pressable>
              )
            ) : viewing ? (
              <Pressable style={styles.topBtn} onPress={handleViewItinerary}>
                <Icon name="map" size={14} color="#FFFFFF" />
                <Text style={styles.topBtnText}>
                  {t("tripisVideo.viewItineraryBtn")}
                </Text>
              </Pressable>
            ) : canGenerate ? (
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
                <Text style={styles.topBtnText}>
                  {t("tripisVideo.generateBtn")}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Icon name="x" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
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
  contentFrame: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
