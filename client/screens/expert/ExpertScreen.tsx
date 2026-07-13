// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가 탭 화면(하단 중간 '전문가') = 배포 수준.
//   계획서 = docs/2026-07-13 전문가탭 구현계획.md / 시안 = docs/design/2026-07-13 전문가탭 화면구성안.html
//   디자인 = 메인앱 여정입력(TripPlannerScreen)과 동일 토큰(Pretendard·inputBox 카드·Brand.primary·Lucide). 사장님 "메인앱과 맞춰라" SSOT.
//   모바일 최적화 = 고정 헤더(스크롤 X) + KeyboardAwareScrollViewCompat(키보드 가림 방지, §16 재사용) + SafeArea + 하단 탭 공간.
//   사용자 흐름 = 소개카드 → 여정(+AI의견) 첨부 → 문의작성 → 내문의함(상태배지) → 카드탭 → 상세(ExpertInquiryDetail).
//   API = 자체 폴더 헬퍼 expertApi(다른 파일 안 섞기).
import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { Colors, Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { submitInquiry, listInquiries, getMyRole, type Inquiry } from "./expertApi";
import { statusStyle } from "./statusStyle";
import ExpertInboxView from "./ExpertInboxView";

export default function ExpertScreen({ navigation }: any) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  // ⚠️ 실제 저장 여정 id = currentItineraryId(별도) = Itinerary 타입엔 id 없음(리뷰 2026-07-13). 이걸 써야 FK 연결됨.
  const { currentItinerary, currentItineraryId } = useMapToggle();

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  // 역할 분기 = expert/admin 이면 답변함(시안 C), user 면 문의작성(시안 A). null=조회중.
  const [isExpert, setIsExpert] = useState<boolean | null>(null);
  // 마운트 가드(리뷰 2026-07-13) = onSubmit 후 reload 가 언마운트 후 setState 방지.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const itin: any = currentItinerary;
  const totalPlaces = itin?.days?.reduce((s: number, d: any) => s + (d.places?.length || 0), 0) || 0;
  const aiOpinion =
    itin?.rawData?.verification?.result?.feasibility?.verdict ||
    itin?.rawData?.verification?.result?.summary ||
    null;

  // 포커스마다 역할+목록 재조회 = alive 가드로 blur 후 setState·순서역전 방지(리뷰 2026-07-13).
  useFocusEffect(useCallback(() => {
    let alive = true;
    getMyRole().then((role) => { if (alive) setIsExpert(role === "expert" || role === "admin"); }).catch(() => { if (alive) setIsExpert(false); });
    listInquiries().then((r) => { if (alive) setInquiries(r); }).catch(() => { if (alive) setInquiries([]); });
    return () => { alive = false; };
  }, []));
  const reload = useCallback(() => {
    listInquiries().then((r) => { if (mounted.current) setInquiries(r); }).catch(() => { if (mounted.current) setInquiries([]); });
  }, []);

  // 전문가/관리자 = 답변함 모드(별도 컴포넌트). 사용자 = 아래 문의작성.
  if (isExpert) return <ExpertInboxView navigation={navigation} />;

  const onSubmit = async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await submitInquiry({
        userMessage: message.trim(),
        itineraryData: itin ? { destination: itin.destination, days: itin.days?.length, totalPlaces, aiOpinion } : null,
        itineraryId: currentItineraryId ?? null, // 저장 여정이면 실제 id 연결(FK)
      });
      if (r.ok) {
        setMessage("");
        Alert.alert(t("expert.sentTitle"), t("expert.sentMsg"));
        reload();
      } else if (r.error === "login_required") {
        Alert.alert(t("expert.loginTitle"), t("expert.loginMsg"));
      } else {
        Alert.alert(t("common.error"), t("expert.sendError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!message.trim() && !submitting;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* 고정 헤더 (스크롤 X) */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t("expert.title")}</Text>
      </View>

      {/* 스크롤 영역 (키보드 가림 방지) */}
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 55 + Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* 소개 카드 */}
        <View style={[styles.card, { backgroundColor: `${Brand.primary}0D` }]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{t("expert.introInitial")}</Text></View>
          <View style={styles.flex1}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t("expert.introName")}</Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>{t("expert.introDesc")}</Text>
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
                {/* AI 보라 = 라이트 진보라/다크 연보라(다크모드 대비 확보, 리뷰 2026-07-13). 점은 accent #7A5AF8 유지. */}
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

        {/* 내 문의함 (구분선으로 섹션 분리) */}
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
                onPress={() => navigation?.navigate?.("ExpertInquiryDetail", { id: q.id })}
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

// 메인앱(TripPlannerScreen) 토큰과 동일: title 28 bold / inputBox = backgroundDefault·BorderRadius.md / Pretendard.
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  scroll: { flex: 1 },
  flex1: { flex: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  attachCard: { padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md, gap: Spacing.xs },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Brand.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFF", fontFamily: Fonts.bold, fontSize: 18 },
  cardTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: 2 },
  cardSub: { fontSize: 13, fontFamily: Fonts.medium },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.bold, marginBottom: Spacing.sm },
  sectionSub: { fontSize: 12, fontFamily: Fonts.medium },
  attachTitle: { fontSize: 18, fontFamily: Fonts.bold },
  aiLine: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#7A5AF8" },
  aiText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium }, // color = 인라인(다크모드 대응)
  input: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium, minHeight: 100, textAlignVertical: "top", marginBottom: Spacing.md },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, height: Spacing.buttonHeight, borderRadius: BorderRadius.md },
  submitText: { color: "#FFF", fontSize: 16, fontFamily: Fonts.bold },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: Spacing.xl },
  emptyText: { fontSize: 14, fontFamily: Fonts.medium, textAlign: "center", paddingVertical: Spacing.lg },
  inquiryCard: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.primary },
  inquiryTitle: { fontSize: 14, fontFamily: Fonts.semiBold },
  inquiryPreview: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
});
