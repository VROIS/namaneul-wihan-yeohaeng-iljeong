// 프로필 화면 = 헤더/통계 + 나의여정/영상/스타일/설정 섹션 조립 전용 = 2026-07-15 §0 슬림화 분리(옛 923줄 단일파일 → profile/ 폴더 완전분리, 순수 이동)
import React from "react";
import { ScrollView } from "react-native";
import { Spacing } from "@/constants/theme";
import { useProfile } from "./hooks/useProfile";
import ProfileHeader from "./components/ProfileHeader";
import TripsSection from "./components/TripsSection";
import VideosSection from "./components/VideosSection";
import PersonaSection from "./components/PersonaSection";
import SettingsMenu from "./components/SettingsMenu";
import LanguageModal from "./components/LanguageModal";

export default function ProfileScreen() {
  const profile = useProfile();
  const { theme, insets, headerHeight, tabBarHeight } = profile;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl + 60,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <ProfileHeader profile={profile} />
      <TripsSection profile={profile} />
      <VideosSection profile={profile} />
      <PersonaSection profile={profile} />
      <SettingsMenu profile={profile} />
      <LanguageModal profile={profile} />
    </ScrollView>
  );
}
