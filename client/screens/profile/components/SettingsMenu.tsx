// 설정 섹션(메뉴 목록 + 로그아웃) = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable } from "react-native";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { styles } from "../styles";
import type { ProfileApi } from "../hooks/useProfile";

export default function SettingsMenu({ profile }: { profile: ProfileApi }) {
  const { theme, t, navigation, isAuth, setShowLanguageModal, handleLogout } = profile;

  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>설정</ThemedText>
      <View
        style={[
          styles.menuCard,
          { backgroundColor: theme.backgroundDefault },
        ]}
      >
        {[
          // 2026-07-13 = 내 문의함 바로가기(사장님 SSOT) = 전문가 탭(하단 내문의함)으로 이동. 전문가 문의 답변 확인.
          {
            icon: "award",
            label: t("expert.myInbox"),
            onPress: () => (navigation as any).navigate("Verify"),
          },
          {
            icon: "credit-card",
            label: "결제 수단 및 내역",
            onPress: () => {
              // TODO: 결제 화면 라우팅 추가 예정
              alert("결제 기능을 준비 중입니다.");
            }
          },
          {
            icon: "settings",
            label: "관리자 대시보드",
            onPress: () => navigation.navigate("AdminModal"),
          },
          { icon: "bell", label: "알림 설정" },
          {
            icon: "globe",
            label: t("profile.language"),
            onPress: () => setShowLanguageModal(true),
          },
          { icon: "shield", label: "개인정보 보호" },
          { icon: "help-circle", label: "도움말" },
        ].map((item, index, arr) => (
          <Pressable
            key={index}
            onPress={item.onPress}
            style={[
              styles.menuItem,
              index < arr.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <View style={styles.menuItemLeft}>
              <Icon
                name={item.icon as any}
                size={20}
                color={theme.textSecondary}
              />
              <Text style={[styles.menuItemLabel, { color: theme.text }]}>
                {item.label}
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.textTertiary} />
          </Pressable>
        ))}
        {isAuth && (
          <Pressable
            style={[
              styles.menuItem,
              { borderTopWidth: 1, borderTopColor: theme.border },
            ]}
            onPress={handleLogout}
          >
            <View style={styles.menuItemLeft}>
              <Icon name="log-out" size={20} color="#EF4444" />
              <Text style={[styles.menuItemLabel, { color: "#EF4444" }]}>
                {t("profile.logout")}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}
