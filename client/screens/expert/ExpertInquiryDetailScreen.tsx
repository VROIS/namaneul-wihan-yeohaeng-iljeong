// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 문의 상세 = 역할별. 배포 수준.
//   사용자(role user) = 답변 보기(말풍선, 시안 B). 전문가/관리자(role expert/admin) = 말풍선 + 하단 답변 입력/상태버튼(시안 C 상세).
//   열람 시 백엔드가 사용자 본인이면 읽음 처리(배지 감소). 디자인 = 메인앱 토큰(Pretendard·Brand.primary). 모바일 = 고정헤더 + 키보드 대응.
import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { Colors, Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getInquiry, replyInquiry, getMyRole, type Inquiry } from "./expertApi";
import { statusStyle } from "./statusStyle";

function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ExpertInquiryDetailScreen({ route, navigation }: any) {
  const id: string = route?.params?.id;
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  const [inq, setInq] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpert, setIsExpert] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // 마운트 가드(리뷰 2026-07-13) = onReply 후 reload 가 언마운트 후 setState 하는 것 방지.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getInquiry(id), getMyRole()])
      .then(([r, role]) => { if (mounted.current) { setInq(r); setIsExpert(role === "expert" || role === "admin"); setReply(r?.expertReply || ""); setLoading(false); } })
      .catch(() => { if (mounted.current) { setInq(null); setLoading(false); } });
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onReply = async (status: "answered" | "rejected" | "in_review") => {
    if (status === "answered" && !reply.trim()) { Alert.alert(t("expert.replyRequired")); return; }
    setSending(true);
    try {
      const r = await replyInquiry(id, reply.trim(), status);
      if (r.ok) {
        Alert.alert(t("expert.replySentTitle"), t("expert.replySentMsg"));
        load(); // 갱신(mounted 가드 내장)
      } else {
        Alert.alert(t("common.error"), t("expert.sendError"));
      }
    } finally {
      setSending(false);
    }
  };

  const dest = inq?.itineraryData?.destination;
  const st = inq ? statusStyle(inq.status, theme, t) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* 고정 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{dest || t("expert.detailTitle")}</Text>
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
          {/* 첨부 여정 요약 */}
          {inq.itineraryData ? (
            <View style={[styles.attach, { backgroundColor: theme.backgroundDefault }]}>
              <Icon name="map-pin" size={14} color={theme.textTertiary} />
              <Text style={[styles.attachText, { color: theme.textSecondary }]} numberOfLines={1}>
                {t("expert.attachSummary", { dest: inq.itineraryData.destination || "-", days: inq.itineraryData.days || 0, places: inq.itineraryData.totalPlaces || 0 })}
              </Text>
            </View>
          ) : null}

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

          {/* 전문가/관리자 = 답변 입력 + 상태 버튼(시안 C 상세) */}
          {isExpert ? (
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
              <View style={styles.replyActions}>
                <Pressable style={[styles.actBtn, { backgroundColor: theme.backgroundSecondary }]} onPress={() => onReply("in_review")} disabled={sending}>
                  <Text style={[styles.actText, { color: theme.textSecondary }]}>{t("expert.stReview")}</Text>
                </Pressable>
                <Pressable style={[styles.actBtn, { backgroundColor: `${theme.danger}1A` }]} onPress={() => onReply("rejected")} disabled={sending}>
                  <Text style={[styles.actText, { color: theme.danger }]}>{t("expert.stRejected")}</Text>
                </Pressable>
                <Pressable style={[styles.actBtn, styles.actPrimary, { backgroundColor: Brand.primary, opacity: (!reply.trim() || sending) ? 0.5 : 1 }]} onPress={() => onReply("answered")} disabled={!reply.trim() || sending}>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: Fonts.bold },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
  badgePlaceholder: { width: 44 },
  scroll: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  attach: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginBottom: Spacing.lg },
  attachText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium },
  from: { fontSize: 11, fontFamily: Fonts.medium, marginBottom: 4 },
  bubble: { maxWidth: "88%", padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg },
  bubbleMe: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleMeText: { color: "#FFF", fontSize: 14, fontFamily: Fonts.medium, lineHeight: 21 },
  bubbleThem: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleThemText: { fontSize: 14, fontFamily: Fonts.medium, lineHeight: 21 },
  waiting: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, alignSelf: "flex-start", padding: Spacing.md, borderRadius: BorderRadius.md },
  waitingText: { fontSize: 13, fontFamily: Fonts.semiBold },
  replyBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.lg, marginTop: Spacing.sm },
  replyLabel: { fontSize: 14, fontFamily: Fonts.bold, marginBottom: Spacing.sm },
  replyInput: { padding: Spacing.md, borderRadius: BorderRadius.md, fontSize: 15, fontFamily: Fonts.medium, minHeight: 90, textAlignVertical: "top", marginBottom: Spacing.md },
  replyActions: { flexDirection: "row", gap: Spacing.sm },
  actBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, height: Spacing.buttonHeight, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  actPrimary: { flex: 1 },
  actText: { fontSize: 13, fontFamily: Fonts.bold },
});
