import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, useColorScheme, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import Icon from "@/components/Icon";

import { Brand, Colors } from "@/constants/theme";
import TripPlannerScreen from "@/screens/trip-planner/TripPlannerScreen";
import ProfileScreen from "@/screens/profile/ProfileScreen";
// ⚠️ 사장님 SSOT 2026-07-14 = 전문가 = 여정화면 위 오버레이(AI의견과 동일). 옛 별도탭 화면 폐기 §19 = 탭은 트리거만(requestExpert).
import { tabBadgeCount, getMyRole } from "@/screens/expert/expertApi"; // 전문가 탭 배지 = 역할별(사용자=안읽은답변/전문가=대기문의) + 역할(탭 활성 분기)
// 📥 2026-08-03 사장님 확정 = 영상 완성 알림 = 벨 알림 안 씀 → **하단 TRIPIS 탭 뱃지**(전문가 뱃지와 같은 구현).
//   뱃지 원천 = saved_videos.is_new(서버) = 앱을 껐다 와도 폴링이 다시 인식. 해제 = 그 영상 뷰 1회 열람.
import { videoBadgeCount } from "@/components/tripis/savedVideosApi";
import { useMapToggle } from "@/contexts/MapToggleContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  // 🗂️ 2026-07-03 = itineraryId 있으면 저장여정 복원(프로필 나의여정 카드 탭 → 여정화면 그대로). 없으면 신규 생성(기존).
  Home: { itineraryId?: number } | undefined;
  Map: undefined;
  Verify: undefined; // 검증 센터 (센터 위치)
  Profile: undefined;
  // ⚠️ 사장님 SSOT 2026-07-19 = 5번째 탭 = 설정(관리자모달) 완전교체 → 가이드 미니앱 진입(§12 2단계). 관리자 대시보드 = 프로필>설정메뉴(SettingsMenu.tsx:38)에 이미 있어 중복 = 제거 §19.
  Guide: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// 🗺️ 지도 토글용 더미 컴포넌트 (실제로 화면 이동 안함)
function MapTogglePlaceholder() {
  return <View style={{ flex: 1 }} />;
}

// 📷 가이드 탭 더미 컴포넌트 (실제로는 tabPress에서 GuideMiniApp 풀스크린으로 열림)
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
  } = useMapToggle();
  // ⚠️ 수정금지(승인필요) — 삼성폰 하단 3버튼 겹침 방지 (SafeArea 여백)
  const insets = useSafeAreaInsets();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ⚠️ 2026-07-13 = 전문가 탭 배지(시안 D) = 답변 안 읽은 수. 초기 1회 + 30초 폴링(경량).
  //   ⚠️ 사장님 SSOT 2026-07-14 = 답변 전송·문의 열람 직후 배지 즉시 갱신 = 화면 이동(navigation state 변화)마다 재조회 추가(30초 지연 stale 제거 §19).
  const [expertBadge, setExpertBadge] = useState(0);
  // 📥 완성 영상 뱃지(TRIPIS 탭) = 전문가 뱃지와 같은 폴링·신호 1벌(2026-08-03 사장님)
  const [videoBadge, setVideoBadge] = useState(0);
  // ⚠️ 사장님 SSOT 2026-07-14 = 역할=전문가/관리자면 [전문가]탭 항상 활성(자기 여정 없어도 답변함 진입 가능). 사용자는 여정 있을 때만.
  const [isExpertRole, setIsExpertRole] = useState(false);
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
    getMyRole()
      .then((r) => {
        if (alive) setIsExpertRole(r === "expert" || r === "admin");
      })
      .catch(() => {});
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
  // 📥 2026-08-03 = 완성 영상 뷰 1회 열람(모달, navigation state 안 바뀜) 직후 = TRIPIS 탭 뱃지 즉시 재조회(전문가 신호와 동일 패턴 §16).
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
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 팝업(모달)은 navigation state를 안 바꿔 위 mount/이동 리스너로는 role 재조회 안 됨 → 관리자(사장님) 메일 로그인 직후에도 isExpertRole=false로 남아 [전문가]탭 프리패스 안 되던 버그. authChangedAt 신호로 role+배지 즉시 재조회(§16 신호 재사용, useProfile과 동일 패턴).
  useEffect(() => {
    if (!authChangedAt) return;
    let alive = true;
    getMyRole()
      .then((r) => {
        if (alive) setIsExpertRole(r === "expert" || r === "admin");
      })
      .catch(() => {});
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
        {/* ✅ 전문가 (센터) = 현지 전문가 문의 = 로그인시 100% 오버레이 오픈 */}
        <Tab.Screen
          name="Verify"
          component={MapTogglePlaceholder}
          options={{
            tabBarLabel: t("tab.expert"),
            headerShown: false,
            tabBarBadge: expertBadge > 0 ? expertBadge : undefined,
            tabBarIcon: ({ color }) => (
              <Icon
                name="brain"
                size={24}
                color={
                  currentItinerary && isAuthed
                    ? Brand.primary
                    : theme.textTertiary
                }
              />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              // ⚠️ 수정금지(승인필요) 2026-07-30 = 여정이 있어야 활성(= AI의견과 같은 규칙 1벌).
              //   옛것(여정 없어도 눌림)은 물어볼 대상 없이 크레딧 10 이 빠지는 경로 = 삭제 §19.
              if (!currentItinerary) return;
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
            tabBarLabel: t("tab.profile"),
            headerTitle: t("tab.profile"),
          }}
        />
        {/* 📷 가이드 (§12 2단계) - 클릭 시 GuideMiniApp 풀스크린으로 열림. 옛 설정(관리자모달) 완전교체 §19 = 관리자는 프로필>설정메뉴 중복존재. */}
        <Tab.Screen
          name="Guide"
          component={GuideTabPlaceholder}
          options={{
            tabBarLabel: t("tab.guide"),
            headerShown: false,
            // 📥 완성 영상 뱃지(2026-08-03 사장님) = 전문가 탭과 같은 표기 1벌
            tabBarBadge: videoBadge > 0 ? videoBadge : undefined,
          }}
          listeners={({ navigation: tabNavigation }) => ({
            // ⚠️ 사장님 SSOT 2026-07-25 = Tripis(가이드)탭 = 여정생성 버튼과 동일 인증게이트 = 비인증이면 로그인 팝업(무방비 진입 차단), 인증됨(관리자 포함)이면 바로 진입(프리패스).
            // ⚠️ 2026-07-27 = 로그인 판정은 전역 1곳(isAuthed)만 읽음(§0). 저장소를 직접 읽던 옛 방식 폐기 §19.
            // 📥 2026-08-03 사장님 확정 = 뱃지가 켜져 있으면 이 탭 = **프로필**(완성 영상이 자동 게시된 화면)로 분기.
            //   뱃지 해제는 여기가 아니라 그 영상 뷰를 1회 열 때(서버 is_new) = 앱을 껐다 와도 서버가 기억.
            //   뱃지 없으면 = 원래 기능(카메라 미니앱) 그대로.
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
