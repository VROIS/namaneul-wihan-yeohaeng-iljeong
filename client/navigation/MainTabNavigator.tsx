import React from "react";
import { StyleSheet, Platform, useColorScheme, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import Icon from "@/components/Icon";

import { Brand, Colors } from "@/constants/theme";
import TripPlannerScreen from "@/screens/TripPlannerScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import VerificationRequestScreen from "@/screens/VerificationRequestScreen";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  // 🗂️ 2026-07-03 = itineraryId 있으면 저장여정 복원(프로필 나의여정 카드 탭 → 여정화면 그대로). 없으면 신규 생성(기존).
  Home: { itineraryId?: number } | undefined;
  Map: undefined;
  Verify: undefined; // 검증 센터 (센터 위치)
  Profile: undefined;
  Admin: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// 🗺️ 지도 토글용 더미 컴포넌트 (실제로 화면 이동 안함)
function MapTogglePlaceholder() {
  return <View style={{ flex: 1 }} />;
}

// ⚙️ 관리자 더미 컴포넌트 (실제로는 모달로 열림)
function AdminPlaceholder() {
  return <View style={{ flex: 1 }} />;
}

export default function MainTabNavigator() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];
  // ⚠️ 2026-07-03 사장님 SSOT = 지도는 결과화면 고정섹션이라 하단 지도토글 버튼(showMap)은 죽은 버튼 = "AI 의견" 버튼으로 교체.
  const { currentItinerary, requestAiOpinion } = useMapToggle();
  // ⚠️ 수정금지(승인필요) — 삼성폰 하단 3버튼 겹침 방지 (SafeArea 여백)
  const insets = useSafeAreaInsets();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const getTabBarIcon = (
    routeName: string,
    color: string,
    focused: boolean,
  ) => {
    let iconName: string;

    switch (routeName) {
      case "Home":
        iconName = "edit-3";
        break;
      case "Map":
        iconName = "brain"; // ⚠️ 2026-07-03 = "AI 의견" 아이콘(Lucide, 이모지 금지). Icon.tsx 기존 매핑 재사용.
        break;
      case "Verify":
        iconName = "check-circle"; // ✅ 전문가 검증
        break;
      case "Profile":
        iconName = "user";
        break;
      case "Admin":
        iconName = "settings";
        break;
      default:
        iconName = "circle";
    }

    return <Icon name={iconName} size={24} color={color} />;
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, focused }) =>
            getTabBarIcon(route.name, color, focused),
          tabBarActiveTintColor: Brand.primary,
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: Platform.select({
              ios: "transparent",
              android: theme.backgroundDefault,
              web: theme.backgroundDefault,
            }),
            borderTopWidth: 0,
            elevation: 0,
            // ⚠️ 수정금지(승인필요) — 삼성폰 하단 시스템 버튼 겹침 방지
            height: 55 + insets.bottom,
            paddingBottom: insets.bottom,
          },
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                intensity={80}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : null,
          headerShown: true,
          headerTransparent: true,
          headerBlurEffect: isDark ? "dark" : "light",
          headerTintColor: theme.text,
          headerStyle: {
            backgroundColor: Platform.select({
              ios: undefined,
              android: theme.backgroundRoot,
              web: theme.backgroundRoot,
            }),
          },
          headerTitleAlign: "center",
        })}
      >
        {/* 📋 일정 (메인) */}
        <Tab.Screen
          name="Home"
          component={TripPlannerScreen}
          options={{
            tabBarLabel: t("tab.plan"),
            headerShown: false,
          }}
        />
        {/* 🧠 AI 의견 (여정 생성 후에만 활성. 지도는 결과화면 고정섹션이라 이 탭 자리를 대체함) */}
        <Tab.Screen
          name="Map"
          component={MapTogglePlaceholder}
          options={{
            tabBarLabel: t("tab.aiOpinion"),
            headerShown: false,
            // 여정 없으면 비활성(회색), 있으면 활성(브랜드색)
            tabBarIcon: () => (
              <Icon
                name="brain"
                size={24}
                color={currentItinerary ? Brand.primary : theme.textTertiary}
              />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault(); // 화면 이동 방지(결과화면 위 오버레이로 표시)
              if (currentItinerary) requestAiOpinion(); // 여정 없으면 무동작(비활성)
            },
          }}
        />
        {/* ✅ 전문가 검증 (센터) */}
        <Tab.Screen
          name="Verify"
          component={VerificationRequestScreen}
          options={{
            tabBarLabel: t("tab.expert"),
            headerTitle: t("verify.title"),
          }}
        />
        {/* 👤 프로필 */}
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarLabel: t("tab.profile"),
            headerTitle: t("tab.profile"),
          }}
        />
        {/* ⚙️ 설정 (관리자) - 클릭 시 모달로 열림 */}
        <Tab.Screen
          name="Admin"
          component={AdminPlaceholder}
          options={{
            tabBarLabel: t("tab.settings"),
            headerShown: false,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              rootNavigation.navigate("AdminModal");
            },
          }}
        />
      </Tab.Navigator>
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  fabGradient: {
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
  },
});
