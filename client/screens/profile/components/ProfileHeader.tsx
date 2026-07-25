// 프로필 아바타·이름·통계 헤더 섹션 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
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
  const { theme, persona, isAuth, user, stats } = profile;
  // ⚠️ 사장님 SSOT 2026-07-25 = "로그인/가입하기" = 별도 Login 화면 이동 대신 인앱 팝업(§16 전역 LoginSheet). 화면 이동 폐기.
  const { requestLogin } = useMapToggle();

  return (
    <>
      <View style={styles.profileCard}>
        <LinearGradient
          colors={
            persona === "luxury"
              ? [Brand.luxuryGold, "#F97316"]
              : [Brand.comfortBlue, "#06B6D4"]
          }
          style={styles.avatarGradient}
        >
          <Icon name="user" size={36} color="#FFFFFF" />
        </LinearGradient>
        {isAuth && user ? (
          <>
            <ThemedText style={styles.userName}>{user.name}</ThemedText>
            <Text style={[styles.userEmail, { color: theme.textSecondary }]}>
              {user.email}
            </Text>
          </>
        ) : (
          <>
            <ThemedText style={styles.userName}>로그인이 필요합니다</ThemedText>
            <Pressable
              style={[styles.loginButton, { backgroundColor: Brand.primary }]}
              onPress={() => requestLogin()}
            >
              <Text style={styles.loginButtonText}>로그인 / 가입하기</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.statsRow}>
        {stats.map((stat, index) => (
          <View
            key={index}
            style={[
              styles.statCard,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <Icon
              name={stat.icon as any}
              size={20}
              color={Brand.primary}
              style={styles.statIcon}
            />
            <Text style={[styles.statValue, { color: theme.text }]}>
              {stat.value}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
