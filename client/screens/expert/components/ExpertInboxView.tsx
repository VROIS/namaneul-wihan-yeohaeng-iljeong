// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 지시 = **ExpertSheet 쪼개기(§0 700줄 규칙, 예외 없음)**.
//   사장님 SSOT: "700줄도 500에서 늘린 것임. 이런 식으로 예외를 두면 안 됨. 원칙대로 해."
//   = 가드(scripts/guard-max-file-lines.mjs)가 커밋을 막았고, EXCEPTIONS 등재 대신 **분리**로 해결.
//
// 이 파일 = 전문가·관리자가 보는 **답변함**(상태 필터 칩 + 받은 문의 목록) 1벌.
//   ⚠️ ExpertSheet.tsx 에 있던 블록을 **그대로 옮긴 것**(로직·마크업·스타일 변경 0 = 순수 이동).
//   상태(선택·필터·목록)는 여전히 부모(ExpertSheet)가 들고, 여기는 받아서 그리기만 한다.
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

import Icon from "@/components/Icon";
import { Brand, Spacing } from "@/constants/theme";
import type { Inquiry, InquiryStatus } from "../expertApi";
import { statusStyle } from "../statusStyle";
import { styles } from "../styles";

// 상태 필터 값 = ExpertSheet 와 같은 뜻 1벌(§16). 여기서 정의를 새로 만들지 않는다.
type Filter = "all" | InquiryStatus;

export default function ExpertInboxView({
  inquiries,
  filter,
  setFilter,
  filters,
  selectedId,
  theme,
  insets,
  t,
  modeToggle,
  onOpenProfileEdit,
  onOpenInquiry,
  onDeleteInquiry,
}: {
  inquiries: Inquiry[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  filters: readonly Filter[];
  selectedId: string | null;
  theme: any;
  insets: { bottom: number };
  t: (key: string, opts?: any) => string;
  modeToggle: React.ReactNode;
  onOpenProfileEdit: () => void;
  onOpenInquiry: (q: Inquiry) => void;
  onDeleteInquiry: (id: string) => void;
}) {
  const counts: Record<Filter, number> = {
    all: inquiries.length,
    pending: inquiries.filter((q) => q.status === "pending").length,
    in_review: inquiries.filter((q) => q.status === "in_review").length,
    answered: inquiries.filter((q) => q.status === "answered").length,
    rejected: inquiries.filter((q) => q.status === "rejected").length,
  };
  const filterLabel: Record<Filter, string> = {
    all: t("expert.fltAll"),
    pending: t("expert.stPending"),
    in_review: t("expert.stReview"),
    answered: t("expert.stAnswered"),
    rejected: t("expert.stRejected"),
  };
  const shown =
    filter === "all" ? inquiries : inquiries.filter((q) => q.status === filter);

  return (
    <View style={styles.container}>
      {/* 서브헤더 = 답변함 제목 + 프로필 편집 진입 + 상단 토글(시트 자체 헤더는 부모 모달) */}
      <View style={[styles.subHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.subHeaderRow}>
          <Text style={[styles.subTitle, { color: theme.text }]}>
            {t("expert.answerBox")}
          </Text>
          <Pressable
            onPress={onOpenProfileEdit}
            hitSlop={10}
            style={styles.iconBtn}
          >
            <Icon name="user" size={22} color={Brand.primary} />
          </Pressable>
        </View>
        {modeToggle}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 상태 필터 칩 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {filters.map((f) => {
            const on = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on
                      ? Brand.primary
                      : theme.backgroundDefault,
                    borderColor: on ? Brand.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: on ? "#FFF" : theme.textSecondary },
                  ]}
                >
                  {filterLabel[f]} {counts[f]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textTertiary }]}>
            {t("expert.inboxNoItems")}
          </Text>
        ) : (
          shown.map((q) => {
            const isSelected = selectedId === q.id;
            const st = statusStyle(q.status, theme, t);
            const dest = q.itineraryData?.destination || t("expert.inquiry");
            const dayCount = q.itineraryData?.dayCount ?? 0;
            const totalPlaces = q.itineraryData?.totalPlaces ?? 0;

            return (
              <Pressable
                key={q.id}
                style={[
                  styles.inquiryCard,
                  {
                    backgroundColor: isSelected
                      ? "#EFF6FF"
                      : theme.backgroundDefault,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? Brand.primary : theme.border,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                  },
                ]}
                onPress={() => onOpenInquiry(q)}
              >
                <View style={styles.flex1}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text
                      style={[
                        styles.inquiryTitle,
                        {
                          color: isSelected ? Brand.primary : theme.text,
                          fontWeight: isSelected ? "700" : "600",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {dest}
                    </Text>
                    {dayCount > 0 && (
                      <View
                        style={{
                          backgroundColor: `${Brand.primary}18`,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: "Pretendard-Bold",
                            color: Brand.primary,
                          }}
                        >
                          {dayCount}일 · {totalPlaces}개 장소
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.inquiryPreview,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {q.userMessage}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: 8,
                  }}
                >
                  {/* 예약/검증 구분 배지 */}
                  {q.kind === "booking" ? (
                    <View
                      style={[styles.badge, { backgroundColor: Brand.primary }]}
                    >
                      <Text style={[styles.badgeText, { color: "#FFF" }]}>
                        {t("expert.kindBooking")}
                        {q.dayNumber ? ` D${q.dayNumber}` : ""}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[styles.badge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.badgeText, { color: st.fg }]}>
                      {st.label}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={10}
                    style={{
                      padding: 4,
                      borderRadius: 12,
                      backgroundColor: isSelected ? "#DBEAFE" : "#F1F5F9",
                    }}
                    onPress={(e) => {
                      e.stopPropagation();
                      onDeleteInquiry(q.id);
                    }}
                  >
                    <Icon name="x" size={15} color={theme.textTertiary} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
