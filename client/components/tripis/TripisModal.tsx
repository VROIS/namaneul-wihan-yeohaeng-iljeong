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
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { apiRequest } from "@/lib/query-client";
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

// GET /api/cities/:id/representative 응답 1벌 (B2). 이 칸들 = 도시 카드가 그리는 전부.
// = 대표여정이 없는 도시도 서버가 도시 DB 로 채워 내려준다 → itineraryId=null·dayCount=0·hasVideo=false (2026-08-02).
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
// ⚠️ 2026-08-03 사장님 확정 = `canGenerate` = **영상을 만들 수 있는 자리인가**(생성기 / 감상).
//   여는 쪽이 선언한다 = 모달이 추측하지 않는다. 지금 만들 수 있는 곳은 **여정 결과화면 하나뿐**이고,
//   도시 대표카드·프로필 '나의 TRIPIS' 는 **감상(뷰)** 이다(사장님: "이 뷰는 프로필에도 해당함").
//   칩줄이 이 값으로 갈린다 = 생성기: 전체 일차 / 뷰: 영상이 있는 날만.
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
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const showCreditShortfall = useCreditShortfall();

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
  // 📥 생성기 [저장] 상태 = 이 여정에서 내가 이미 담은 날짜들(담긴 날 = "저장됨" 비활성)
  const [savedDays, setSavedDays] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  // 완성 영상 열람 = ★·탭 뱃지 즉시 갱신 신호(전문가 신호와 동일 패턴 §16)
  // 🔒 2026-08-05 = isAuthed/requestLogin = [영상 만들기] 로그인 관문용(판정은 전역 1곳).
  const { bumpVideoData, isAuthed, requestLogin } = useMapToggle();

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
  // ⚠️ 2026-08-03 사장님 확정 = 칩은 **여는 곳에 따라 다르다**(한 줄로 두 경우를 다 덮지 않는다).
  //   · **감상(도시 대표카드로 열림)** = 남의(관리자) 여정을 보는 것 = **영상이 있는 날만**.
  //     사장님 실기기 확인: 브뤼셀만 1·2·3일차, 다른 도시는 만들어진 그 날짜만. 없는 날 칩을 보여줘도
  //     그 사람은 만들 수 없으니 헛것이다.
  //   · **내 여정(프로필 영상 카드·여정 결과화면)** = 만들 수 있는 자리 = **전체 일차**.
  //     옛 영상 생성기(client/screens/video, 2026-08-03 삭제)가 `days.map()` 으로 전부 그리던 그대로 = 원본 복원(§16).
  //     이게 없으면 아직 안 만든 2·3일차를 **고를 수가 없어 영영 못 만든다**(생성 진입점 = 이 화면 하나뿐).
  //   완성 여부 표시(✓ / …)는 두 경우 공통 = 원본과 동일.
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
  // "보는 중" 판정 = 그 날짜 영상 완성 + url 존재 → 우측 버튼이 [저장](생성기)/[여정 보기](뷰)로 바뀜
  const viewing =
    viewMode === "itinerary" &&
    dayVideo?.status === "succeeded" &&
    !!dayVideo.url;

  // 📥 생성기 = 내가 이미 담은 날짜 목록 1회 로드 ([저장]/[저장됨] 갈림용. 뷰에서는 안 부름 = 뷰는 지금 그대로)
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

  // 📥 완성 영상을 실제로 보는 순간 = ★·탭 뱃지 해제(사장님 SSOT = "이 영상 뷰를 1회 열 때부터 해제").
  //   프로필 카드·생성기 어느 길로 열어도 이 1곳이 처리(§0). 담긴 행이 없으면 서버가 0행 갱신 = 무해.
  useEffect(() => {
    if (!viewing || itineraryId == null) return;
    markVideoSeen(itineraryId, effectiveDay).then(bumpVideoData);
  }, [viewing, itineraryId, effectiveDay, bumpVideoData]);

  // 일별 생성 요청 = 함수 소유는 껍데기(상단 버튼 + 본문 버튼이 같은 함수 1벌 §0)
  const handleGenerate = async () => {
    if (itineraryId == null) return;
    // 🔒 수정금지(승인필요) 2026-08-05 사장님 SSOT = 영상 만들기 = 로그인 필수(+60크레딧은 서버 1벌).
    //   상단(:421)·본문(:320) 두 버튼이 이 함수 1벌만 타므로 여기 1곳이면 앱 전체가 덮인다.
    //   이 화면은 최상위 Modal 이라 로그인 팝업(또 다른 Modal)을 덮는다 = 먼저 닫는다(크레딧부족과 같은 순서).
    if (!isAuthed) {
      onClose();
      requestLogin();
      return;
    }
    setIsRequesting(true);
    try {
      // ⚠️ 수정금지(승인필요) 2026-08-05 = apiRequest 가 !ok 응답을 이미 throw 하므로(query-client.ts
      //   throwIfResNotOk) 여기서 r.ok 를 다시 검사하는 옛 코드는 죽은 코드였다(§19 삭제).
      await apiRequest(
        "POST",
        `/api/itineraries/${itineraryId}/video/generate`,
        // 2026-08-22 사장님 승인 = 영상 다국어 = 앱 언어 동봉(서버 미지원값 = ko 처리)
        { day: effectiveDay, language: i18n.language },
      );
      await loadAll();
    } catch (e: any) {
      // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 공용 헬퍼(§16 5곳 공용).
      //   옛 버그 = err.error(기계코드 "insufficient_credits")를 그대로 노출하던 것 §19 폐기.
      const shortfall = parseCreditShortfall(e?.message);
      if (shortfall) {
        // 이 화면은 최상위 Modal = 안 닫으면 프로필로 가도 계속 덮는다([여정 보기]:258 과 같은 순서).
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
  // ⚠️ 수정금지(승인필요) 2026-08-20 사장님 승인 = [해설 만들기]를 관리자 전용에서 누구나(로그인만)로 확장.
  //   hasGuide=true(듣기, 창고에 이미 있음=외부호출 0) = 계속 미가입자도 개방("sample").
  //   hasGuide=false(만들기, 새 Gemini 호출 발생) = 이제부터 진짜 로그인 관문(isAuthed/requestLogin)을 태운다
  //   = 서버(guide-routes.ts:78-84)가 어차피 비로그인 401 이라, 관문 없이 열면 눌러도 조용히 실패해 보임.
  const handleOpenGuide = (placeId: number, hasGuide: boolean) => {
    // 🔒 [영상 만들기](:224-228)와 같은 순서 = 이 화면이 최상위 Modal 이라 로그인 팝업을 덮는다 = 먼저 닫는다.
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

  // 보여줄 해설 = 프로필에서 누른 그 카드 1건(칩줄 폐기 = 2026-08-03 §19, 아래 상단줄 주석 참조)
  const currentGuide =
    params.mode === "guide" ? params.guides[params.index] : undefined;

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
          if (params.rep.placeId !== null)
            handleOpenGuide(params.rep.placeId, params.rep.hasGuide);
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
            // key=콘텐츠 id = 칩 전환 시 뷰어 새 마운트(낭독·하이라이트 처음부터)
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
                // 완성 ✓ / 만드는 중 … / 아직 없음 = 표시 없음 (옛 영상 생성기와 같은 규칙)
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
              // 아이콘뿐인 버튼 = 스크린리더용 이름 필수(CityBadge 와 같은 수준 = 2026-08-03 §22 판단검증)
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
  // 콘텐츠 프레임 = 화면 전체(투명 스크린 위 풀 채움). 컨테인 여백 = 뒤 화면이 어둡게 비침(투명).
  contentFrame: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
