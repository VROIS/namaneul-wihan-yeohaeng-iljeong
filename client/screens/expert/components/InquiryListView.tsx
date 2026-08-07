// ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = 문의 목록(상태 필터칩 + 카드) **1벌** = 전문가 답변함·사용자 문의함 공용.
//   사장님 지시 = "사용자에서 열리는 부분도 톤앤매너와 구성이 거의 같아야 함" → 두 화면이 이 컴포넌트를 그대로 쓴다.
//   옛것 완전삭제 §19: ExpertInboxView(전문가 전용 목록) + ExpertSheet 의 나의예약/내문의함 2섹션 + renderUserCard.
//   정렬 = 예약(booking) 먼저, 그다음 검증 문의 (2026-07-24 "예약 = 비즈니스 우선" SSOT 를 섹션 대신 정렬로 유지).
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

import { Brand, Spacing } from "@/constants/theme";
import type { Inquiry, InquiryStatus } from "../expertApi";
import { styles } from "../styles";
import InquiryCard from "./InquiryCard";

type Filter = "all" | InquiryStatus;

export default function InquiryListView({
  inquiries,
  filter,
  setFilter,
  filters,
  selectedId,
  theme,
  t,
  emptyText,
  showUnread = false,
  onOpenInquiry,
  onDeleteInquiry,
}: {
  inquiries: Inquiry[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  filters: readonly Filter[];
  selectedId: string | null;
  theme: any;
  t: (key: string, opts?: any) => string;
  emptyText: string;
  /** 사용자 문의함만 true = 안읽은 답변 점 표시(전문가 답변함은 뜻이 반대라 끔, §22 2026-08-07) */
  showUnread?: boolean;
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
  const shown = (
    filter === "all" ? inquiries : inquiries.filter((q) => q.status === filter)
  )
    .slice()
    .sort(
      (a, b) => (a.kind === "booking" ? 0 : 1) - (b.kind === "booking" ? 0 : 1),
    );

  return (
    <>
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
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${filterLabel[f]} ${counts[f]}`}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? Brand.primary : theme.backgroundDefault,
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
        <Text
          style={[
            styles.empty,
            { color: theme.textTertiary, marginBottom: Spacing.md },
          ]}
        >
          {emptyText}
        </Text>
      ) : (
        shown.map((q) => (
          <InquiryCard
            key={q.id}
            q={q}
            isSelected={selectedId === q.id}
            showStatus={filter === "all"}
            showUnread={showUnread}
            theme={theme}
            t={t}
            onPress={() => onOpenInquiry(q)}
            onDelete={() => onDeleteInquiry(q.id)}
          />
        ))
      )}
    </>
  );
}
