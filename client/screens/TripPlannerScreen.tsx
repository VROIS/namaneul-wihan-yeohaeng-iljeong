import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Brand, Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import {
  TripFormData,
  Vibe,
  TravelStyle,
  CompanionType,
  CurationFocus,
  VIBE_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  COMPANION_OPTIONS,
  CURATION_FOCUS_OPTIONS,
  Itinerary,
  Place,
} from "@/types/trip";

type ScreenState = "Input" | "Loading" | "Result";

const LOADING_MESSAGES = [
  "실시간 교통 정보 분석 중",
  "현지 운영 현황 확인 중",
  "취향 기반 경로 최적화 중",
  "데이터 신뢰도 검증 중",
];

export default function TripPlannerScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeDay, setActiveDay] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const spinValue = new Animated.Value(0);

  const [formData, setFormData] = useState<TripFormData>({
    birthDate: "1985-06-15",
    companionType: "Family",
    companionCount: 4,
    companionAges: "55, 59",
    curationFocus: "Everyone",
    destination: "파리, 프랑스",
    startDate: "2024-12-24",
    startTime: "09:00",
    endDate: "2024-12-26",
    endTime: "21:00",
    vibes: ["Culture", "Foodie"],
    travelStyle: "Comfortable",
  });

  useEffect(() => {
    if (screen === "Loading") {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [screen]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const toggleVibe = (vibe: Vibe) => {
    setFormData(prev => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter(v => v !== vibe)
        : [...prev.vibes, vibe].slice(-3),
    }));
  };

  const handleGenerate = async () => {
    setScreen("Loading");
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep(s => (s < 3 ? s + 1 : s));
    }, 2000);

    setTimeout(() => {
      clearInterval(interval);
      setItinerary({
        title: `${formData.destination} 여행`,
        destination: formData.destination,
        startDate: formData.startDate,
        endDate: formData.endDate,
        days: [
          {
            day: 1,
            summary: "도착 후 시내 중심부 탐방. 에펠탑과 개선문을 중심으로 파리의 상징적인 랜드마크를 둘러봅니다.",
            places: [
              {
                id: "1",
                name: "에펠탑",
                description: "파리의 상징",
                startTime: "09:00",
                endTime: "11:00",
                lat: 48.8584,
                lng: 2.2945,
                vibeScore: 95,
                confidenceScore: 98,
                sourceType: "Google",
                personaFitReason: "가족 모두가 즐길 수 있는 대표 관광지입니다.",
                tags: ["랜드마크", "포토스팟"],
                realityCheck: { weather: "Sunny", crowd: "Medium", status: "Open" },
                image: "",
                priceEstimate: "약 25유로/인",
              },
            ],
          },
        ],
      });
      setScreen("Result");
    }, 6000);
  };

  const renderInput = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[
        styles.inputContainer,
        { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>VibeTrip</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          초개인화 고정밀 여행 에이전트
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>기본 정보</Text>
        <View style={[styles.inputBox, { backgroundColor: theme.backgroundDefault }]}>
          <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>목적지</Text>
          <TextInput
            style={[styles.textInput, { color: theme.text }]}
            value={formData.destination}
            onChangeText={text => setFormData(prev => ({ ...prev, destination: text }))}
            placeholder="도시, 나라"
            placeholderTextColor={theme.textTertiary}
          />
        </View>
        <View style={styles.row}>
          <View style={[styles.inputBox, styles.flex1, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>시작일</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              value={formData.startDate}
              onChangeText={text => setFormData(prev => ({ ...prev, startDate: text }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
            />
          </View>
          <View style={[styles.inputBox, styles.flex1, { backgroundColor: theme.backgroundDefault }]}>
            <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>종료일</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              value={formData.endDate}
              onChangeText={text => setFormData(prev => ({ ...prev, endDate: text }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>동행자 구성</Text>
        <View style={styles.grid2}>
          {COMPANION_OPTIONS.map(option => (
            <Pressable
              key={option.id}
              style={[
                styles.optionButton,
                { backgroundColor: formData.companionType === option.id ? Brand.primary : theme.backgroundDefault },
              ]}
              onPress={() => setFormData(prev => ({ ...prev, companionType: option.id }))}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: formData.companionType === option.id ? "#FFFFFF" : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.inputBox, { backgroundColor: theme.backgroundDefault }]}>
          <Text style={[styles.inputLabel, { color: theme.textTertiary }]}>동행자 연령 (쉼표 구분)</Text>
          <TextInput
            style={[styles.textInput, { color: theme.text }]}
            value={formData.companionAges}
            onChangeText={text => setFormData(prev => ({ ...prev, companionAges: text }))}
            placeholder="예: 10, 55, 59"
            placeholderTextColor={theme.textTertiary}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>이번 여행의 주인공</Text>
        <View style={styles.focusList}>
          {CURATION_FOCUS_OPTIONS.map(option => (
            <Pressable
              key={option.id}
              style={[
                styles.focusButton,
                { backgroundColor: formData.curationFocus === option.id ? Brand.primary : theme.backgroundDefault },
              ]}
              onPress={() => setFormData(prev => ({ ...prev, curationFocus: option.id }))}
            >
              <Text
                style={[
                  styles.focusText,
                  { color: formData.curationFocus === option.id ? "#FFFFFF" : theme.text },
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.focusDesc,
                  { color: formData.curationFocus === option.id ? "rgba(255,255,255,0.8)" : theme.textSecondary },
                ]}
              >
                {option.description}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>취향 및 감성</Text>
        <View style={styles.grid3}>
          {VIBE_OPTIONS.map(vibe => {
            const isSelected = formData.vibes.includes(vibe.id);
            return (
              <Pressable
                key={vibe.id}
                style={[
                  styles.vibeButton,
                  { backgroundColor: isSelected ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => toggleVibe(vibe.id)}
              >
                <Feather
                  name={vibe.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.vibeText, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {vibe.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={handleGenerate} style={styles.generateButton}>
        <LinearGradient
          colors={Brand.gradient as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.generateGradient}
        >
          <Text style={styles.generateText}>일정 생성 시작</Text>
        </LinearGradient>
      </Pressable>
    </ScrollView>
  );

  const renderLoading = () => (
    <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.loadingIconBox, { backgroundColor: `${Brand.primary}15` }]}>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <View style={styles.spinnerRing} />
        </Animated.View>
        <Feather name="navigation" size={32} color={Brand.primary} style={styles.loadingIcon} />
      </View>
      <Text style={[styles.loadingTitle, { color: theme.text }]}>VibeTrip 고정밀 엔진 구동 중</Text>
      <Text style={[styles.loadingMessage, { color: theme.textSecondary }]}>
        {LOADING_MESSAGES[loadingStep]}
      </Text>
    </View>
  );

  const renderResult = () => {
    if (!itinerary) return null;
    const currentDay = itinerary.days[activeDay];

    return (
      <View style={[styles.resultContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.resultHeader, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={() => setScreen("Input")} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <View style={styles.resultHeaderCenter}>
            <Text style={[styles.resultTitle, { color: theme.text }]}>{itinerary.destination}</Text>
            <Text style={[styles.resultDates, { color: theme.textSecondary }]}>
              {itinerary.startDate} - {itinerary.endDate}
            </Text>
          </View>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.resultScrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        >
          <View style={styles.dayTabs}>
            {itinerary.days.map((day, idx) => (
              <Pressable
                key={idx}
                style={[
                  styles.dayTab,
                  { backgroundColor: activeDay === idx ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setActiveDay(idx)}
              >
                <Text
                  style={[styles.dayTabText, { color: activeDay === idx ? "#FFFFFF" : theme.textSecondary }]}
                >
                  Day {day.day}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.summaryBox, { backgroundColor: theme.text }]}>
            <View style={styles.summaryHeader}>
              <Feather name="zap" size={14} color={Brand.primary} />
              <Text style={styles.summaryLabel}>오늘의 스케줄 요약</Text>
            </View>
            <Text style={styles.summaryText}>{currentDay.summary}</Text>
          </View>

          <View style={styles.placesList}>
            {currentDay.places.map((place, index) => (
              <View key={place.id} style={styles.placeItem}>
                <View style={styles.placeNumber}>
                  <LinearGradient
                    colors={Brand.gradient as [string, string]}
                    style={styles.placeNumberGradient}
                  >
                    <Text style={styles.placeNumberText}>{index + 1}</Text>
                  </LinearGradient>
                </View>
                <View style={styles.placeContent}>
                  <View style={styles.placeTimeRow}>
                    <Text style={[styles.placeTime, { color: theme.text }]}>
                      {place.startTime} — {place.endTime}
                    </Text>
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  </View>
                  <View style={[styles.placeCard, { backgroundColor: theme.backgroundDefault }]}>
                    <Text style={[styles.placeName, { color: theme.text }]}>{place.name}</Text>
                    <Text style={[styles.placeReason, { color: theme.textSecondary }]}>
                      {place.personaFitReason}
                    </Text>
                    <View style={styles.placeScores}>
                      <View style={styles.scoreItem}>
                        <Text style={[styles.scoreLabel, { color: theme.textTertiary }]}>Vibe</Text>
                        <Text style={[styles.scoreValue, { color: Brand.primary }]}>{place.vibeScore}%</Text>
                      </View>
                      <View style={styles.scoreItem}>
                        <Text style={[styles.scoreLabel, { color: theme.textTertiary }]}>신뢰도</Text>
                        <Text style={[styles.scoreValue, { color: theme.text }]}>{place.confidenceScore}%</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {screen === "Input" && renderInput()}
      {screen === "Loading" && renderLoading()}
      {screen === "Result" && renderResult()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  inputContainer: { paddingHorizontal: Spacing.lg },
  header: { marginBottom: Spacing["2xl"], paddingTop: Spacing.xl },
  title: { fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  subtitle: { fontSize: 14, fontWeight: "600", marginTop: Spacing.xs },
  section: { marginBottom: Spacing.xl },
  sectionLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 2, marginBottom: Spacing.md },
  inputBox: { padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm },
  inputLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", marginBottom: 4 },
  textInput: { fontSize: 16, fontWeight: "700", padding: 0 },
  row: { flexDirection: "row", gap: Spacing.sm },
  flex1: { flex: 1 },
  grid2: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.md },
  grid3: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  optionButton: { width: "48%", paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: "center" },
  optionText: { fontSize: 12, fontWeight: "700" },
  focusList: { gap: Spacing.sm },
  focusButton: { padding: Spacing.md, borderRadius: BorderRadius.md },
  focusText: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  focusDesc: { fontSize: 12 },
  vibeButton: { width: "31%", aspectRatio: 1, borderRadius: BorderRadius.md, justifyContent: "center", alignItems: "center", gap: Spacing.xs },
  vibeText: { fontSize: 11, fontWeight: "600" },
  generateButton: { borderRadius: BorderRadius.xl, overflow: "hidden", marginTop: Spacing.lg },
  generateGradient: { paddingVertical: Spacing.lg, alignItems: "center" },
  generateText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  loadingIconBox: { width: 96, height: 96, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: Spacing.xl },
  spinnerRing: { position: "absolute", width: 96, height: 96, borderRadius: 32, borderWidth: 4, borderColor: Brand.primary, borderTopColor: "transparent" },
  loadingIcon: { position: "absolute" },
  loadingTitle: { fontSize: 22, fontWeight: "900", marginBottom: Spacing.sm, textAlign: "center" },
  loadingMessage: { fontSize: 14, fontWeight: "600" },
  resultContainer: { flex: 1 },
  resultHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  backButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  resultHeaderCenter: { flex: 1, alignItems: "center" },
  resultTitle: { fontSize: 18, fontWeight: "800" },
  resultDates: { fontSize: 12 },
  resultScrollView: { flex: 1 },
  dayTabs: { flexDirection: "row", paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  dayTab: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  dayTabText: { fontSize: 12, fontWeight: "700" },
  summaryBox: { marginHorizontal: Spacing.lg, padding: Spacing.lg, borderRadius: BorderRadius.xl, marginBottom: Spacing.xl },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginBottom: Spacing.sm },
  summaryLabel: { fontSize: 10, fontWeight: "800", color: Brand.primary, textTransform: "uppercase", letterSpacing: 1 },
  summaryText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF", lineHeight: 22 },
  placesList: { paddingHorizontal: Spacing.lg },
  placeItem: { flexDirection: "row", marginBottom: Spacing.xl },
  placeNumber: { marginRight: Spacing.md },
  placeNumberGradient: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  placeNumberText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  placeContent: { flex: 1 },
  placeTimeRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  placeTime: { fontSize: 18, fontWeight: "800" },
  verifiedBadge: { backgroundColor: "#10B98120", paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 4 },
  verifiedText: { fontSize: 9, fontWeight: "700", color: "#10B981", textTransform: "uppercase" },
  placeCard: { padding: Spacing.md, borderRadius: BorderRadius.md },
  placeName: { fontSize: 18, fontWeight: "800", marginBottom: Spacing.xs },
  placeReason: { fontSize: 13, lineHeight: 20, marginBottom: Spacing.md },
  placeScores: { flexDirection: "row", gap: Spacing.xl },
  scoreItem: {},
  scoreLabel: { fontSize: 10, fontWeight: "600", textTransform: "uppercase", marginBottom: 2 },
  scoreValue: { fontSize: 16, fontWeight: "800" },
});
