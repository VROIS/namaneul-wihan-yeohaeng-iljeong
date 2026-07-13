import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";

import {
  Spacing,
  BorderRadius,
  Brand,
  Typography,
  Colors,
  Shadows,
  Fonts,
} from "@/constants/theme";
import Icon from "@/components/Icon";
import ThemedText from "@/components/ThemedText";
import { apiRequest } from "@/lib/query-client";
import {
  getUserData,
  isAuthenticated,
  clearAuth,
  saveAuth,
  type UserData,
} from "@/lib/auth";
import { useTranslation } from "react-i18next";
import {
  SUPPORTED_LANGS,
  changeLanguageAndPersist,
} from "@/lib/i18n";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
// ⚠️ 2026-07-03 = 결과화면 요약헤더와 동일한 vibe 한국어 라벨 = 카드 요약 일관성(영어 노출 버그 수정). 공용 함수 재사용(재발명 금지 §16).
import { getVibeLabel } from "@/utils/vibeCalculator";

// 저장된 일정 타입
interface SavedItinerary {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  curationFocus: string;
  companionType: string;
  companionCount: number;
  vibes: string[];
  travelPace: string;
  videoStatus?: string;
  videoUrl?: string;
  // 🗂️ 2026-07-03 = 목록 API가 SELECT * = rawData 포함(storage.getUserItineraries). 카드 4요소(도시·기간·예산·요약)용.
  rawData?: { destination?: string; days?: Array<{ dailyCost?: { perPersonEur?: number } }> };
}

// 🗂️ 2026-07-03 = 카드 날짜 축약 "2026-07-03"/"...T..."→"26년 07-03" (메인앱 요약헤더 표기 통일). 형식 다르면 앞 10자.
function shortDateCard(d?: string): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[1].slice(2)}년 ${m[2]}-${m[3]}` : d.slice(0, 10);
}

// ⚠️ 2026-07-03 사장님 SSOT = 카드 요약 = 여정 결과화면 요약헤더(요약섹션2)를 그대로 재현 = 일관성.
//   결과화면과 동일: comp(N명)의 focus을/를 위한 [vibe 한국어 최대3 &연결] 여행. getVibeLabel=한국어 라벨(영어 노출 버그 수정), 받침 조사(을/를) 동일.
function summaryLineCard(trip: SavedItinerary, t: (k: string) => string): string {
  const companionLabels: Record<string, string> = {
    Single: t("labels.companionSingle"),
    Couple: t("labels.companionCouple"),
    Family: t("labels.companionFamily"),
    ExtendedFamily: t("labels.companionExtended"),
    Group: t("labels.companionGroup"),
  };
  const focusLabels: Record<string, string> = {
    Kids: t("labels.curationKids"),
    Parents: t("labels.curationParents"),
    Everyone: t("labels.curationEveryone"),
    Self: t("labels.curationSelf"),
  };
  const comp = companionLabels[trip.companionType] || t("labels.companionFamily");
  const focus = focusLabels[trip.curationFocus] || t("labels.curationEveryone");
  const vibes =
    (trip.vibes || []).slice(0, 3).map((v) => getVibeLabel(v as any)).join(" & ") || "힐링";
  const lastChar = focus.charCodeAt(focus.length - 1);
  const hasFinalConsonant =
    lastChar >= 0xac00 && lastChar <= 0xd7a3 && (lastChar - 0xac00) % 28 !== 0;
  const objParticle = hasFinalConsonant ? "을" : "를";
  return `${comp}(${trip.companionCount}명)의 ${focus}${objParticle} 위한 ${vibes} 여행`;
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, i18n } = useTranslation();
  const [persona, setPersona] = useState<"luxury" | "comfort">("comfort");

  // 🗂️ 저장된 일정 목록
  const [savedTrips, setSavedTrips] = useState<SavedItinerary[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  // 👤 사용자 정보
  const [user, setUser] = useState<UserData | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // 🗂️ 2026-07-03 = 프로필 진입마다 저장여정 목록 refetch (useFocusEffect) = 여정 저장 직후 프로필 탭 오면 방금 카드가 바로 보임.
  //   조회 user_id = 'admin' 고정 = 서버 POST /api/itineraries 가 user_id를 'admin'으로 강제 저장(§9 로그인 제거)하므로 조회도 일치시켜야 목록이 뜸.
  //   (나중 로그인 복원 시 = 저장/조회 둘 다 userData.id 로 동시 교체 = §19.)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const loadData = async () => {
        try {
          const authenticated = await isAuthenticated();
          if (cancelled) return;
          setIsAuth(authenticated);

          if (authenticated) {
            const userData = await getUserData();
            if (cancelled) return;
            setUser(userData);

            const response = await apiRequest(
              "GET",
              `/api/users/admin/itineraries`,
            );
            const trips = await response.json();
            if (cancelled) return;
            setSavedTrips(trips || []);
          } else {
            setSavedTrips([]);
          }
        } catch (error) {
          console.error("[Profile] 로드 오류:", error);
        } finally {
          if (!cancelled) setIsLoadingTrips(false);
        }
      };
      loadData();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 확인 팝업 없이 즉시 삭제(범용 홈페이지 닫기 버튼처럼). 목록에서 바로 제거(낙관적) + 서버 DELETE. 실패 시 그 항목만 복원.
  const handleDeleteTrip = async (id: number) => {
    const removed = savedTrips.find((t) => t.id === id); // 실패 시 되살릴 항목만 보관
    setSavedTrips((list) => list.filter((t) => t.id !== id)); // 즉시 화면에서 제거
    try {
      await apiRequest("DELETE", `/api/itineraries/${id}`);
    } catch (e) {
      console.error("[Profile] 여정 삭제 실패:", e);
      // 함수형 롤백 = 그 항목만 복원(연속 삭제 시 다른 삭제분 안 건드림). 이미 있으면 무시.
      if (removed) setSavedTrips((list) => (list.some((t) => t.id === id) ? list : [...list, removed]));
    }
  };

  const handleLanguageChange = async (code: string) => {
    await changeLanguageAndPersist(code);
    setShowLanguageModal(false);
    if (user?.id && user.id !== "guest_browse") {
      try {
        await apiRequest("PATCH", `/api/users/${user.id}/preferred-language`, {
          preferredLanguage: code,
        });
        setUser((prev) => (prev ? { ...prev, language: code } : null));
        await saveAuth({ ...user!, language: code });
      } catch (e) {
        console.warn("[Profile] 언어 DB 업데이트 실패:", e);
      }
    }
  };

  const handleLogout = async () => {
    await clearAuth();
    setIsAuth(false);
    setUser(null);
    setSavedTrips([]);
    navigation.reset({
      index: 0,
      routes: [{ name: "Main" }],
    });
  };

  const currentLang = SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];

  const stats = [
    { label: t("profile.trips"), value: String(savedTrips.length), icon: "map" },
    {
      label: t("profile.visits"),
      value: String(
        savedTrips.reduce((sum, t) => sum + (t.companionCount || 0), 0),
      ),
      icon: "map-pin",
    },
    { label: t("common.save"), value: String(savedTrips.length), icon: "bookmark" },
  ];

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
              onPress={() => navigation.navigate("Login")}
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

      {/* 🗂️ 나의 여정 섹션 */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>나의 여정</ThemedText>
        {isLoadingTrips ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Brand.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              불러오는 중...
            </Text>
          </View>
        ) : savedTrips.length === 0 ? (
          <View
            style={[
              styles.emptyTrips,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <Icon name="map" size={40} color={theme.textTertiary} />
            <Text
              style={[styles.emptyTripsText, { color: theme.textSecondary }]}
            >
              저장된 여행이 없어요
            </Text>
            <Text
              style={[styles.emptyTripsHint, { color: theme.textTertiary }]}
            >
              일정을 생성하고 저장해보세요!
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tripsScroll}
          >
            {savedTrips.map((trip) => (
              <Pressable
                key={trip.id}
                style={[
                  styles.tripCard,
                  { backgroundColor: theme.backgroundDefault },
                ]}
                onPress={() =>
                  // 🗂️ 2026-07-03 사용자 SSOT = 나의여정 카드 탭 → 여정 생성화면(Home) 그대로 재현(SavedTripDetail 요약전용 아님).
                  //   Main(탭)의 Home으로 itineraryId 전달 → TripPlanner가 GET으로 raw_data 불러와 renderResult 복원. (나의영상 카드는 SavedTripDetail 유지)
                  navigation.navigate("Main", {
                    screen: "Home",
                    params: { itineraryId: trip.id },
                  } as any)
                }
              >
                {/* 🗂️ 2026-07-03 사용자 SSOT = 여정 생성화면 헤더 4요소(도시·기간·예산·요약) 텍스트. 폰트·색=메인앱 통일(Fonts=Pretendard·Brand·textSecondary). */}
                {/* 1. 도시 = rawData.destination 우선, 없으면 title */}
                <Text
                  style={[styles.cardCity, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {trip.rawData?.destination || trip.title}
                </Text>
                {/* 2. 기간 = 26년 07-03 ~ 07-05 (메인앱 shortDate 동일 표기) */}
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                  {shortDateCard(trip.startDate)} ~ {shortDateCard(trip.endDate)}
                </Text>
                {/* 3. 예산 = 1인 €N (rawData.days[].dailyCost.perPersonEur 합산) */}
                {(() => {
                  const per = (trip.rawData?.days || []).reduce(
                    (s, d) => s + (d.dailyCost?.perPersonEur || 0),
                    0,
                  );
                  if (per <= 0) return null;
                  return (
                    <Text style={[styles.cardBudget, { color: Brand.primary }]}>
                      {t("common.perPerson")} €{per.toFixed(0)}
                    </Text>
                  );
                })()}
                {/* 4. 요약 = 동행(N명)·대상·vibe 조합 (결과화면 요약섹션2 위계) */}
                <Text
                  style={[styles.cardSummary, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {summaryLineCard(trip, t)}
                </Text>
                {trip.videoStatus === "succeeded" && (
                  <View style={styles.videoReadyBadge}>
                    <Icon name="film" size={12} color="#FFFFFF" />
                  </View>
                )}
                {/* ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 항상 표시, 터치 시 즉시 삭제(확인 없음). 카드 탭(복원)과 분리 위해 절대위치+전파차단. */}
                <Pressable
                  style={styles.cardDeleteBtn}
                  hitSlop={8}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteTrip(trip.id);
                  }}
                >
                  <Icon name="x" size={14} color={theme.textSecondary} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* 🎬 나의 영상 섹션 */}
      {(() => {
        const videosReady = savedTrips.filter(
          (t) => t.videoStatus === "succeeded" && t.videoUrl,
        );
        if (videosReady.length === 0) return null;

        return (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              🎬 나의 영상 ({videosReady.length})
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tripsScroll}
            >
              {videosReady.map((trip) => (
                <Pressable
                  key={trip.id}
                  style={[
                    styles.videoCard,
                    { backgroundColor: theme.backgroundDefault },
                  ]}
                  onPress={() =>
                    navigation.navigate("SavedTripDetail", {
                      itineraryId: trip.id,
                    })
                  }
                >
                  <View style={styles.videoThumbnail}>
                    <LinearGradient
                      colors={["#6366f1", "#8b5cf6"]}
                      style={styles.videoThumbnailGradient}
                    >
                      <Icon name="play-circle" size={32} color="#FFFFFF" />
                    </LinearGradient>
                  </View>
                  <Text
                    style={[styles.videoCardTitle, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {trip.title}
                  </Text>
                  <Text
                    style={[
                      styles.videoCardDate,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {trip.startDate?.split("T")[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        );
      })()}

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>여행 스타일</ThemedText>
        <View style={styles.personaContainer}>
          <Pressable
            style={[
              styles.personaCard,
              { backgroundColor: theme.backgroundDefault },
              persona === "luxury" && {
                borderColor: Brand.luxuryGold,
                borderWidth: 2,
              },
            ]}
            onPress={() => setPersona("luxury")}
          >
            <View
              style={[
                styles.personaIcon,
                { backgroundColor: `${Brand.luxuryGold}20` },
              ]}
            >
              <Icon name="star" size={24} color={Brand.luxuryGold} />
            </View>
            <Text style={[styles.personaTitle, { color: theme.text }]}>
              럭셔리
            </Text>
            <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>
              프리미엄 경험
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.personaCard,
              { backgroundColor: theme.backgroundDefault },
              persona === "comfort" && {
                borderColor: Brand.comfortBlue,
                borderWidth: 2,
              },
            ]}
            onPress={() => setPersona("comfort")}
          >
            <View
              style={[
                styles.personaIcon,
                { backgroundColor: `${Brand.comfortBlue}20` },
              ]}
            >
              <Icon name="heart" size={24} color={Brand.comfortBlue} />
            </View>
            <Text style={[styles.personaTitle, { color: theme.text }]}>
              편안함
            </Text>
            <Text style={[styles.personaDesc, { color: theme.textSecondary }]}>
              안전한 여행
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>설정</ThemedText>
        <View
          style={[
            styles.menuCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          {[
            // 2026-07-13 = 내 문의함 바로가기(사장님 SSOT) = 전문가 탭(하단 내문의함)으로 이동. 전문가 문의 답변 확인.
            {
              icon: "award",
              label: t("expert.myInbox"),
              onPress: () => (navigation as any).navigate("Verify"),
            },
            {
              icon: "credit-card",
              label: "결제 수단 및 내역",
              onPress: () => {
                // TODO: 결제 화면 라우팅 추가 예정
                alert("결제 기능을 준비 중입니다.");
              }
            },
            {
              icon: "settings",
              label: "관리자 대시보드",
              onPress: () => navigation.navigate("AdminModal"),
            },
            { icon: "bell", label: "알림 설정" },
            {
              icon: "globe",
              label: t("profile.language"),
              onPress: () => setShowLanguageModal(true),
            },
            { icon: "shield", label: "개인정보 보호" },
            { icon: "help-circle", label: "도움말" },
          ].map((item, index, arr) => (
            <Pressable
              key={index}
              onPress={item.onPress}
              style={[
                styles.menuItem,
                index < arr.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <View style={styles.menuItemLeft}>
                <Icon
                  name={item.icon as any}
                  size={20}
                  color={theme.textSecondary}
                />
                <Text style={[styles.menuItemLabel, { color: theme.text }]}>
                  {item.label}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>
          ))}
          {isAuth && (
            <Pressable
              style={[
                styles.menuItem,
                { borderTopWidth: 1, borderTopColor: theme.border },
              ]}
              onPress={handleLogout}
            >
              <View style={styles.menuItemLeft}>
                <Icon name="log-out" size={20} color="#EF4444" />
                <Text style={[styles.menuItemLabel, { color: "#EF4444" }]}>
                  {t("profile.logout")}
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {/* 언어 선택 모달 */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={langModalStyles.overlay}>
          <View
            style={[
              langModalStyles.content,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={langModalStyles.header}>
              <Text style={[langModalStyles.title, { color: theme.text }]}>
                {t("login.languageSelect")}
              </Text>
              <Pressable onPress={() => setShowLanguageModal(false)}>
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={langModalStyles.list}>
              {SUPPORTED_LANGS.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[
                    langModalStyles.item,
                    currentLang.code === lang.code &&
                    langModalStyles.itemSelected,
                  ]}
                  onPress={() => handleLanguageChange(lang.code)}
                >
                  <Text style={langModalStyles.flag}>{lang.flag}</Text>
                  <View style={langModalStyles.itemText}>
                    <Text style={[langModalStyles.itemName, { color: theme.text }]}>
                      {lang.nativeName}
                    </Text>
                    <Text
                      style={[
                        langModalStyles.itemSub,
                        { color: theme.textTertiary },
                      ]}
                    >
                      {lang.name}
                    </Text>
                  </View>
                  {currentLang.code === lang.code ? (
                    <Icon name="check" size={20} color={Brand.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const langModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing["3xl"],
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  title: { fontSize: 20, fontWeight: "700" },
  list: { paddingHorizontal: Spacing.xl },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  itemSelected: { backgroundColor: "rgba(66, 133, 244, 0.08)" },
  itemText: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: "600" },
  itemSub: { fontSize: 13, marginTop: 2 },
  flag: { fontSize: 24 },
});

const styles = StyleSheet.create({
  profileCard: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    ...Shadows.fab,
  },
  userName: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  userEmail: {
    ...Typography.small,
  },
  loginButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  statIcon: {
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  personaContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  personaCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  personaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  personaTitle: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  personaDesc: {
    ...Typography.caption,
  },
  menuCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuItemLabel: {
    ...Typography.body,
  },
  // 🗂️ 나의 여정 스타일
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyTrips: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  emptyTripsText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    marginTop: Spacing.md,
  },
  emptyTripsHint: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  tripsScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  tripCard: {
    width: 190,
    padding: Spacing.md,
    // ⚠️ 2026-07-03 = X 삭제버튼 절대위치 기준(우측 상단). 도시명이 X와 안 겹치게 우측 여백 확보.
    position: "relative",
    paddingRight: Spacing.md + 20,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  // ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 항상 표시, 즉시 삭제. 글라스 미니멀(은은한 반투명 원). 이모지 금지 = Lucide x 아이콘.
  cardDeleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(120,120,128,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  tripCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  videoReadyBadge: {
    backgroundColor: "#22c55e",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tripCardTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.xs,
  },
  // 🗂️ 2026-07-03 = 나의여정 카드 4요소 = 메인앱 요약헤더 폰트·색 통일(Fonts=Pretendard, tripSummaryText=semiBold12 / tripDescriptionText=bold14 위계)
  cardCity: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    marginBottom: 2,
  },
  cardBudget: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.xs,
  },
  cardSummary: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    lineHeight: 16,
  },
  tripCardDate: {
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  tripCardTags: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  tripTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  tripTagText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
  },
  // 🎬 나의 영상 스타일
  videoCard: {
    width: 140,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  videoThumbnail: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  videoThumbnailGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  videoCardTitle: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    marginBottom: 2,
  },
  videoCardDate: {
    fontSize: 11,
  },
});
