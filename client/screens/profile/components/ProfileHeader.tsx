// 프로필 헤더 섹션 (슬림 초슬림 1섹션 컴팩트 디자인)
import React from "react";
import { View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { styles } from "../styles";
import type { ProfileApi } from "../hooks/useProfile";

export default function ProfileHeader({ profile }: { profile: ProfileApi }) {
  const { theme, isAuth, user, credits, recharging, handleRecharge } = profile;
  const { requestLogin } = useMapToggle();

  // ⚠️ 보유 크레딧 = 서버(GET /api/credits/balance)가 정본 = 2026-07-29 §9.
  //   옛 `(user as any)?.credits ?? 150` 폐기 §19 = 클라 사용자정보엔 credits 가 없어 **항상 가짜 150** 이 보였음.
  //   아직 못 받았거나 미로그인 = null → "-" 로 표시(가짜 숫자 금지).
  const creditText = credits === null ? "-" : `${credits} C`;

  return (
    <View style={styles.profileCard}>
      {/* 1행: 아바타(44px) + 사용자 이름 & 이메일 가로 배치 */}
      <View style={styles.profileTopRow}>
        <View style={styles.profileUserInfoLeft}>
          <LinearGradient
            colors={[Brand.primary, Brand.secondary]}
            style={styles.avatarGradientCompact}
          >
            <Icon name="user" size={22} color="#FFFFFF" />
          </LinearGradient>

          <View style={styles.userTextContainer}>
            {isAuth && user ? (
              <>
                <ThemedText style={styles.userNameCompact} numberOfLines={1}>
                  {user.name || "사용자"}
                </ThemedText>
                <Text
                  style={[
                    styles.userEmailCompact,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              </>
            ) : (
              <>
                <ThemedText style={styles.userNameCompact}>
                  로그인이 필요합니다
                </ThemedText>
                <Pressable onPress={() => requestLogin()}>
                  <Text
                    style={{
                      color: Brand.primary,
                      fontSize: 12,
                      fontFamily: "Bold",
                    }}
                  >
                    로그인 / 가입하기
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>

      {/* 2행: 초슬림 1줄 3D 크레딧 바 (높이 34px) */}
      <View
        style={[
          styles.creditCardCompact,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.creditLeftCompact}>
          <View style={styles.creditIconCircleCompact}>
            <Icon name="credit-card" size={14} color={Brand.primary} />
          </View>
          <Text
            style={[styles.creditLabelCompact, { color: theme.textSecondary }]}
          >
            보유 크레딧
          </Text>
          <Text style={[styles.creditValueCompact, { color: theme.text }]}>
            {creditText}
          </Text>
        </View>

        {/* 충전 = Stripe 결제창을 브라우저로 연다(2026-07-29 §9). 버튼 모양·문구는 그대로. */}
        <Pressable
          style={styles.creditRechargeBtnCompact}
          onPress={handleRecharge}
          disabled={recharging}
          hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="크레딧 충전"
          accessibilityState={{ disabled: recharging, busy: recharging }}
        >
          <Icon name="plus-circle" size={12} color="#FFFFFF" />
          <Text style={styles.creditRechargeTextCompact}>
            {recharging ? "진행 중" : "충전"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
