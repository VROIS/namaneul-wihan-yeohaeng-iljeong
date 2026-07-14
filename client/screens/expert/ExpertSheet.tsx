// ⚠️ 사장님 SSOT 2026-07-14 = 전문가(현지 전문가 문의) 기능 = 여정화면 위 바텀시트 BODY(모달 껍데기 = 부모 TripPlannerScreen).
//   AI의견과 동일 패턴 = 별도 탭 화면(react-navigation) 폐기 §19 → 부모 모달 안에서 내부 상태머신(setView)으로 home↔detail↔profileEdit 전환.
//   내부 전환 = react-navigation 안 씀(§16 재사용) = setView 만. 외부 = onOpenItinerary(여정 복원)·onClose(시트 닫기)·onRequestLogin(로그인).
//   home = 역할별(전문가/관리자 = 답변함 / 사용자 = 문의작성 + 내문의함). detail = 문의상세(말풍선 + 전문가 답변입력). profileEdit = 전문가 프로필 편집.
//   로직 = 문의작성(로그인가드·여정자동저장·웹세이프) + 답변(웹세이프·답변완료 editing 게이트) 모두 이 파일에 인라인(§16 단일벌). i18n = expert.* 기존 키만.
//   시트 자체 헤더(제목·X)는 부모 모달이 제공 = 여기선 각 내부뷰의 서브헤더(← 뒤로)만. 상단 SafeArea = 부모 담당 / 하단 insets 만 사용.
import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { Colors, Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useMapToggle } from "@/contexts/MapToggleContext";
import {
  submitInquiry,
  saveItineraryForInquiry,
  listInquiries,
  getInquiry,
  replyInquiry,
  getMyRole,
  getExpertProfile,
  getMyExpertProfile,
  saveExpertProfile,
  type Inquiry,
  type InquiryStatus,
  type ExpertProfile,
} from "./expertApi";
import { statusStyle } from "./statusStyle";
import { getUserData } from "@/lib/auth"; // 문의 전 로그인 확인(비로그인=로그인 안내)

// 전문가 문의 크레딧 = AI 의견과 동일 방식으로 사전 안내(2026-07-13). 실제 차감은 로그인 정식화 후(§9 프로모션).
const EXPERT_INQUIRY_CREDIT_COST = 10;

// ⚠️ 사장님 SSOT 2026-07-14 = 시트 내부 화면 = react-navigation 아님 = 상태머신 1개(setView)로 전환.
type SheetView = { kind: "home" } | { kind: "detail"; id: string } | { kind: "profileEdit" };

interface ExpertSheetProps {
  onClose: () => void; // 시트 닫기(부모가 모달 숨김 → 여정으로 복귀)
  onOpenItinerary: (itineraryId: number) => void; // [여정 전체 보기] = 부모가 시트 닫고 그 여정 복원(배경 전환)
  // ⚠️ 사장님 SSOT 2026-07-14 = 문의 카드 누름 = 그 여정을 배경에 복원(시트는 열린 채) = 실제 여정 보며 답변(사용자 프로필카드 클릭과 동일). 중간 요약카드 불필요.
  onRestoreBackground?: (itineraryId: number) => void;
  onRequestLogin?: () => void; // 로그인 필요 시 부모가 로그인 화면으로(없으면 onClose 폴백 = 프로필서 로그인)
}

// ⚠️ 사장님 SSOT 2026-07-14 = 답변함 필터 = 전체/답변대기/답변완료 (검토중·반려 완전 삭제 §19 = 그 상태로 갈 방법이 없어짐).
type Filter = "all" | InquiryStatus;
const FILTERS: Filter[] = ["all", "pending", "answered"];

// 상세 말풍선 날짜 포맷(ExpertInquiryDetailScreen 그대로).
function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ExpertSheet({ onClose, onOpenItinerary, onRestoreBackground, onRequestLogin }: ExpertSheetProps) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  // ⚠️ 실제 저장 여정 id = currentItineraryId(별도) = Itinerary 타입엔 id 없음. 이걸 써야 FK 연결됨.
  const { currentItinerary, currentItineraryId, setCurrentItinerary, bumpExpertData } = useMapToggle();

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
  // 전문가 본인 프로필(닉네임/경력/자기소개/캐릭터) = 소개카드 반영. 없으면 i18n 기본문구 폴백.
  const [profile, setProfile] = useState<ExpertProfile | null>(null);

  // 마운트 가드 = 액션 후 reload 가 언마운트 후 setState 방지.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // home 진입 시 1회 = 역할 + 목록 + 프로필 조회(옛 useFocusEffect 폐기 §19 = 시트는 포커스 개념 없음, mount + 액션 후 reload 로 갱신).
  const reload = useCallback(() => {
    listInquiries().then((r) => { if (mounted.current) setInquiries(r); }).catch(() => { if (mounted.current) setInquiries([]); });
  }, []);
  useEffect(() => {
    let alive = true;
    getMyRole().then((role) => {
      if (!alive) return;
      const expert = role === "expert" || role === "admin";
      setIsExpert(expert);
      setViewMode(expert ? "expert" : "user"); // 진입 기본 = 실제 역할(전문가면 답변함 먼저). 이후 상단 토글로 자유 전환.
    }).catch(() => { if (alive) { setIsExpert(false); setViewMode("user"); } });
    listInquiries().then((r) => { if (alive) setInquiries(r); }).catch(() => { if (alive) setInquiries([]); });
    getExpertProfile().then(({ profile }) => { if (alive) setProfile(profile); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const itin: any = currentItinerary;
  const totalPlaces = itin?.days?.reduce((s: number, d: any) => s + (d.places?.length || 0), 0) || 0;
  const aiOpinion =
    itin?.rawData?.verification?.result?.feasibility?.verdict ||
    itin?.rawData?.verification?.result?.summary ||
    null;

  // ⚠️ 2026-07-14 = 웹(WebView)에서 버튼 있는 Alert.alert 이 안 떠서 "눌러도 반응 없음"(사장님 지적). 웹 = window.confirm/alert, 앱 = Alert.alert(§19).
  const goLoginPrompt = () => {
    // 시트 = navigation 없음 = 로그인 수락 시 부모 콜백(onRequestLogin) 호출 → 없으면 onClose 폴백(사용자는 프로필서 로그인).
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${t("expert.loginTitle")}\n\n${t("expert.loginMsg")}`)) (onRequestLogin ?? onClose)();
    } else {
      Alert.alert(t("expert.loginTitle"), t("expert.loginMsg"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("expert.goLogin"), onPress: () => (onRequestLogin ?? onClose)() },
      ]);
    }
  };
  const notify = (title: string, msg?: string) => {
    if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg ? `${title}\n\n${msg}` : title); }
    else Alert.alert(title, msg);
  };

  // ── 사용자: 문의 접수(로그인가드·여정자동저장·웹세이프 = 이 파일 인라인 §16) ──
  const onSubmit = async () => {
    if (!message.trim() || submitting) return;
    // ⚠️ 사장님 SSOT 2026-07-14 = 문의 전 로그인 확인 = 비로그인(또는 게스트)이면 서버 400 대신 즉시 로그인 안내(§19).
    const user = await getUserData();
    if (!user || !user.token || !user.token.startsWith("simple_auth_token_v1_")) {
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
      const r = await submitInquiry({
        userMessage: message.trim(),
        // 목록카드용 요약(전문가는 여정 id로 restore-by-id = DB 원본 열람). 스냅샷 폐기 §19.
        itineraryData: itin ? { destination: itin.destination, dayCount: itin.days?.length ?? 0, totalPlaces, aiOpinion } : null,
        itineraryId: linkedId, // 저장된 여정 id 연결(FK)
      });
      if (r.ok) {
        // ⚠️ 사장님 SSOT 2026-07-14 = 문의 전송 완료 = 목적 달성 = 시트 자동 내려감(onClose) → 배경 여정 복귀(AI의견과 동일). X는 사용자가 인위적으로 닫을 때만.
        //   + bumpExpertData() = 하단 탭 배지 즉시 갱신 = 사용자가 "내 문의 접수됨"을 실시간으로 인식.
        setMessage("");
        bumpExpertData();
        notify(t("expert.sentTitle"), t("expert.sentMsg"));
        onClose();
      } else if (r.error === "login_required") {
        goLoginPrompt();
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

  const canSubmit = !!message.trim() && !submitting;

  // ⚠️ 사장님 SSOT 2026-07-14 = 문의 카드 누름 = 그 문의의 여정을 배경에 복원(있으면) + 상세 뷰로 전환 = 실제 여정 보며 답변/확인(중간 요약카드 불필요).
  const openInquiry = (q: Inquiry) => {
    if (q.itineraryId && onRestoreBackground) onRestoreBackground(q.itineraryId);
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
        onBack={() => { setView({ kind: "home" }); reload(); }}
        onClose={onClose}
        onOpenItinerary={onOpenItinerary}
      />
    );
  }
  if (view.kind === "profileEdit") {
    return <ProfileEditView theme={theme} insets={insets} t={t} onBack={() => setView({ kind: "home" })} />;
  }

  // ── home = 상단 토글(전문가/관리자만) + 역할별 본문 ──
  const modeToggle = isExpert ? (
    <View style={[styles.toggleRow, { backgroundColor: theme.backgroundDefault }]}>
      <Pressable
        style={[styles.toggleBtn, viewMode === "user" && { backgroundColor: Brand.primary }]}
        onPress={() => setViewMode("user")}
      >
        <Text style={[styles.toggleText, { color: viewMode === "user" ? "#FFF" : theme.textSecondary }]}>{t("expert.modeUser")}</Text>
      </Pressable>
      <Pressable
        style={[styles.toggleBtn, viewMode === "expert" && { backgroundColor: Brand.primary }]}
        onPress={() => setViewMode("expert")}
      >
        <Text style={[styles.toggleText, { color: viewMode === "expert" ? "#FFF" : theme.textSecondary }]}>{t("expert.modeExpert")}</Text>
      </Pressable>
    </View>
  ) : null;

  // 전문가/관리자 + expert 모드 = 답변함(받은 문의 목록·상태필터 = 이 파일 인라인).
  if (isExpert && viewMode === "expert") {
    const counts: Record<Filter, number> = {
      all: inquiries.length,
      pending: inquiries.filter((q) => q.status === "pending").length,
      in_review: inquiries.filter((q) => q.status === "in_review").length,
      answered: inquiries.filter((q) => q.status === "answered").length,
      rejected: inquiries.filter((q) => q.status === "rejected").length,
    };
    const filterLabel: Record<Filter, string> = {
      all: t("expert.fltAll"), pending: t("expert.stPending"), in_review: t("expert.stReview"), answered: t("expert.stAnswered"), rejected: t("expert.stRejected"),
    };
    const shown = filter === "all" ? inquiries : inquiries.filter((q) => q.status === filter);
    return (
      <View style={styles.container}>
        {/* 서브헤더 = 답변함 제목 + 프로필 편집 진입 + 상단 토글(시트 자체 헤더는 부모 모달) */}
        <View style={[styles.subHeader, { borderBottomColor: theme.border }]}>
          <View style={styles.subHeaderRow}>
            <Text style={[styles.subTitle, { color: theme.text }]}>{t("expert.answerBox")}</Text>
            <Pressable onPress={() => setView({ kind: "profileEdit" })} hitSlop={10} style={styles.iconBtn}>
              <Icon name="user" size={22} color={Brand.primary} />
            </Pressable>
          </View>
          {modeToggle}
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          {/* 상태 필터 칩 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FILTERS.map((f) => {
              const on = filter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.chip, { backgroundColor: on ? Brand.primary : theme.backgroundDefault, borderColor: on ? Brand.primary : theme.border }]}
                >
                  <Text style={[styles.chipText, { color: on ? "#FFF" : theme.textSecondary }]}>{filterLabel[f]} {counts[f]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {shown.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>{t("expert.inboxNoItems")}</Text>
          ) : (
            shown.map((q) => {
              const st = statusStyle(q.status, theme, t);
              const dest = q.itineraryData?.destination || t("expert.inquiry");
              return (
                <Pressable
                  key={q.id}
                  style={[styles.inquiryCard, { backgroundColor: theme.backgroundDefault }]}
                  onPress={() => openInquiry(q)}
                >
                  <View style={styles.flex1}>
                    <Text style={[styles.inquiryTitle, { color: theme.text }]} numberOfLines={1}>{dest}</Text>
                    <Text style={[styles.inquiryPreview, { color: theme.textSecondary }]} numberOfLines={1}>{q.userMessage}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View>
                  <Icon name="chevron-right" size={18} color={theme.textTertiary} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // 사용자(또는 admin 이 user 모드로 전환) = 문의작성 + 내문의함(사용자 모드 = 이 파일 인라인).
  return (
    <View style={styles.container}>
      {/* 전문가/관리자면 상단 토글만(제목·X = 부모 모달). 순수 사용자는 서브헤더 없음. */}
      {modeToggle ? (
        <View style={[styles.subHeader, { borderBottomColor: theme.border }]}>{modeToggle}</View>
      ) : null}

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* 소개 카드 = 전문가 본인 프로필(있으면) / 없으면 기본 i18n 문구 */}
        <View style={[styles.card, { backgroundColor: `${Brand.primary}0D` }]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{profile?.character || t("expert.introInitial")}</Text></View>
          <View style={styles.flex1}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{profile?.nickname || t("expert.introName")}</Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>{profile?.career || t("expert.introDesc")}</Text>
            {profile?.bio ? <Text style={[styles.cardBio, { color: theme.textTertiary }]} numberOfLines={3}>{profile.bio}</Text> : null}
          </View>
        </View>

        {/* 여정 첨부 카드 */}
        {itin ? (
          <View style={[styles.attachCard, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.sectionSub, { color: theme.textTertiary }]}>{t("expert.attachLabel")}</Text>
            <Text style={[styles.attachTitle, { color: theme.text }]}>
              {itin.destination} · {itin.days?.length || 0}{t("expert.daysPlaces", { places: totalPlaces })}
            </Text>
            {aiOpinion ? (
              <View style={[styles.aiLine, { backgroundColor: "#7A5AF814" }]}>
                <View style={styles.dot} />
                {/* AI 보라 = 라이트 진보라/다크 연보라(다크모드 대비 확보). 점은 accent #7A5AF8 유지. */}
                <Text style={[styles.aiText, { color: colorScheme === "dark" ? "#A78BFA" : "#5B3FD4" }]} numberOfLines={2}>{t("expert.aiAttached")}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <Icon name="map-pin" size={18} color={theme.textTertiary} />
            <Text style={[styles.cardSub, { color: theme.textTertiary, flex: 1 }]}>{t("expert.noItinerary")}</Text>
          </View>
        )}

        {/* 질문 입력 */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.md }]}>{t("expert.questionLabel")}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
          placeholder={t("expert.questionPlaceholder")}
          placeholderTextColor={theme.textTertiary}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <Pressable
          style={[styles.submitBtn, { backgroundColor: Brand.primary, opacity: canSubmit ? 1 : 0.5 }]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Icon name="send" size={18} color="#FFF" />}
          <Text style={styles.submitText}>{t("expert.submit")}</Text>
        </Pressable>
        {/* 크레딧 안내 = AI 의견 팝업과 동일 패턴. 실제 차감은 로그인 정식화 후(§9). */}
        <Text style={[styles.creditNote, { color: theme.textTertiary }]}>{t("expert.creditNote", { count: EXPERT_INQUIRY_CREDIT_COST })}</Text>

        {/* 내 문의함 */}
        <View style={[styles.divider, { borderTopColor: theme.border }]} />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t("expert.myInbox")}</Text>
        {inquiries.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{t("expert.inboxEmpty")}</Text>
        ) : (
          inquiries.map((q) => {
            const st = statusStyle(q.status, theme, t);
            const dest = q.itineraryData?.destination || t("expert.inquiry");
            const unread = q.status === "answered" && !q.isReadByUser;
            return (
              <Pressable
                key={q.id}
                style={[styles.inquiryCard, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => openInquiry(q)}
              >
                {unread ? <View style={styles.unreadDot} /> : null}
                <View style={styles.flex1}>
                  <Text style={[styles.inquiryTitle, { color: theme.text }]} numberOfLines={1}>{dest}</Text>
                  <Text style={[styles.inquiryPreview, { color: theme.textSecondary }]} numberOfLines={1}>{q.userMessage}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={theme.textTertiary} />
              </Pressable>
            );
          })
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

// ── 문의 상세(ExpertInquiryDetailScreen 로직 인라인 §16) = 뒤로가기 = setView(home) / 여정 전체보기 = onOpenItinerary ──
function DetailView({
  id, theme, colorScheme, insets, t, onBack, onClose, onOpenItinerary,
}: {
  id: string;
  theme: typeof Colors.light;
  colorScheme: "light" | "dark" | null | undefined;
  insets: { bottom: number };
  t: (k: string, o?: any) => string;
  onBack: () => void;
  onClose: () => void; // ⚠️ 답변 전송 완료 = 시트 자체가 내려감(사장님 SSOT 2026-07-14)
  onOpenItinerary: (itineraryId: number) => void;
}) {
  const { bumpExpertData } = useMapToggle(); // 답변 전송 직후 배지 즉시 갱신(실시간 피드백)
  const [inq, setInq] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpert, setIsExpert] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // ⚠️ 사장님 SSOT 2026-07-14 = 답변완료 문의는 입력창 대신 "답변완료" 표시. [답변 수정] 눌러야 입력창(옛: 항상 입력창=재답변 혼란 폐기 §19).
  const [editing, setEditing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getInquiry(id), getMyRole()])
      .then(([r, role]) => { if (mounted.current) { setInq(r); setIsExpert(role === "expert" || role === "admin"); setReply(r?.expertReply || ""); setLoading(false); } })
      .catch(() => { if (mounted.current) { setInq(null); setLoading(false); } });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const notify = (title: string, msg?: string) => {
    if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg ? `${title}\n\n${msg}` : title); }
    else Alert.alert(title, msg);
  };

  // ⚠️ 사장님 SSOT 2026-07-14 = 답변 = 'answered' 하나뿐(검토중·반려 버튼 완전 삭제 §19). 전송 완료 = 배지 즉시갱신 + 시트 자동 내려감(onClose) → 배경 여정 복귀. 웹세이프.
  const onReply = async () => {
    if (!reply.trim()) { notify(t("expert.replyRequired")); return; }
    setSending(true);
    try {
      const r = await replyInquiry(id, reply.trim(), "answered");
      if (r.ok) {
        bumpExpertData();
        notify(t("expert.replySentTitle"), t("expert.replySentMsg"));
        onClose();
      } else {
        notify(t("common.error"), t("expert.sendError"));
      }
    } finally {
      if (mounted.current) setSending(false);
    }
  };

  const dest = inq?.itineraryData?.destination;
  const st = inq ? statusStyle(inq.status, theme, t) : null;

  return (
    <View style={styles.container}>
      {/* 서브헤더 = ← 뒤로(home) + 제목 + 상태배지 */}
      <View style={[styles.detailHeader, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.detailTitle, { color: theme.text }]} numberOfLines={1}>{dest || t("expert.detailTitle")}</Text>
        {st ? <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text></View> : <View style={styles.badgePlaceholder} />}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Brand.primary} /></View>
      ) : !inq ? (
        <View style={styles.center}><Text style={{ color: theme.textSecondary, fontFamily: Fonts.medium }}>{t("expert.notFound")}</Text></View>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          {/* ⚠️ 사장님 SSOT 2026-07-14 = 중간 여정 요약카드 폐기 §19 = 문의 카드 누르면 그 여정이 이미 배경에 복원됨(onRestoreBackground = restore-by-id). 실제 여정(지도+상세)을 배경으로 보며 답변/확인 = 요약 불필요. */}

          {/* 내 질문(파랑 우측) */}
          <Text style={[styles.from, { color: theme.textTertiary, textAlign: "right" }]}>{t("expert.me")} · {fmt(inq.createdAt)}</Text>
          <View style={[styles.bubble, styles.bubbleMe, { backgroundColor: Brand.primary }]}>
            <Text style={styles.bubbleMeText}>{inq.userMessage}</Text>
          </View>

          {/* 전문가 답변(회색 좌측, 있으면) */}
          {inq.expertReply ? (
            <>
              <Text style={[styles.from, { color: theme.textTertiary }]}>{t("expert.expertReplyFrom")} · {fmt(inq.answeredAt)}</Text>
              <View style={[styles.bubble, styles.bubbleThem, { backgroundColor: theme.backgroundSecondary }]}>
                <Text style={[styles.bubbleThemText, { color: theme.text }]}>{inq.expertReply}</Text>
              </View>
            </>
          ) : !isExpert ? (
            <View style={[styles.waiting, { backgroundColor: `${theme.warning}12` }]}>
              <Icon name="clock" size={16} color={theme.warning} />
              <Text style={[styles.waitingText, { color: theme.warning }]}>{t("expert.waitingReply")}</Text>
            </View>
          ) : null}

          {/* ⚠️ 사장님 SSOT 2026-07-14 = 답변완료면 입력창 대신 "답변완료" + [답변 수정]. 수정 눌러야 입력창. 미답변이면 바로 입력창. */}
          {isExpert && inq.status === "answered" && !editing ? (
            <View style={[styles.replyBox, { borderTopColor: theme.border }]}>
              <View style={[styles.doneRow, { backgroundColor: `${theme.success}12` }]}>
                <Icon name="check-circle" size={18} color={theme.success} />
                <Text style={[styles.doneText, { color: theme.success }]}>{t("expert.alreadyAnswered")}</Text>
              </View>
              <Pressable style={[styles.editBtn, { borderColor: theme.border }]} onPress={() => setEditing(true)}>
                <Icon name="edit-3" size={16} color={theme.text} />
                <Text style={[styles.editText, { color: theme.text }]}>{t("expert.editReply")}</Text>
              </Pressable>
            </View>
          ) : isExpert ? (
            <View style={[styles.replyBox, { borderTopColor: theme.border }]}>
              <Text style={[styles.replyLabel, { color: theme.text }]}>{t("expert.writeReply")}</Text>
              <TextInput
                style={[styles.replyInput, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
                placeholder={t("expert.replyPlaceholder")}
                placeholderTextColor={theme.textTertiary}
                value={reply}
                onChangeText={setReply}
                multiline
              />
              {/* ⚠️ 사장님 SSOT 2026-07-14 = 검토중·반려 버튼 완전 삭제 §19 = 답변은 [답변 보내기]만(전체폭). 불필요한 상태분기 제거. */}
              <View style={styles.replyActions}>
                <Pressable style={[styles.actBtn, styles.actPrimary, { backgroundColor: Brand.primary, opacity: (!reply.trim() || sending) ? 0.5 : 1 }]} onPress={() => onReply()} disabled={!reply.trim() || sending}>
                  {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Icon name="send" size={16} color="#FFF" />}
                  <Text style={[styles.actText, { color: "#FFF" }]}>{t("expert.sendReply")}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

// ── 전문가 프로필 편집(ExpertProfileEditScreen 로직 인라인 §16) = 뒤로 = setView(home) ──
function ProfileEditView({
  theme, insets, t, onBack,
}: {
  theme: typeof Colors.light;
  insets: { bottom: number };
  t: (k: string, o?: any) => string;
  onBack: () => void;
}) {
  const [character, setCharacter] = useState("");
  const [nickname, setNickname] = useState("");
  const [career, setCareer] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // 본인 프로필 프리필(공용 대표전문가 값 아님 = 로그인한 본인 값 = 다수 전문가 정체성 덮어쓰기 방지).
  useEffect(() => {
    getMyExpertProfile()
      .then(({ profile }) => {
        if (!mounted.current || !profile) return;
        setCharacter(profile.character || "");
        setNickname(profile.nickname || "");
        setCareer(profile.career || "");
        setBio(profile.bio || "");
      })
      .catch(() => {})
      .finally(() => { if (mounted.current) setLoading(false); });
  }, []);

  const notify = (title: string, msg?: string) => {
    if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(msg ? `${title}\n\n${msg}` : title); }
    else Alert.alert(title, msg);
  };

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await saveExpertProfile({ character: character.trim(), nickname: nickname.trim(), career: career.trim(), bio: bio.trim() });
      if (r.ok) {
        notify(t("expert.pfSaved"));
        onBack();
      } else if (r.error === "expert_only" || r.error === "login_required") {
        notify(t("expert.loginTitle"), t("expert.loginMsg"));
      } else {
        notify(t("common.error"), t("expert.sendError"));
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [saving, character, nickname, career, bio, onBack, t]);

  return (
    <View style={styles.container}>
      {/* 서브헤더 = ← 뒤로(home) + 제목 */}
      <View style={[styles.pfHeader, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.pfBack}>
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.pfTitle, { color: theme.text }]}>{t("expert.editProfile")}</Text>
        <View style={styles.pfBack} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Brand.primary} /></View>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          {/* 캐릭터(아바타 글자) */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>{t("expert.pfCharacter")}</Text>
          <TextInput
            style={[styles.pfInput, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
            placeholder={t("expert.pfCharacterPh")}
            placeholderTextColor={theme.textTertiary}
            value={character}
            onChangeText={setCharacter}
            maxLength={2}
          />

          {/* 닉네임 */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>{t("expert.pfNickname")}</Text>
          <TextInput
            style={[styles.pfInput, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
            placeholder={t("expert.pfNicknamePh")}
            placeholderTextColor={theme.textTertiary}
            value={nickname}
            onChangeText={setNickname}
            maxLength={40}
          />

          {/* 경력 */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>{t("expert.pfCareer")}</Text>
          <TextInput
            style={[styles.pfInput, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
            placeholder={t("expert.pfCareerPh")}
            placeholderTextColor={theme.textTertiary}
            value={career}
            onChangeText={setCareer}
            maxLength={60}
          />

          {/* 자기소개 */}
          <Text style={[styles.pfLabel, { color: theme.text }]}>{t("expert.pfBio")}</Text>
          <TextInput
            style={[styles.pfInput, styles.pfInputMultiline, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
            placeholder={t("expert.pfBioPh")}
            placeholderTextColor={theme.textTertiary}
            value={bio}
            onChangeText={setBio}
            maxLength={300}
            multiline
          />

          <Pressable
            style={[styles.saveBtn, { backgroundColor: Brand.primary, opacity: saving ? 0.5 : 1 }]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Icon name="check" size={18} color="#FFF" />}
            <Text style={styles.saveText}>{t("expert.pfSave")}</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

// 메인앱(TripPlannerScreen) 토큰과 동일: Pretendard·inputBox=backgroundDefault·BorderRadius.md·Brand.primary.
// 시트 자체 헤더(제목·X)는 부모 모달 = 여기 title 크기는 서브헤더용(28→20 축소 = 시트 내부 위계).
const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  flex1: { flex: 1 },
  // 상단 세그먼트 토글(사용자↔전문가) = 개발단계 양쪽 화면 열람(2026-07-14)
  toggleRow: { flexDirection: "row", gap: 4, padding: 4, borderRadius: BorderRadius.md },
  toggleBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm },
  toggleText: { fontSize: 13, fontFamily: Fonts.bold },
  // 답변함/사용자 서브헤더(부모 모달 헤더 아래) = 상단 SafeArea 없음(부모 담당)
  subHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  subHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subTitle: { fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  iconBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  // 소개/여정 카드
  card: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  attachCard: { padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md, gap: Spacing.xs },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Brand.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFF", fontFamily: Fonts.bold, fontSize: 18 },
  cardTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 2 },
  cardSub: { fontSize: 13, fontFamily: Fonts.medium },
  cardBio: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: Spacing.sm },
  sectionSub: { fontSize: 12, fontFamily: Fonts.medium },
  attachTitle: { fontSize: 18, fontFamily: Fonts.bold },
  aiLine: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#7A5AF8" },
  aiText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium }, // color = 인라인(다크모드 대응)
  input: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium, minHeight: 100, textAlignVertical: "top", marginBottom: Spacing.md },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, height: Spacing.buttonHeight, borderRadius: BorderRadius.md },
  submitText: { color: "#FFF", fontSize: 16, fontFamily: Fonts.bold },
  creditNote: { fontSize: 12, fontFamily: Fonts.medium, textAlign: "center", marginTop: Spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: Spacing.xl },
  emptyText: { fontSize: 14, fontFamily: Fonts.medium, textAlign: "center", paddingVertical: Spacing.lg },
  // 문의 카드(사용자 내문의함 / 전문가 답변함 공용)
  inquiryCard: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.primary },
  inquiryTitle: { fontSize: 14, fontFamily: Fonts.semiBold },
  inquiryPreview: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
  // 답변함 필터 칩
  chips: { gap: Spacing.sm, paddingBottom: Spacing.md },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: Fonts.semiBold },
  empty: { fontSize: 14, fontFamily: Fonts.medium, textAlign: "center", paddingVertical: Spacing.xl },
  // 상세 서브헤더(← 뒤로 + 제목 + 상태배지)
  detailHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  detailTitle: { flex: 1, fontSize: 18, fontFamily: Fonts.bold },
  badgePlaceholder: { width: 44 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  // 첨부 여정(요약/원본열람)
  attach: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginBottom: Spacing.lg },
  attachText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium },
  attachFull: { flexDirection: "row", alignItems: "center", padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, marginBottom: Spacing.lg },
  attachHead: { fontSize: 14, fontFamily: Fonts.bold },
  attachMeta: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  attachOpen: { fontSize: 12, fontFamily: Fonts.semiBold, marginTop: Spacing.sm },
  // 말풍선
  from: { fontSize: 11, fontFamily: Fonts.medium, marginBottom: 4 },
  bubble: { maxWidth: "88%", padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg },
  bubbleMe: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleMeText: { color: "#FFF", fontSize: 14, fontFamily: Fonts.medium, lineHeight: 21 },
  bubbleThem: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleThemText: { fontSize: 14, fontFamily: Fonts.medium, lineHeight: 21 },
  waiting: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, alignSelf: "flex-start", padding: Spacing.md, borderRadius: BorderRadius.md },
  waitingText: { fontSize: 13, fontFamily: Fonts.semiBold },
  // 답변 입력/답변완료
  replyBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.lg, marginTop: Spacing.sm },
  replyLabel: { fontSize: 14, fontFamily: Fonts.bold, marginBottom: Spacing.sm },
  doneRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  doneText: { fontSize: 14, fontFamily: Fonts.bold },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth },
  editText: { fontSize: 14, fontFamily: Fonts.semiBold },
  replyInput: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium, minHeight: 90, textAlignVertical: "top", marginBottom: Spacing.md },
  replyActions: { flexDirection: "row", gap: Spacing.sm },
  actBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  actPrimary: { flex: 1 },
  actText: { fontSize: 13, fontFamily: Fonts.bold },
  // 프로필 편집
  pfHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  pfBack: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  pfTitle: { flex: 1, fontSize: 20, fontFamily: Fonts.bold, letterSpacing: -0.5, textAlign: "center" },
  pfLabel: { fontSize: 14, fontFamily: Fonts.semiBold, marginBottom: Spacing.xs, marginTop: Spacing.md },
  pfInput: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium },
  pfInputMultiline: { minHeight: 100, textAlignVertical: "top" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, marginTop: Spacing.xl },
  saveText: { color: "#FFF", fontSize: 16, fontFamily: Fonts.bold },
});
