import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, useColorScheme, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import Icon from "@/components/Icon";
import TabBarLabel from "@/components/TabBarLabel";

import { Brand, Colors } from "@/constants/theme";
import TripPlannerScreen from "@/screens/trip-planner/TripPlannerScreen";
import ProfileScreen from "@/screens/profile/ProfileScreen";
// ⚠️ 사장님 SSOT 2026-07-14 = 전문가 = 여정화면 위 오버레이(AI의견과 동일). 옛 별도탭 화면 폐기 §19 = 탭은 트리거만(requestExpert).
import { tabBadgeCount } from "@/screens/expert/expertApi"; // 전문가 탭 배지 = 역할별(사용자=안읽은답변/전문가=대기문의). 역할 조회는 탭 활성과 무관해져 삭제 = 2026-08-07 §19
// 📥 2026-08-03 사장님 확정 = 영상 완성 알림 = 벨 알림 안 씀 → **하단 TRIPIS 탭 뱃지**(전문가 뱃지와 같은 구현).
import { videoBadgeCount } from "@/components/tripis/savedVideosApi";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 지적 = 결제하고 돌아왔으면 **처음부터 프로필(충전소)** 로 뜬다.
import { readPaymentReturn } from "@/lib/paymentReturn";

export type MainTabParamList = {
  Home: { itineraryId?: number } | undefined;
  Map: undefined;
  Verify: undefined; // 검증 센터 (센터 위치)
  Profile: undefined;
  // ⚠️ 사장님 SSOT 2026-07-19 = 5번째 탭 = 설정(관리자모달) 완전교체 → 가이드 미니앱 진입(§12 2단계). 관리자 대시보드 = 프로필>설정메뉴(SettingsMenu.tsx:38)에 이미 있어 중복 = 제거 §19.
  Guide: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function MapTogglePlaceholder() {
  return <View style={{ flex: 1 }} />;
}

function GuideTabPlaceholder() {
  return <View style={{ flex: 1 }} />;
}

export default function MainTabNavigator() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];
  // ⚠️ 2026-07-03 사장님 SSOT = 지도는 결과화면 고정섹션이라 하단 지도토글 버튼(showMap)은 죽은 버튼 = "AI 의견" 버튼으로 교체.
  const {
    currentItinerary,
    requestAiOpinion,
    requestExpert,
    expertDataChangedAt,
    videoDataChangedAt,
    authChangedAt,
    requestLogin,
    isAuthed,
    requestHome,
  } = useMapToggle();
  // ⚠️ 수정금지(승인필요) — 삼성폰 하단 3버튼 겹침 방지 (SafeArea 여백)
  const insets = useSafeAreaInsets();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  //   ⚠️ 사장님 SSOT 2026-07-14 = 답변 전송·문의 열람 직후 배지 즉시 갱신 = 화면 이동(navigation state 변화)마다 재조회 추가(30초 지연 stale 제거 §19).
  const [expertBadge, setExpertBadge] = useState(0);
  // 📥 완성 영상 뱃지(TRIPIS 탭) = 전문가 뱃지와 같은 폴링·신호 1벌(2026-08-03 사장님)
  const [videoBadge, setVideoBadge] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      tabBadgeCount()
        .then((n) => {
          if (alive) setExpertBadge(n);
        })
        .catch(() => {});
      videoBadgeCount()
        .then((n) => {
          if (alive) setVideoBadge(n);
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 1000);
    };
    const unsub = rootNavigation.addListener("state", debouncedLoad); // 화면 이동마다 배지 갱신 (1초 디바운스 = state 이벤트 스팸 방지)
    return () => {
      alive = false;
      clearInterval(iv);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [rootNavigation]);
  // ⚠️ 사장님 SSOT 2026-07-14 = 오버레이 안 문의접수·답변전송 직후 = 배지 즉시 재조회(오버레이는 navigation state 안 바꿔서 위 리스너로는 안 걸림 = 실시간 피드백 §19).
  useEffect(() => {
    if (!expertDataChangedAt) return;
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
  useEffect(() => {
    if (!videoDataChangedAt) return;
    let alive = true;
    videoBadgeCount()
      .then((n) => {
        if (alive) setVideoBadge(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [videoDataChangedAt]);
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 팝업(모달)은 navigation state를 안 바꿔 위 mount/이동 리스너로는 배지 재조회가 안 됨 → 로그인 직후 뱃지가 옛 값으로 남던 버그. authChangedAt 신호로 즉시 재조회(§16 신호 재사용, useProfile과 동일 패턴).
  useEffect(() => {
    if (!authChangedAt) return;
    let alive = true;
    tabBadgeCount()
      .then((n) => {
        if (alive) setExpertBadge(n);
      })
      .catch(() => {});
    videoBadgeCount()
      .then((n) => {
        if (alive) setVideoBadge(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [authChangedAt]);

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
        iconName = "bot"; // ⚠️ 사장님 SSOT 2026-07-15 = "AI 의견" = bot(로봇) = AI. 옛 brain 은 전문가 검증으로 이관 §19.
        break;
      case "Verify":
        iconName = "brain"; // ⚠️ 사장님 SSOT 2026-07-15 = "전문가 검증" = brain(사람 전문가의 판단). 옛 check-circle 폐기 §19.
        break;
      case "Profile":
        iconName = "user";
        break;
      case "Guide":
        iconName = "camera"; // ⚠️ 사장님 SSOT 2026-07-19 = 가이드 미니앱 진입(§12). 옛 settings(관리자) 폐기 §19 = 관리자는 프로필>설정메뉴.
        break;
      default:
        iconName = "circle";
    }

    return <Icon name={iconName} size={24} color={color} />;
  };

  return (
    <>
      <Tab.Navigator
        // ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **첫 화면(부모)** 을 여기서 정한다.
        initialRouteName={readPaymentReturn() && isAuthed ? "Profile" : "Home"}
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
            tabBarLabel: ({ color }) => (
              <TabBarLabel label={t("tab.plan")} color={color} />
            ),
            headerShown: false,
          }}
          listeners={{
            // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = Plan 탭 = 홈페이지의 홈버튼과 같은 개념 =
            tabPress: () => {
              requestHome();
            },
          }}
        />
        {/* 🧠 AI 의견 (여정 생성 후에만 활성. 지도는 결과화면 고정섹션이라 이 탭 자리를 대체함) */}
        <Tab.Screen
          name="Map"
          component={MapTogglePlaceholder}
          options={{
            tabBarLabel: ({ color }) => (
              <TabBarLabel label={t("tab.aiOpinion")} color={color} />
            ),
            headerShown: false,
            tabBarIcon: () => (
              <Icon
                name="bot"
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
        {/* ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = [전문가 검증] = **독립 탭** (조건 1벌 = 여기).
            조건은 **로그인 여부 하나뿐**(isAuthed). 여정 유무·역할·배지 등 화면 상태를 일절 안 본다.
            이유(사장님): 이 탭은 문의·예약을 즉시 보고 응답하는 **현황판**이다. 관리자·전문가는 어느 화면에서든
              들어와 답해야 하고, 사용자도 로그인만 했으면 언제든 자기 문의 상태를 봐야 한다.
            효과: 화면이 더 늘거나 바뀌어도 **탭 동작이 화면과 무관** = BTS 잠김 같은 회귀가 구조적으로 불가.
            문의 "작성"의 크레딧 10 보호는 시트 안 canSubmit(ExpertSheet)이 담당 = 여는 것과 쓰는 것을 분리.
            옛 조건(역할·여정·배지 조합 = MainAppBottomTabBar 와 두 벌로 갈려 BTS 에서 관리자도 잠기던 것) 완전삭제 §19. */}
        <Tab.Screen
          name="Verify"
          component={MapTogglePlaceholder}
          options={{
            tabBarLabel: ({ color }) => (
              <TabBarLabel label={t("tab.expert")} color={color} />
            ),
            headerShown: false,
            tabBarBadge: expertBadge > 0 ? expertBadge : undefined,
            tabBarIcon: ({ color }) => (
              <Icon
                name="brain"
                size={24}
                color={isAuthed ? Brand.primary : theme.textTertiary}
              />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              // ⚠️ 수정금지(승인필요) 2026-08-07 사장님 SSOT = 터치 = 무조건 열림. 분기는 **비로그인 하나뿐**.
              if (isAuthed) {
                requestExpert();
              } else {
                requestLogin();
              }
            },
          }}
        />
        {/* 👤 프로필 */}
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarLabel: ({ color }) => (
              <TabBarLabel label={t("tab.profile")} color={color} />
            ),
            headerTitle: t("tab.profile"),
          }}
        />
        {/* 📷 가이드 (§12 2단계) - 클릭 시 GuideMiniApp 풀스크린으로 열림. 옛 설정(관리자모달) 완전교체 §19 = 관리자는 프로필>설정메뉴 중복존재. */}
        <Tab.Screen
          name="Guide"
          component={GuideTabPlaceholder}
          options={{
            tabBarLabel: ({ color }) => (
              <TabBarLabel label={t("tab.guide")} color={color} />
            ),
            headerShown: false,
            // 📥 완성 영상 뱃지(2026-08-03 사장님) = 전문가 탭과 같은 표기 1벌
            tabBarBadge: videoBadge > 0 ? videoBadge : undefined,
          }}
          listeners={({ navigation: tabNavigation }) => ({
            // 📥 2026-08-03 사장님 확정 = 뱃지가 켜져 있으면 이 탭 = **프로필**(완성 영상이 자동 게시된 화면)로 분기.
            tabPress: (e) => {
              e.preventDefault();
              if (videoBadge > 0) {
                tabNavigation.navigate("Profile");
                return;
              }
              if (isAuthed) rootNavigation.navigate("GuideMiniApp");
              else requestLogin();
            },
          })}
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
