// ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = 문의 카드 **1벌**(전문가 답변함 · 사용자 문의함 공용).
//   근본: 같은 카드가 ExpertSheet(renderUserCard) 와 ExpertInboxView 에 2벌로 갈려 있었다(§0 위반) →
//   사장님 지시 "사용자에서 열리는 부분도 톤앤매너와 구성이 거의 같아야 함" = 두 벌 완전삭제 후 이 파일 1벌 §19.
//   레이아웃(사장님 확정 3줄) = ①여정명 + 규모 + 예약배지 ②문의 내용(가장 크게) ③상태·날짜 + 삭제(⋯).
//   상태 배지는 **필터가 '전체'일 때만** 표시 = 위 필터칩과 같은 말을 반복하지 않음(중복 제거).
import React from "react";
import { View, Text, Pressable } from "react-native";

import Icon from "@/components/Icon";
import { Brand } from "@/constants/theme";
import type { Inquiry } from "../expertApi";
import { statusStyle } from "../statusStyle";
import { styles } from "../styles";

export default function InquiryCard({
  q,
  isSelected,
  showStatus,
  showUnread,
  theme,
  t,
  onPress,
  onDelete,
}: {
  q: Inquiry;
  isSelected: boolean;
  /** 필터가 '전체'일 때만 true = 상태 배지 표시(특정 상태로 거른 목록엔 중복이라 숨김) */
  showStatus: boolean;
  /** ⚠️ 사용자 목록에서만 true. 안읽음 점 = "내가 받은 답변을 아직 안 읽음" = 사용자 기준 신호라
   *  전문가 답변함에 그리면 **이미 답변을 끝낸 건**에 점이 붙는 정반대 표시가 된다(§22 판단검증 2026-08-07). */
  showUnread: boolean;
  theme: any;
  t: (key: string, opts?: any) => string;
  onPress: () => void;
  onDelete: () => void;
}) {
  const st = statusStyle(q.status, theme, t);
  const dest = q.itineraryData?.destination || t("expert.inquiry");
  const dayCount = q.itineraryData?.dayCount ?? 0;
  const totalPlaces = q.itineraryData?.totalPlaces ?? 0;
  // 도착한 답변을 아직 안 읽음 = 왼쪽 위 점(사용자 목록에서만 = showUnread)
  const unread = showUnread && q.status === "answered" && !q.isReadByUser;
  const when = (q.answeredAt || q.createdAt || "").slice(5, 10); // MM-DD

  return (
    <Pressable
      style={[
        styles.inquiryCard,
        {
          flexDirection: "column",
          alignItems: "stretch",
          backgroundColor: isSelected ? "#EFF6FF" : theme.backgroundDefault,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? Brand.primary : theme.border,
          borderRadius: 16,
          padding: 14,
          marginBottom: 10,
          gap: 6,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dest} ${q.userMessage || ""} ${st.label}`.trim()}
    >
      {/* 안읽음 점 = 카드 왼쪽 위에 겹쳐 표시(absolute). 세로 배치라 그냥 두면 한 줄을 차지해
          안읽은 카드만 높아진다 = §22 판단검증 지적(2026-08-07). */}
      {unread ? (
        <View
          style={[styles.unreadDot, { position: "absolute", top: 8, left: 8 }]}
        />
      ) : null}

      {/* ① 여정명(+예약 Day) + 규모 + 예약 배지 */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
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
        {dayCount > 0 ? (
          <Text style={{ fontSize: 12, color: theme.textTertiary }}>
            {dayCount}일 · {totalPlaces}개 장소
          </Text>
        ) : null}
        {q.kind === "booking" ? (
          <View style={[styles.badge, { backgroundColor: Brand.primary }]}>
            <Text style={[styles.badgeText, { color: "#FFF" }]}>
              {t("expert.kindBooking")}
              {q.dayNumber ? ` D${q.dayNumber}` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ② 문의 내용 = 이 카드의 주인공 */}
      <Text
        style={[styles.inquiryPreview, { color: theme.text, fontSize: 14 }]}
        numberOfLines={2}
      >
        {q.userMessage}
      </Text>

      {/* ③ 상태(필터 전체일 때만) · 받은 날 + 삭제 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {showStatus ? (
          <Text style={{ fontSize: 12, color: st.fg, fontWeight: "600" }}>
            {st.label}
          </Text>
        ) : null}
        {when ? (
          <Text style={{ fontSize: 12, color: theme.textTertiary }}>
            {when}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {/* 삭제 = 원 안 빼기(minus-circle). 시트 닫기(✕)와 모양을 달리해 오조작 차단 = 2026-08-07 사장님 확정 */}
        <Pressable
          hitSlop={10}
          style={{ paddingHorizontal: 6, paddingVertical: 2 }}
          accessibilityRole="button"
          accessibilityLabel={t("common.delete")}
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Icon name="minus-circle" size={18} color={theme.textTertiary} />
        </Pressable>
      </View>
    </Pressable>
  );
}
