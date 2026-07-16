// 문의 상세(ExpertInquiryDetailScreen 로직 인라인 §16) = 뒤로가기 = setView(home) / 여정 전체보기 = onOpenItinerary
// ExpertSheet.tsx 분리(2026-07-15 §0 슬림화, 순수 이동, 리팩토링 금지).
import React, { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { Colors, Brand, Spacing, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { getInquiry, replyInquiry, getMyRole, type Inquiry } from "../expertApi";
import { statusStyle } from "../statusStyle";
import { styles } from "../styles";

// 상세 말풍선 날짜 포맷(ExpertInquiryDetailScreen 그대로).
function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function DetailView({
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
