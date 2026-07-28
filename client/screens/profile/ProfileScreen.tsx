// 프로필 화면 메인 = 상단 1섹션 고정(Sticky Profile & Credit) + 하단 무한 스크롤
import React from "react";
import { View, ScrollView } from "react-native";
import { Spacing } from "@/constants/theme";
import { useProfile } from "./hooks/useProfile";
import ProfileHeader from "./components/ProfileHeader";
import TripsSection from "./components/TripsSection";
import VideosSection from "./components/VideosSection";
import SettingsMenu from "./components/SettingsMenu";
import LanguageModal from "./components/LanguageModal";

export default function ProfileScreen() {
  const profile = useProfile();
  const { theme, insets, headerHeight, tabBarHeight } = profile;

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      {/* 📌 1섹션 고정 (슬림 초슬림 컴팩트 프로필 & 크레딧 고정) */}
      <View
        style={{
          paddingTop: Math.max(10, headerHeight - 16),
          paddingHorizontal: Spacing.lg,
          backgroundColor: theme.backgroundRoot,
          zIndex: 20,
        }}
      >
        <ProfileHeader profile={profile} />
      </View>

      {/* 📜 2섹션~무한 스크롤 영역 (나의 여정, 나의 영상, 설정, 로그아웃만 스크롤) */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 10,
          paddingBottom: tabBarHeight + Spacing.xl + 60,
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <TripsSection profile={profile} />
        <VideosSection profile={profile} />
        <SettingsMenu profile={profile} />
        <LanguageModal profile={profile} />
      </ScrollView>
    </View>
  );
}


