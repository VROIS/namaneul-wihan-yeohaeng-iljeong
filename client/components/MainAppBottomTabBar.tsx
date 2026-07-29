import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useColorScheme,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import Icon from "@/components/Icon";
import { Brand, Colors } from "@/constants/theme";
import { tabBadgeCount } from "@/screens/expert/expertApi";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export default function MainAppBottomTabBar({
  activeTab,
}: {
  activeTab?: "Home" | "Map" | "Verify" | "Profile" | "Guide" | "BTS";
}) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    currentItinerary,
    requestAiOpinion,
    requestExpert,
    expertDataChangedAt,
    requestLogin,
    isAuthed,
  } = useMapToggle();

  const [expertBadge, setExpertBadge] = useState(0);

  useEffect(() => {
    let alive = true;
    tabBadgeCount()
      .then((n) => {
        if (alive) setExpertBadge(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [expertDataChangedAt]);

  const handleTabPress = (key: string) => {
    switch (key) {
      case "Home":
        rootNavigation.navigate("Main");
        break;
      case "Map":
        if (currentItinerary) {
          rootNavigation.navigate("Main");
          setTimeout(() => requestAiOpinion(), 150);
        } else {
          rootNavigation.navigate("Main");
        }
        break;
      case "Verify":
        if (isAuthed) {
          rootNavigation.navigate("Main");
          setTimeout(() => requestExpert(), 150);
        } else {
          requestLogin();
        }
        break;
      case "Profile":
        (rootNavigation as any).navigate("Main", { screen: "Profile" });
        break;
      case "Guide":
        if (isAuthed) {
          rootNavigation.navigate("GuideMiniApp");
        } else {
          requestLogin();
        }
        break;
    }
  };

  const tabs = [
    {
      key: "Home",
      label: t("tab.plan", "일정"),
      icon: "edit-3",
    },
    {
      key: "Map",
      label: t("tab.aiOpinion", "AI 의견"),
      icon: "bot",
      disabled: !currentItinerary,
    },
    {
      key: "Verify",
      label: t("tab.expert", "전문가"),
      icon: "brain",
      badge: expertBadge,
    },
    {
      key: "Profile",
      label: t("tab.profile", "프로필"),
      icon: "user",
    },
    {
      key: "Guide",
      label: t("tab.guide", "가이드"),
      icon: "camera",
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 6),
          backgroundColor: isDark
            ? "rgba(10, 8, 22, 0.95)"
            : "rgba(255, 255, 255, 0.95)",
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(0, 0, 0, 0.08)",
        },
      ]}
    >
      {Platform.OS === "ios" && (
        <BlurView
          intensity={80}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View style={styles.tabRow}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const isIconDisabled = tab.disabled;
          const color = isActive
            ? Brand.primary
            : isIconDisabled
              ? theme.textTertiary
              : isDark
                ? "rgba(255,255,255,0.65)"
                : theme.textSecondary;

          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabBtn}
              activeOpacity={0.7}
              onPress={() => handleTabPress(tab.key)}
            >
              <View>
                <Icon name={tab.icon} size={22} color={color} />
                {!!tab.badge && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    zIndex: 999,
    elevation: 20,
  },
  tabRow: {
    flexDirection: "row",
    height: 52,
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: "Pretendard-Bold",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
});
