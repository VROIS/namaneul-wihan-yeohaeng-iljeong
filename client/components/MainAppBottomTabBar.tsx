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
  aiOpensInPlace,
}: {
  activeTab?: "Home" | "Map" | "Verify" | "Profile" | "Guide" | "BTS";
  // ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-5) = BTS 여정화면 전용.
  //   여정이 이미 눈앞에 있으므로 AI의견·전문가를 **창을 새로 열지 않고 그 자리에서** 띄운다.
  //   (없으면 = 기존 그대로 = 메인앱 창을 올린 뒤 신호)
  aiOpensInPlace?: boolean;
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
    requestMainApp,
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

  // ⚠️ 수정금지(승인필요) 2026-07-30 사장님 SSOT = **AI의견 = 여정이 있을 때만 활성.**
  //   이유: "지금 보고 있는 여정"에 대해 묻는 버튼이다. 여정이 없으면 물어볼 대상이 없고 크레딧 5 가 헛나간다.
  //   (전문가 탭은 2026-08-07 SSOT 로 이 조건에서 분리됨 = 아래 Verify 주석 참조 = 독립 탭)
  const needsItinerary = !currentItinerary;

  // ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **BTS 를 떠나지 않는다.**
  //   옛것(`navigate("Main")` = 화면을 메인앱으로 갈아끼움) 완전삭제 §19.
  //   사고: 그 방식은 **안드로이드에서 BTS 가 통째로 사라졌다**(아이폰만 정상 = 두 OS 가 달랐다).
  //   지금은 화면을 바꾸지 않고 **메인앱을 위로 스르륵 올린다**(전문가·AI의견 모달과 같은 방식 §16).
  //   → 뒤의 BTS 가 살아 있고 손가락으로 내릴 수 있다 = **두 앱이 공존**.
  const handleTabPress = (key: string) => {
    switch (key) {
      case "Home":
        requestMainApp("Home");
        break;
      case "Map":
        if (needsItinerary) return; // 여정 없음 = 무동작(비활성)
        // ⚠️ 2026-07-31 = BTS 여정화면(aiOpensInPlace) = 여정이 이미 눈앞 = 창 안 열고 그 자리에서(FE-5).
        if (aiOpensInPlace) {
          requestAiOpinion();
          break;
        }
        requestMainApp("Home");
        setTimeout(() => requestAiOpinion(), 150);
        break;
      case "Verify":
        // ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = [전문가 검증] = **독립 탭** = 터치하면 그 자리에서 열림.
        //   분기는 **비로그인 하나뿐**(여정 유무·역할·배지·현재 화면 안 봄) = MainTabNavigator 와 **같은 규칙 1벌**.
        //   전문가 창 = App 최상위 전역 마운트 = 어느 화면 위에든 그대로 뜬다 → **화면을 바꿀 필요가 없다.**
        //   옛것 2가지 완전삭제 §19:
        //     ① 여정 없으면 무동작 = 메인앱에만 풀려 있어 **BTS 에서 관리자도 잠기던** 원인.
        //     ② requestMainApp("Home") 후 150ms 뒤 신호 = 메인앱 창이 전문가 창을 **덮어 안 보이던** 원인
        //        (App 렌더 순서상 MainAppOverlay 가 ExpertOverlay 보다 위. 2026-08-07 크롬 실증으로 확인).
        //   ※ AI의견(Map)은 다르다 = 그 창은 여정화면 안에 살아서 메인앱을 올려야 한다 = 그쪽 분기 유지.
        if (isAuthed) {
          requestExpert();
        } else {
          requestLogin();
        }
        break;
      case "Profile":
        requestMainApp("Profile");
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
      disabled: needsItinerary,
    },
    {
      // 전문가 = 독립 탭 = 화면·여정과 무관하게 항상 활성(비로그인만 눌렀을 때 로그인 유도) = 2026-08-07 §19
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
              // 비활성이면 눌리는 느낌도 주지 않는다(색만 흐린 채 눌리던 옛 동작 삭제 §19)
              activeOpacity={isIconDisabled ? 1 : 0.7}
              disabled={isIconDisabled}
              accessibilityRole="button"
              accessibilityState={{
                selected: isActive,
                disabled: !!isIconDisabled,
              }}
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
