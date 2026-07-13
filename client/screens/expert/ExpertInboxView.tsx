// ⚠️ 수정금지(승인필요) 2026-07-13 사장님 SSOT = 전문가/관리자 답변함(시안 C). 배포 수준.
//   수신 문의 = 상태 필터 칩(전체/대기/검토중/완료) + 목록. 카드 탭 → 상세(ExpertInquiryDetailScreen 전문가 모드 = 답변 입력).
//   디자인 = 메인앱 토큰. 모바일 = 고정 헤더 + 스크롤 + SafeArea + 탭바 여백.
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { Colors, Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { listInquiries, type Inquiry, type InquiryStatus } from "./expertApi";
import { statusStyle } from "./statusStyle";

type Filter = "all" | InquiryStatus;
const FILTERS: Filter[] = ["all", "pending", "in_review", "answered"];

export default function ExpertInboxView({ navigation }: any) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  const [all, setAll] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useFocusEffect(useCallback(() => {
    let on = true;
    listInquiries().then((r) => { if (on) setAll(r); }).catch(() => { if (on) setAll([]); });
    return () => { on = false; };
  }, []));

  const counts: Record<Filter, number> = {
    all: all.length,
    pending: all.filter((q) => q.status === "pending").length,
    in_review: all.filter((q) => q.status === "in_review").length,
    answered: all.filter((q) => q.status === "answered").length,
    rejected: all.filter((q) => q.status === "rejected").length,
  };
  const filterLabel: Record<Filter, string> = {
    all: t("expert.fltAll"), pending: t("expert.stPending"), in_review: t("expert.stReview"), answered: t("expert.stAnswered"), rejected: t("expert.stRejected"),
  };
  const shown = filter === "all" ? all : all.filter((q) => q.status === filter);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* 고정 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t("expert.answerBox")}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 55 + Spacing.lg }}
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
                style={[styles.card, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => navigation?.navigate?.("ExpertInquiryDetail", { id: q.id })}
              >
                <View style={styles.flex1}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{dest}</Text>
                  <Text style={[styles.cardPreview, { color: theme.textSecondary }]} numberOfLines={1}>{q.userMessage}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 28, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  scroll: { flex: 1 },
  flex1: { flex: 1 },
  chips: { gap: Spacing.sm, paddingBottom: Spacing.md },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: Fonts.semiBold },
  empty: { fontSize: 14, fontFamily: Fonts.medium, textAlign: "center", paddingVertical: Spacing.xl },
  card: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: Fonts.semiBold },
  cardPreview: { fontSize: 12, fontFamily: Fonts.medium, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontFamily: Fonts.bold },
});
