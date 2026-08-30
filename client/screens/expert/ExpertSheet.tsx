// ⚠️ 사장님 SSOT 2026-07-29 = 전문가(현지 전문가 문의) 기능 = 사용자 & 전문가 3대 미세조정(개별삭제, 선택강조, 여정정보 내장) 완벽 반영
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
import InquiryListView from "./components/InquiryListView"; // 목록(칩+카드) 1벌 = 전문가·사용자 공용(2026-08-07 §0)
import { styles } from "./styles";

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
  onHeaderChange?: (
    h: {
      avatarUrl?: string;
      nickname?: string;
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
  const {
    currentItinerary,
    currentItineraryId,
    setCurrentItinerary,
    bumpExpertData,
    expertOpenPayload,
    clearExpertOpenPayload,
  } = useMapToggle();

  const [view, setView] = useState<SheetView>({ kind: "home" });

  const [isExpert, setIsExpert] = useState<boolean | null>(null);
  // ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 = 상단 토글로 사용자(문의작성)↔전문가(답변함) 수동 전환(admin 도 사용자 화면 열람). 사용자는 토글 없음.
  const [viewMode, setViewMode] = useState<"user" | "expert">("user");

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  // ⚠️ 2026-07-24 사장님 승인 = 일별 [바로 예약하기] = 시트를 예약 작성 모드(Day n)로 오픈.
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
  const [profile, setProfile] = useState<ExpertProfile | null>(null);

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

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
  useEffect(() => {
    if (!onHeaderChange || isExpert === null) return;
    onHeaderChange({
      avatarUrl: profile?.avatarUrl,
      nickname: profile?.nickname || t("expert.introName"),
      onPress: isExpert ? () => setView({ kind: "profileEdit" }) : undefined,
    });
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
        showCreditShortfall(r.shortfall, onClose);
      } else {
        notify(t("common.error"), t("expert.sendError"));
      }
    } catch (e) {
      notify(t("common.error"), t("expert.sendError"));
    } finally {
      setSubmitting(false);
    }
  };

  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 사용자 새 문의 = 여정 생성 후에만(크레딧 10 보호 §9).
  const composeLocked = !itin && isExpert !== true && bookingDay == null;
  const canSubmit = !!message.trim() && !submitting && !composeLocked;

  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          window.confirm(t("expert.deleteConfirmMsg"))
        ) {
          doDelete();
        }
      } else {
        Alert.alert(
          t("expert.deleteConfirmTitle"),
          t("expert.deleteConfirmMsg"),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.delete"),
              style: "destructive",
              onPress: doDelete,
            },
          ],
        );
      }
    },
    [bumpExpertData, selectedId, t],
  );

  const openInquiry = (q: Inquiry) => {
    setSelectedId(q.id);
    if (q.itineraryId && onRestoreBackground)
      onRestoreBackground(q.itineraryId);
    setView({ kind: "detail", id: q.id });
  };

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
