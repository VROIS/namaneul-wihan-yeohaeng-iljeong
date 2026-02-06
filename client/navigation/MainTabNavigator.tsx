import React from "react";
import { StyleSheet, Platform, useColorScheme, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Brand, Colors } from "@/constants/theme";
import TripPlannerScreen from "@/screens/TripPlannerScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import VerificationRequestScreen from "@/screens/VerificationRequestScreen";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  Home: undefined;
  Map: undefined;
  Verify: undefined;  // 검증 센터 (센터 위치)
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];
  const { showMap, toggleMap } = useMapToggle();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const getTabBarIcon = (routeName: string, color: string, focused: boolean) => {
    let iconName: keyof typeof Feather.glyphMap;
    
    switch (routeName) {
      case "Home":
        iconName = "edit-3";
        break;
      case "Map":
        iconName = "map";
        break;
      case "Verify":
        iconName = "check-circle";  // ✅ 전문가 검증
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
    
    return <Feather name={iconName} size={24} color={color} />;
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, focused }) => getTabBarIcon(route.name, color, focused),
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
            height: 55,
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
            tabBarLabel: "일정",
            headerShown: false,
          }}
        />
        {/* 🗺️ 지도 토글 버튼 (화면 이동 없이 일정표 내 지도 표시/숨김) */}
        <Tab.Screen
          name="Map"
          component={MapTogglePlaceholder}
          options={{
            tabBarLabel: "지도",
            headerShown: false,
            // 지도 활성화 상태에 따라 아이콘 색상 변경
            tabBarIcon: ({ focused }) => (
              <Feather 
                name={showMap ? "x" : "map"} 
                size={24} 
                color={showMap ? Brand.primary : theme.textTertiary} 
              />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();  // 화면 이동 방지
              toggleMap();         // 지도 토글
            },
          }}
        />
        {/* ✅ 전문가 검증 (센터) */}
        <Tab.Screen
          name="Verify"
          component={VerificationRequestScreen}
          options={{
            tabBarLabel: "전문가",
            headerTitle: "전문가 검증",
          }}
        />
        {/* 👤 프로필 */}
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarLabel: "프로필",
            headerTitle: "프로필",
          }}
        />
        {/* ⚙️ 설정 (관리자) - 클릭 시 모달로 열림 */}
        <Tab.Screen
          name="Admin"
          component={AdminPlaceholder}
          options={{
            tabBarLabel: "설정",
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
