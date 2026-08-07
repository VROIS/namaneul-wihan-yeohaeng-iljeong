// ⚠️ 사장님 SSOT 2026-07-29 = 전문가(현지 전문가 문의) 기능 = 사용자 & 전문가 3대 미세조정(개별삭제, 선택강조, 여정정보 내장) 완벽 반영
//   AI의견과 동일 패턴 = 별도 탭 화면(react-navigation) 폐기 §19 → 부모 모달 안에서 내부 상태머신(setView)으로 home↔detail↔profileEdit 전환.
//   내부 전환 = react-navigation 안 씀(§16 재사용) = setView 만. 외부 = onOpenItinerary(여정 복원)·onClose(시트 닫기)·onRequestLogin(로그인).
//   home = 역할별(전문가/관리자 = 답변함 / 사용자 = 문의작성 + 내문의함). detail = 문의상세(말풍선 + 전문가 답변입력). profileEdit = 전문가 프로필 편집.
//   로직 = 문의작성(로그인가드·여정자동저장·웹세이프) + 답변(웹세이프·답변완료 editing 게이트) 모두 이 파일에 인라인(§16 단일벌). i18n = expert.* 기존 키만.
//   시트 자체 헤더(제목·X)는 부모 모달이 제공 = 여기선 각 내부뷰의 서브헤더(← 뒤로)만. 상단 SafeArea = 부모 담당 / 하단 insets 만 사용.
// 2026-07-15 §0 슬림화 = 하위 뷰(DetailView·ProfileEditView)·스타일 = 같은 폴더 안 별도 파일로 순수 이동(리팩토링 금지, JSX·로직·주석 그대로).
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Colors, Spacing, Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useMapToggle } from "@/contexts/MapToggleContext";
// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족 공용 헬퍼(§16 5곳 공용).
//   이 파일은 내부 화면전환(home/detail/profileEdit)에 react-navigation을 안 쓴다(주석 §2 참조).
//   "충전 화면으로 나가는" 외부 이동도 이 훅이 통째로 맡으므로 여기서는 navigation 을 직접 만지지 않는다.
import { useCreditShortfall } from "@/lib/creditError";
import {
  submitInquiry,
  saveItineraryForInquiry,
  listInquiries,
  deleteInquiry,
  getMyRole,
  getExpertProfile,
  type Inquiry,
  type InquiryStatus,
  type ExpertProfile,
} from "./expertApi";
import { getUserData } from "@/lib/auth"; // 문의 전 로그인 확인(비로그인=로그인 안내)
import DetailView from "./components/DetailView";
import ProfileEditView from "./components/ProfileEditView";
// 목록 화면 = 전문가·사용자 공용 1벌(2026-08-07 §0). DetailView·ProfileEditView 와 같은 분리 패턴.
import InquiryListView from "./components/InquiryListView"; // 목록(칩+카드) 1벌 = 전문가·사용자 공용(2026-08-07 §0)
import { styles } from "./styles";

// 전문가 문의 크레딧 = AI 의견과 동일 방식으로 사전 안내(2026-07-13). 실제 차감은 로그인 정식화 후(§9 프로모션).
const EXPERT_INQUIRY_CREDIT_COST = 10;

// ⚠️ 사장님 SSOT 2026-07-14 = 시트 내부 화면 = react-navigation 아님 = 상태머신 1개(setView)로 전환.
type SheetView =
  | { kind: "home" }
  | { kind: "detail"; id: string }
  | { kind: "profileEdit" };

interface ExpertSheetProps {
  onClose: () => void; // 시트 닫기(부모가 모달 숨김 → 여정으로 복귀)
  onOpenItinerary: (itineraryId: number) => void; // [여정 전체 보기] = 부모가 시트 닫고 그 여정 복원(배경 전환)
  // ⚠️ 사장님 SSOT 2026-07-14 = 문의 카드 누름 = 그 여정을 배경에 복원(시트는 열린 채) = 실제 여정 보며 답변(사용자 프로필카드 클릭과 동일). 중간 요약카드 불필요.
  onRestoreBackground?: (itineraryId: number) => void;
  onRequestLogin?: () => void; // 로그인 필요 시 부모가 로그인 화면으로(없으면 onClose 폴백 = 프로필서 로그인)
  // ⚠️ 2026-08-07 사장님 SSOT = 시트 헤더(제목 자리) = 전문가 본인 사진. 역할·프로필은 이 파일이 이미 조회하므로
  //   부모가 또 조회하지 않도록(§0 = 같은 조회 2벌 금지) 결과만 위로 올린다. 전문가 아니면 null.
  onHeaderChange?: (
    h: {
      avatarUrl?: string;
      nickname?: string;
      /** 전문가·관리자만 = 프로필 편집. 사용자는 없음(터치 동작 X) */
      onPress?: () => void;
    } | null,
  ) => void;
}

// ⚠️ 사장님 SSOT 2026-07-14 = 답변함 필터 = 전체/답변대기/답변완료 (검토중·반려 완전 삭제 §19 = 그 상태로 갈 방법이 없어짐).
type Filter = "all" | InquiryStatus;
const FILTERS: Filter[] = ["all", "pending", "answered"];

export default function ExpertSheet({
  onClose,
  onOpenItinerary,
  onRestoreBackground,
  onRequestLogin,
  onHeaderChange,
}: ExpertSheetProps) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const showCreditShortfall = useCreditShortfall();
  // ⚠️ 실제 저장 여정 id = currentItineraryId(별도) = Itinerary 타입엔 id 없음. 이걸 써야 FK 연결됨.
  const {
    currentItinerary,
    currentItineraryId,
    setCurrentItinerary,
    bumpExpertData,
    expertOpenPayload,
    clearExpertOpenPayload,
  } = useMapToggle();

  // 내부 화면 전환(§16 = react-navigation 대신 상태머신).
  const [view, setView] = useState<SheetView>({ kind: "home" });

  // 역할 = expert/admin 이면 답변함(+토글로 사용자 화면 열람), user 면 문의작성만. null=조회중.
  const [isExpert, setIsExpert] = useState<boolean | null>(null);
  // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 = 상단 토글로 사용자(문의작성)↔전문가(답변함) 수동 전환(admin 도 사용자 화면 열람). 사용자는 토글 없음.
  const [viewMode, setViewMode] = useState<"user" | "expert">("user");

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  // ⚠️ 2026-07-24 사장님 승인 = 일별 [바로 예약하기] = 시트를 예약 작성 모드(Day n)로 오픈.
  //   SnapSheet 는 닫히면 언마운트 = 열릴 때마다 fresh 마운트 → payload 를 마운트 1회 소비 후 clear(다음 일반 열기 오염 방지).
  const [bookingDay, setBookingDay] = useState<number | null>(null);
  const bookingRef = useRef(false);
  useEffect(() => {
    if (expertOpenPayload?.mode === "booking") {
      bookingRef.current = true;
      setBookingDay(expertOpenPayload.day);
      setViewMode("user"); // admin/expert 진입도 예약이면 작성뷰(답변함 아님)
      clearExpertOpenPayload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회 소비(재실행 = 오염)
  }, []);
  // 전문가 본인 프로필(닉네임/경력/자기소개/캐릭터) = 소개카드 반영. 없으면 i18n 기본문구 폴백.
  const [profile, setProfile] = useState<ExpertProfile | null>(null);

  // 마운트 가드 = 액션 후 reload 가 언마운트 후 setState 방지.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // home 진입 시 1회 = 역할 + 목록 + 프로필 조회(옛 useFocusEffect 폐기 §19 = 시트는 포커스 개념 없음, mount + 액션 후 reload 로 갱신).
  const reload = useCallback(() => {
    listInquiries()
      .then((r) => {
        if (mounted.current) setInquiries(r);
      })
      .catch(() => {
        if (mounted.current) setInquiries([]);
      });
  }, []);
  useEffect(() => {
    let alive = true;
    getMyRole()
      .then((role) => {
        if (!alive) return;
        const expert = role === "expert" || role === "admin";
        setIsExpert(expert);
        // 진입 기본 = 실제 역할(전문가면 답변함 먼저). 단 예약 모드 진입이면 user 유지(2026-07-24). 이후 상단 토글로 자유 전환.
        setViewMode(expert && !bookingRef.current ? "expert" : "user");
      })
      .catch(() => {
        if (alive) {
          setIsExpert(false);
          setViewMode("user");
        }
      });
    listInquiries()
      .then((r) => {
        if (alive) setInquiries(r);
      })
      .catch(() => {
        if (alive) setInquiries([]);
      });
    getExpertProfile()
      .then(({ profile }) => {
        if (alive) setProfile(profile);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ⚠️ 2026-08-07 사장님 SSOT = 시트 헤더 = (글자 제목 삭제) 전문가 사진 1개.
  //   · 전문가·관리자 = 본인 사진, 터치 = 프로필 편집
  //   · 사용자 = 같은 전문가 사진(누구에게 묻는지 = 이 시트의 얼굴), 터치 동작 없음(편집 권한 없음)
  //   여기 조회 결과를 그대로 재사용 = 부모 재조회 0(§0).
  useEffect(() => {
    if (!onHeaderChange || isExpert === null) return;
    onHeaderChange({
      avatarUrl: profile?.avatarUrl,
      nickname: profile?.nickname || t("expert.introName"),
      onPress: isExpert ? () => setView({ kind: "profileEdit" }) : undefined,
    });
    // 시트가 닫히면 이 컴포넌트는 언마운트되지만 부모(오버레이)는 전역 상주 = 헤더를 비워야
    // 계정을 바꿔 다시 열었을 때 **옛 사람 얼굴**이 남지 않는다(§22 판단검증 2026-08-07).
    return () => onHeaderChange(null);
  }, [isExpert, profile, onHeaderChange, t]);

  const itin: any = currentItinerary;
  const totalPlaces =
    itin?.days?.reduce((s: number, d: any) => s + (d.places?.length || 0), 0) ||
    0;
  const aiOpinion =
    itin?.rawData?.verification?.result?.feasibility?.verdict ||
    itin?.rawData?.verification?.result?.summary ||
    null;

  // ⚠️ 2026-07-14 = 웹(WebView)에서 버튼 있는 Alert.alert 이 안 떠서 "눌러도 반응 없음"(사장님 지적). 웹 = window.confirm/alert, 앱 = Alert.alert(§19).
  const goLoginPrompt = () => {
    // 시트 = navigation 없음 = 로그인 수락 시 부모 콜백(onRequestLogin) 호출 → 없으면 onClose 폴백(사용자는 프로필서 로그인).
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(`${t("expert.loginTitle")}\n\n${t("expert.loginMsg")}`)
      )
        (onRequestLogin ?? onClose)();
    } else {
      Alert.alert(t("expert.loginTitle"), t("expert.loginMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("expert.goLogin"),
          onPress: () => (onRequestLogin ?? onClose)(),
        },
      ]);
    }
  };
  const notify = (title: string, msg?: string) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined")
        window.alert(msg ? `${title}\n\n${msg}` : title);
    } else Alert.alert(title, msg);
  };

  // ── 사용자: 문의 접수(로그인가드·여정자동저장·웹세이프 = 이 파일 인라인 §16) ──
  const onSubmit = async () => {
    if (!message.trim() || submitting) return;
    // ⚠️ 사장님 SSOT 2026-07-14 = 문의 전 로그인 확인 = 비로그인(또는 게스트)이면 서버 400 대신 즉시 로그인 안내(§19).
    const user = await getUserData();
    if (
      !user ||
      !user.token ||
      !user.token.startsWith("simple_auth_token_v1_")
    ) {
      goLoginPrompt();
      return;
    }
    setSubmitting(true);
    try {
      // ⚠️ 사장님 SSOT 2026-07-14 = 여정이 화면에 있는데 아직 저장 안 됐으면(currentItineraryId null) 문의 전에 BE에 저장해 id 확보 → 문의가 그 여정 id에 연결(restore-by-id 원본 열람). 옛(미저장=여정 안 보임) 폐기 §19.
      let linkedId = currentItineraryId ?? null;
      if (itin && !linkedId) {
        linkedId = await saveItineraryForInquiry(itin);
        if (linkedId) setCurrentItinerary(itin, linkedId); // 재문의 시 중복 저장 방지(같은 여정 + 새 id)
      }
      const isBooking = bookingDay != null; // 예약 모드(2026-07-24) = kind/dayNumber 동반
      const r = await submitInquiry({
        userMessage: message.trim(),
        // 목록카드용 요약(전문가는 여정 id로 restore-by-id = DB 원본 열람). 스냅샷 폐기 §19.
        itineraryData: itin
          ? {
              destination: itin.destination,
              dayCount: itin.days?.length ?? 0,
              totalPlaces,
              aiOpinion,
              ...(isBooking ? { bookingDay } : {}),
            }
          : null,
        itineraryId: linkedId, // 저장된 여정 id 연결(FK)
        kind: isBooking ? "booking" : "expert",
        dayNumber: isBooking ? bookingDay : null,
      });
      if (r.ok) {
        // ⚠️ 사장님 SSOT 2026-07-14 = 문의 전송 완료 = 목적 달성 = 시트 자동 내려감(onClose) → 배경 여정 복귀(AI의견과 동일). X는 사용자가 인위적으로 닫을 때만.
        //   + bumpExpertData() = 하단 탭 배지 즉시 갱신 = 사용자가 "내 문의 접수됨"을 실시간으로 인식.
        setMessage("");
        bumpExpertData();
        notify(
          t(isBooking ? "expert.bookingSentTitle" : "expert.sentTitle"),
          t(isBooking ? "expert.bookingSentMsg" : "expert.sentMsg"),
        );
        onClose();
      } else if (r.error === "login_required") {
        goLoginPrompt();
      } else if (r.error === "insufficient_credits" && r.shortfall) {
        // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 공용 헬퍼(§16 5곳 공용).
        //   시트를 먼저 닫는다 = 안 닫으면 프로필로 가도 이 시트가 계속 덮는다(성공:256·로그인 경로와 같은 순서).
        showCreditShortfall(r.shortfall, onClose);
      } else {
        notify(t("common.error"), t("expert.sendError"));
      }
    } catch (e) {
      // ⚠️ 2026-07-14 = fetch throw(네트워크 실패) 시 조용히 무반응 되던 것 = 오류 표시(§19).
      notify(t("common.error"), t("expert.sendError"));
    } finally {
      setSubmitting(false);
    }
  };

  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 사용자 새 문의 = 여정 생성 후에만(크레딧 10 보호 §9).
  //   배지(도착한 답변) 열람으로 여정 없이 들어온 사용자 = 목록·상세는 그대로, "작성"만 잠금 + 사유 안내.
  //   전문가/관리자(차감 면제)·예약 모드(여정 화면에서만 진입)는 잠금 없음.
  const composeLocked = !itin && isExpert !== true && bookingDay == null;
  const canSubmit = !!message.trim() && !submitting && !composeLocked;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ⚠️ 문의 개별 삭제 핸들러
  const handleDeleteInquiry = useCallback(
    (id: string) => {
      const doDelete = async () => {
        const ok = await deleteInquiry(id);
        if (ok) {
          setInquiries((prev) => prev.filter((q) => q.id !== id));
          if (selectedId === id) setSelectedId(null);
          bumpExpertData();
        } else {
          notify(t("common.error"), t("expert.deleteError"));
        }
      };

      if (Platform.OS === "web") {
        if (
          typeof window !== "undefined" &&
          window.confirm("이 문의 내역을 삭제하시겠습니까?")
        ) {
          doDelete();
        }
      } else {
        Alert.alert("문의 삭제", "이 문의 내역을 삭제하시겠습니까?", [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: doDelete,
          },
        ]);
      }
    },
    [bumpExpertData, selectedId, t],
  );

  // ⚠️ 문의 카드 누름 = 그 문의의 여정을 배경에 복원 + 상세 뷰로 전환 + 선택 강조 State
  const openInquiry = (q: Inquiry) => {
    setSelectedId(q.id);
    if (q.itineraryId && onRestoreBackground)
      onRestoreBackground(q.itineraryId);
    setView({ kind: "detail", id: q.id });
  };

  // ── 내부 라우팅 = 상세/프로필편집이면 해당 뷰만 렌더 ──
  if (view.kind === "detail") {
    return (
      <DetailView
        id={view.id}
        theme={theme}
        colorScheme={colorScheme}
        insets={insets}
        t={t}
        onBack={() => {
          setView({ kind: "home" });
          reload();
        }}
        onClose={onClose}
        onOpenItinerary={onOpenItinerary}
      />
    );
  }
  if (view.kind === "profileEdit") {
    return (
      <ProfileEditView
        theme={theme}
        insets={insets}
        t={t}
        onBack={() => setView({ kind: "home" })}
      />
    );
  }

  // ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = 전문가/관리자 + expert 모드 = 답변함. 목록은 InquiryListView 1벌(사용자와 공용).
  //   옛 상단 토글(문의하기↔답변함) 완전삭제 §19 = **테스트용이었음**(사장님 확인). 제목줄("답변함"+프로필아이콘)도 함께 삭제
  //   = 시트 헤더의 사진 1개로 대체(위 onHeaderChange) = 머리 3층 → 1층 = 목록이 그만큼 더 보임.
  //   viewMode 는 유지 = [바로 예약하기]로 들어오면 전문가·관리자도 작성뷰로 열려야 함(2026-07-24 예약 경로).
  if (isExpert && viewMode === "expert") {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            padding: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <InquiryListView
            inquiries={inquiries}
            filter={filter}
            setFilter={setFilter}
            filters={FILTERS}
            selectedId={selectedId}
            theme={theme}
            t={t}
            emptyText={t("expert.inboxNoItems")}
            onOpenInquiry={openInquiry}
            onDeleteInquiry={handleDeleteInquiry}
          />
        </ScrollView>
      </View>
    );
  }

  // 사용자(또는 admin 이 user 모드로 전환) = 문의작성 + 내문의함(사용자 모드 = 이 파일 인라인).
  return (
    <View style={styles.container}>
      {/* 옛 상단 토글(문의하기↔답변함) 삭제 = 2026-08-07 §19. 제목·X = 부모 시트 헤더. */}
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = **전문가 소개 문구는 사용자에게 중요**(누구에게 묻는지).
            헤더 사진 바로 아래 이름·경력·자기소개만 남긴다(옛 소개카드의 아바타·박스는 헤더 사진과 중복이라 삭제 §19).
            전문가·관리자 화면에는 안 보인다(= 본인 소개를 본인이 볼 이유 없음, 사장님 확정). */}
        <View style={{ marginBottom: Spacing.md }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {profile?.nickname || t("expert.introName")}
          </Text>
          <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
            {profile?.career || t("expert.introDesc")}
          </Text>
          {profile?.bio ? (
            <Text
              style={[styles.cardBio, { color: theme.textTertiary }]}
              numberOfLines={3}
            >
              {profile.bio}
            </Text>
          ) : null}
        </View>

        {/* ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = **문의 입력창·보내기 = 이 화면의 핵심** = 열자마자 보이는 자리(목록 위).
            옛 순서(목록 먼저·작성은 맨 아래 = 2026-07-15) 폐기 §19 = 문의가 쌓일수록 핵심 버튼이 스크롤 밑으로 묻혔다(사장님 지적).
            질문 입력 — 예약 모드(bookingDay)면 예약 라벨/플레이스홀더(2026-07-24) */}
        <Text
          style={[
            styles.sectionTitle,
            { color: theme.text, marginTop: Spacing.md },
          ]}
        >
          {bookingDay != null
            ? t("expert.bookingDayLabel", { day: bookingDay })
            : t("expert.questionLabel")}
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundDefault, color: theme.text },
          ]}
          placeholder={
            bookingDay != null
              ? t("expert.bookingPlaceholder")
              : t("expert.questionPlaceholder")
          }
          placeholderTextColor={theme.textTertiary}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        {composeLocked ? (
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
            {t("expert.noItinerary")}
          </Text>
        ) : null}
        <Pressable
          style={[
            styles.submitBtn,
            { backgroundColor: Brand.primary, opacity: canSubmit ? 1 : 0.5 },
          ]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Icon name="send" size={18} color="#FFF" />
          )}
          <Text style={styles.submitText}>{t("expert.submit")}</Text>
        </Pressable>
        {/* 크레딧 안내 = AI 의견 팝업과 동일 패턴. 실제 차감은 로그인 정식화 후(§9). */}
        <Text style={[styles.creditNote, { color: theme.textTertiary }]}>
          {t("expert.creditNote", { count: EXPERT_INQUIRY_CREDIT_COST })}
        </Text>

        <View style={[styles.divider, { borderTopColor: theme.border }]} />

        {/* 지난 문의 목록 = 작성창 아래. 전문가 답변함과 **같은 구성**(칩 + 공용 카드).
            옛것 완전삭제 §19: 나의예약/내문의함 2섹션(= 상태칩 1벌로 통일, 예약 우선 노출은
            InquiryListView 정렬이 이어받음) · renderUserCard(= InquiryCard 1벌로 통합). */}
        <InquiryListView
          inquiries={inquiries}
          filter={filter}
          setFilter={setFilter}
          filters={FILTERS}
          selectedId={selectedId}
          theme={theme}
          t={t}
          emptyText={t("expert.inboxEmpty")}
          showUnread /* 사용자 목록만 = 도착한 답변 안읽음 점(전문가 답변함은 뜻이 반대) */
          onOpenInquiry={openInquiry}
          onDeleteInquiry={handleDeleteInquiry}
        />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
