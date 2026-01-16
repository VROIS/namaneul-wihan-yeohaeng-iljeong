import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  useColorScheme,
  Animated,
  Easing,
  Dimensions,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Brand, Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  TripFormData,
  Vibe,
  TravelPace,
  MobilityStyle,
  TravelStyle,
  VIBE_OPTIONS,
  COMPANION_OPTIONS,
  CURATION_FOCUS_OPTIONS,
  TRAVEL_STYLE_OPTIONS,
  TRAVEL_PACE_OPTIONS,
  MOBILITY_STYLE_OPTIONS,
  Itinerary,
} from "@/types/trip";
import { calculateVibeWeights, formatVibeWeightsSummary, getVibeLabel } from "@/utils/vibeCalculator";
import { apiRequest } from "@/lib/query-client";
import { InteractiveMap } from "@/components/InteractiveMap";
import { isAuthenticated } from "@/lib/auth";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useMapToggle } from "@/contexts/MapToggleContext";

let DateTimePicker: any = null;
if (Platform.OS !== "web") {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}

type ScreenState = "Input" | "Loading" | "Result";
type PickerMode = "startDate" | "startTime" | "endDate" | "endTime" | null;

const LOADING_MESSAGES = [
  "실시간 교통 정보 분석 중",
  "현지 운영 현황 확인 중",
  "취향 기반 경로 최적화 중",
  "데이터 신뢰도 검증 중",
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export default function TripPlannerScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeDay, setActiveDay] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const spinValue = new Animated.Value(0);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const [showWebInput, setShowWebInput] = useState<PickerMode>(null);
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const { showMap } = useMapToggle();  // 🗺️ 지도 토글 (Context에서 가져옴)

  const [formData, setFormData] = useState<TripFormData>({
    birthDate: "1985-06-15",
    companionType: "Family",
    companionCount: 4,
    companionAges: "55, 59",
    curationFocus: "Everyone",
    destination: "파리, 프랑스",
    startDate: formatDate(new Date()),
    startTime: "09:00",
    endDate: formatDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
    endTime: "21:00",
    vibes: ["Healing", "Foodie"],
    travelStyle: "Reasonable",
    travelPace: "Relaxed",
    mobilityStyle: "WalkMore",
  });

  useEffect(() => {
    if (screen === "Loading") {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
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

  const openPicker = (mode: PickerMode) => {
    if (!mode) return;
    if (Platform.OS === "web") {
      setShowWebInput(mode);
      return;
    }
    let initialDate = new Date();
    if (mode === "startDate") initialDate = parseDate(formData.startDate);
    else if (mode === "endDate") initialDate = parseDate(formData.endDate);
    else if (mode === "startTime") initialDate = parseTime(formData.startTime);
    else if (mode === "endTime") initialDate = parseTime(formData.endTime);
    setTempDate(initialDate);
    setPickerMode(mode);
  };

  const handlePickerChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }
    if (selectedDate) {
      setTempDate(selectedDate);
      if (Platform.OS === "android") {
        confirmPicker(selectedDate);
      }
    }
  };

  const confirmPicker = (date?: Date) => {
    const finalDate = date || tempDate;
    if (pickerMode === "startDate") {
      setFormData(prev => ({ ...prev, startDate: formatDate(finalDate) }));
    } else if (pickerMode === "endDate") {
      setFormData(prev => ({ ...prev, endDate: formatDate(finalDate) }));
    } else if (pickerMode === "startTime") {
      setFormData(prev => ({ ...prev, startTime: formatTime(finalDate) }));
    } else if (pickerMode === "endTime") {
      setFormData(prev => ({ ...prev, endTime: formatTime(finalDate) }));
    }
    setPickerMode(null);
  };

  const handleWebInputChange = (value: string) => {
    if (showWebInput === "startDate") {
      setFormData(prev => ({ ...prev, startDate: value }));
    } else if (showWebInput === "endDate") {
      setFormData(prev => ({ ...prev, endDate: value }));
    } else if (showWebInput === "startTime") {
      setFormData(prev => ({ ...prev, startTime: value }));
    } else if (showWebInput === "endTime") {
      setFormData(prev => ({ ...prev, endTime: value }));
    }
  };

  // 🚨 위기 정보 체크 및 팝업 표시
  const checkCrisisAlerts = async (): Promise<{ hasAlerts: boolean; shouldProceed: boolean }> => {
    try {
      const response = await apiRequest("GET", `/api/trip-alerts?city=${encodeURIComponent(formData.destination)}&startDate=${formData.startDate}&endDate=${formData.endDate}`);
      const data = await response.json();
      
      if (data.hasAlerts && data.alerts?.length > 0) {
        const highSeverityAlerts = data.alerts.filter((a: any) => a.severity >= 7);
        const alertMessages = data.alerts.slice(0, 3).map((a: any) => 
          `• ${a.titleKo || a.title} (${a.date})`
        ).join('\n');
        
        return new Promise((resolve) => {
          if (data.highSeverity) {
            // 심각한 위기 정보 - 경고 팝업
            Alert.alert(
              "⚠️ 여행 주의 정보",
              `${formData.destination}에 ${data.alertCount}개의 주의사항이 있습니다:\n\n${alertMessages}\n\n${data.summary}\n\n일정을 계속 생성하시겠습니까?`,
              [
                { text: "취소", style: "cancel", onPress: () => resolve({ hasAlerts: true, shouldProceed: false }) },
                { text: "계속 생성", onPress: () => resolve({ hasAlerts: true, shouldProceed: true }) }
              ]
            );
          } else {
            // 일반 알림 정보 - 알림 팝업
            Alert.alert(
              "📢 참고 정보",
              `${formData.destination}에 참고할 정보가 있습니다:\n\n${alertMessages}`,
              [
                { text: "확인 후 생성", onPress: () => resolve({ hasAlerts: true, shouldProceed: true }) }
              ]
            );
          }
        });
      }
      
      return { hasAlerts: false, shouldProceed: true };
    } catch (error) {
      console.log("[TripPlanner] Crisis check failed, proceeding anyway:", error);
      return { hasAlerts: false, shouldProceed: true };
    }
  };

  const executeGenerate = async () => {
    // 🚨 1. 위기 정보 체크 (일정 생성 전)
    const crisisCheck = await checkCrisisAlerts();
    if (!crisisCheck.shouldProceed) {
      return; // 사용자가 취소함
    }

    setScreen("Loading");
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep(s => (s < 3 ? s + 1 : s));
    }, 2000);

    try {
      const response = await apiRequest("POST", "/api/routes/generate", formData);
      const result = await response.json();

      console.log("[TripPlanner] API response days count:", result.days?.length);
      console.log("[TripPlanner] Days:", result.days?.map((d: any) => ({ day: d.day, city: d.city, placesCount: d.places?.length })));

      clearInterval(interval);

      const vibeWeights = calculateVibeWeights(formData.vibes, formData.curationFocus);

      setItinerary({
        title: result.title || `${formData.destination} 여행`,
        destination: result.destination || formData.destination,
        startDate: result.startDate || formData.startDate,
        endDate: result.endDate || formData.endDate,
        vibeWeights: result.vibeWeights || vibeWeights,
        days: result.days || [],
        // 🚨 위기 정보 포함
        crisisAlerts: crisisCheck.hasAlerts ? result.crisisAlerts : undefined,
      });
      setScreen("Result");
    } catch (error) {
      clearInterval(interval);
      console.error("Failed to generate itinerary:", error);

      const vibeWeights = calculateVibeWeights(formData.vibes, formData.curationFocus);
      setItinerary({
        title: `${formData.destination} 여행`,
        destination: formData.destination,
        startDate: formData.startDate,
        endDate: formData.endDate,
        vibeWeights,
        days: [
          {
            day: 1,
            summary: "API 연결 오류 - 기본 일정으로 표시됩니다",
            places: [],
          },
        ],
      });
      setScreen("Result");
    }
  };

  const handleGenerate = async () => {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      executeGenerate();
    } else {
      setPendingGenerate(true);
      navigation.navigate("Onboarding");
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (pendingGenerate) {
        setPendingGenerate(false);
        isAuthenticated().then(auth => {
          if (auth) {
            executeGenerate();
          }
        });
      }
    }, [pendingGenerate])
  );

  const generateDateOptions = () => {
    const options: string[] = [];
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      options.push(formatDate(d));
    }
    return options;
  };

  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return options;
  };

  const renderWebInputModal = () => {
    if (!showWebInput) return null;
    const isDate = showWebInput === "startDate" || showWebInput === "endDate";
    const title = showWebInput === "startDate" ? "시작일" : showWebInput === "endDate" ? "종료일" : showWebInput === "startTime" ? "시작 시간" : "종료 시간";
    const currentValue = showWebInput === "startDate" ? formData.startDate : showWebInput === "endDate" ? formData.endDate : showWebInput === "startTime" ? formData.startTime : formData.endTime;
    const options = isDate ? generateDateOptions() : generateTimeOptions();

    return (
      <Modal visible transparent animationType="fade">
        <Pressable style={styles.pickerModalOverlay} onPress={() => setShowWebInput(null)}>
          <View style={[styles.webPickerModal, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.webPickerHeader}>
              <Pressable onPress={() => setShowWebInput(null)}>
                <Text style={[styles.pickerCancel, { color: theme.textSecondary }]}>취소</Text>
              </Pressable>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>{title}</Text>
              <Pressable onPress={() => setShowWebInput(null)}>
                <Text style={[styles.pickerConfirm, { color: Brand.primary }]}>확인</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.webPickerScroll} showsVerticalScrollIndicator={false}>
              {options.map(option => {
                const isSelected = option === currentValue;
                return (
                  <Pressable
                    key={option}
                    style={[
                      styles.webPickerOption,
                      isSelected && { backgroundColor: `${Brand.primary}15` },
                    ]}
                    onPress={() => {
                      handleWebInputChange(option);
                      setShowWebInput(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.webPickerOptionText,
                        { color: isSelected ? Brand.primary : theme.text },
                        isSelected && { fontWeight: "700" },
                      ]}
                    >
                      {option}
                    </Text>
                    {isSelected ? <Feather name="check" size={20} color={Brand.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    );
  };

  const renderPicker = () => {
    if (!pickerMode || Platform.OS === "web" || !DateTimePicker) return null;
    const isDate = pickerMode === "startDate" || pickerMode === "endDate";
    const mode = isDate ? "date" : "time";
    const title = pickerMode === "startDate" ? "시작일" : pickerMode === "endDate" ? "종료일" : pickerMode === "startTime" ? "시작 시간" : "종료 시간";

    if (Platform.OS === "ios") {
      return (
        <Modal visible transparent animationType="slide">
          <View style={styles.pickerModalOverlay}>
            <View style={[styles.pickerModalContent, { backgroundColor: theme.backgroundRoot }]}>
              <View style={styles.pickerHeader}>
                <Pressable onPress={() => setPickerMode(null)}>
                  <Text style={[styles.pickerCancel, { color: theme.textSecondary }]}>취소</Text>
                </Pressable>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>{title}</Text>
                <Pressable onPress={() => confirmPicker()}>
                  <Text style={[styles.pickerConfirm, { color: Brand.primary }]}>확인</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                onChange={handlePickerChange}
                locale="ko-KR"
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      );
    }

    return (
      <DateTimePicker
        value={tempDate}
        mode={mode}
        display="default"
        onChange={handlePickerChange}
      />
    );
  };

  const renderSectionHeader = (title: string, subtitle: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
    </View>
  );

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
        <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>VibeTrip</Text>
      </View>

      <View style={styles.section}>
        <View style={[styles.inputBox, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="map-pin" size={20} color={Brand.primary} />
          <TextInput
            style={[styles.textInput, { color: theme.text }]}
            value={formData.destination}
            onChangeText={text => setFormData(prev => ({ ...prev, destination: text }))}
            placeholder="목적지"
            placeholderTextColor={theme.textTertiary}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <Pressable
            style={[styles.dateBox, styles.flex1, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => openPicker("startDate")}
          >
            <Feather name="calendar" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>{formData.startDate}</Text>
          </Pressable>
          <Pressable
            style={[styles.dateBox, styles.flex1, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => openPicker("endDate")}
          >
            <Feather name="calendar" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>{formData.endDate}</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={[styles.dateBox, styles.flex1, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => openPicker("startTime")}
          >
            <Feather name="clock" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>{formData.startTime}</Text>
          </Pressable>
          <Pressable
            style={[styles.dateBox, styles.flex1, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => openPicker("endTime")}
          >
            <Feather name="clock" size={18} color={Brand.primary} />
            <Text style={[styles.dateText, { color: theme.text }]}>{formData.endTime}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader("누구랑", "함께할 사람을 선택하세요")}
        <View style={styles.iconGrid}>
          {COMPANION_OPTIONS.map(option => {
            const isSelected = formData.companionType === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  { backgroundColor: isSelected ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setFormData(prev => ({ 
                  ...prev, 
                  companionType: option.id,
                  companionCount: option.defaultCount,
                  transportType: option.transportType,
                }))}
              >
                <Feather
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.iconLabel, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader("누구를 위한", "누구 중심으로 일정을 짤까요?")}
        <View style={styles.iconGrid}>
          {CURATION_FOCUS_OPTIONS.map(option => {
            const isSelected = formData.curationFocus === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  { backgroundColor: isSelected ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setFormData(prev => ({ ...prev, curationFocus: option.id }))}
              >
                <Feather
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.iconLabel, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader("무엇을", "원하는 여행 스타일 (최대 3개)")}
        <View style={styles.vibeGrid}>
          {VIBE_OPTIONS.map(vibe => {
            const isSelected = formData.vibes.includes(vibe.id);
            const selectionIndex = formData.vibes.indexOf(vibe.id);
            const priorityLabels = ["(최우선)", "(우선)", "(반영)"];
            const priorityLabel = selectionIndex >= 0 ? priorityLabels[selectionIndex] : "";
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
                  size={22}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.vibeText, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {vibe.label}{priorityLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader("여행 스타일", "일정 밀도를 선택하세요")}
        <View style={styles.toggleRow}>
          {TRAVEL_PACE_OPTIONS.map(option => {
            const isSelected = formData.travelPace === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.toggleButton,
                  { backgroundColor: isSelected ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setFormData(prev => ({ ...prev, travelPace: option.id }))}
              >
                <Feather
                  name={option.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.toggleText, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader("예산", "여행 예산 수준을 선택하세요")}
        <View style={styles.iconGrid}>
          {TRAVEL_STYLE_OPTIONS.map(option => {
            const isSelected = formData.travelStyle === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.iconButton,
                  { backgroundColor: isSelected ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setFormData(prev => ({ ...prev, travelStyle: option.id }))}
              >
                <Feather
                  name={option.icon as any}
                  size={24}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.iconLabel, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {renderSectionHeader("이동 스타일", "이동 방식을 선택하세요")}
        <View style={styles.toggleRow}>
          {MOBILITY_STYLE_OPTIONS.map(option => {
            const isSelected = formData.mobilityStyle === option.id;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.toggleButton,
                  { backgroundColor: isSelected ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setFormData(prev => ({ ...prev, mobilityStyle: option.id }))}
              >
                <Feather
                  name={option.icon as any}
                  size={20}
                  color={isSelected ? "#FFFFFF" : theme.textSecondary}
                />
                <Text style={[styles.toggleText, { color: isSelected ? "#FFFFFF" : theme.textSecondary }]}>
                  {option.label}
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
          <Feather name="navigation" size={20} color="#FFFFFF" />
          <Text style={styles.generateText}>일정 생성</Text>
        </LinearGradient>
      </Pressable>
      {renderPicker()}
      {renderWebInputModal()}
    </ScrollView>
  );

  const renderLoading = () => (
    <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.loadingIconBox, { backgroundColor: `${Brand.primary}15` }]}>
        <Animated.View style={Platform.OS === "web" ? styles.webSpinner : { transform: [{ rotate: spin }] }}>
          <View style={[styles.spinnerRing, { borderColor: Brand.primary }]} />
        </Animated.View>
        <Feather name="navigation" size={32} color={Brand.primary} style={styles.loadingIcon} />
      </View>
      <Text style={[styles.loadingTitle, { color: theme.text }]}>VibeTrip</Text>
      <Text style={[styles.loadingMessage, { color: theme.textSecondary }]}>
        {LOADING_MESSAGES[loadingStep]}
      </Text>
    </View>
  );

  const renderResult = () => {
    if (!itinerary) return null;
    const currentDay = itinerary.days?.[activeDay];
    const places = currentDay?.places || [];

    return (
      <View style={[styles.resultContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.resultHeader, { paddingTop: insets.top + Spacing.sm }]}>
          <Pressable onPress={() => setScreen("Input")} style={styles.headerButton}>
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.resultTitle, { color: theme.text }]}>{itinerary.destination}</Text>
          <Pressable style={styles.headerButton}>
            <Feather name="share" size={22} color={theme.text} />
          </Pressable>
        </View>

        {/* 📊 요약 섹션 1: 날짜 + 장소수 + 총예산 */}
        <View style={[styles.tripSummaryRow, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.tripSummaryItem}>
            <Feather name="calendar" size={14} color={theme.textSecondary} />
            <Text style={[styles.tripSummaryText, { color: theme.text }]}>
              {itinerary.startDate} ~ {itinerary.endDate}
            </Text>
          </View>
          <View style={styles.tripSummaryItem}>
            <Feather name="map-pin" size={14} color={theme.textSecondary} />
            <Text style={[styles.tripSummaryText, { color: theme.text }]}>
              {(itinerary.days || []).reduce((sum, d) => sum + (d.places?.length || 0), 0)}개 장소
            </Text>
          </View>
          {itinerary.budget?.totals?.grandTotal && (
            <View style={styles.tripSummaryItem}>
              <Feather name="credit-card" size={14} color={Brand.primary} />
              <Text style={[styles.tripSummaryText, { color: Brand.primary, fontWeight: "700" }]}>
                €{itinerary.budget.totals.grandTotal.toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* 📊 요약 섹션 2: 누구랑 + 바이브 + 예산 + 이동스타일 */}
        <View style={[styles.tripOptionsRow, { backgroundColor: theme.backgroundDefault }]}>
          {itinerary.companionType && (
            <View style={[styles.tripOptionBadge, { backgroundColor: `${Brand.primary}15` }]}>
              <Text style={[styles.tripOptionText, { color: Brand.primary }]}>
                👨‍👩‍👧‍👦 {itinerary.companionType}
              </Text>
            </View>
          )}
          {itinerary.travelStyle && (
            <View style={[styles.tripOptionBadge, { backgroundColor: `${Brand.primary}15` }]}>
              <Text style={[styles.tripOptionText, { color: Brand.primary }]}>
                💰 {itinerary.travelStyle}
              </Text>
            </View>
          )}
          {itinerary.mobilityStyle && (
            <View style={[styles.tripOptionBadge, { backgroundColor: `${Brand.primary}15` }]}>
              <Text style={[styles.tripOptionText, { color: Brand.primary }]}>
                🚶 {itinerary.mobilityStyle}
              </Text>
            </View>
          )}
        </View>

        {/* 🎯 바이브 가중치 요약 */}
        {itinerary.vibeWeights && itinerary.vibeWeights.length > 0 && (
          <View style={[styles.vibeWeightsSummary, { backgroundColor: `${Brand.primary}10` }]}>
            <Feather name="target" size={16} color={Brand.primary} />
            <Text style={[styles.vibeWeightsSummaryText, { color: Brand.primary }]}>
              {formatVibeWeightsSummary(itinerary.vibeWeights)}
            </Text>
          </View>
        )}

        {/* 🗺️ 지도 섹션 - showMap 토글에 따라 표시/숨김 */}
        {showMap && (
          <View style={styles.mapSection}>
            <InteractiveMap
              places={places.map(p => ({
                id: p.id,
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                vibeScore: p.vibeScore,
                startTime: p.startTime,
                endTime: p.endTime,
              }))}
              height={Math.min(220, Dimensions.get('window').height * 0.25)}
            />
          </View>
        )}

        <View style={styles.dayTabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
            {(itinerary.days || []).map((day, idx) => (
              <Pressable
                key={idx}
                style={[
                  styles.dayTab,
                  { backgroundColor: activeDay === idx ? Brand.primary : theme.backgroundDefault },
                ]}
                onPress={() => setActiveDay(idx)}
              >
                <Text style={[styles.dayTabText, { color: activeDay === idx ? "#FFFFFF" : theme.textSecondary }]}>
                  Day {day.day}
                </Text>
                {day.city ? (
                  <Text style={[styles.dayTabCity, { color: activeDay === idx ? "rgba(255,255,255,0.8)" : theme.textTertiary }]}>
                    {day.city.length > 8 ? day.city.substring(0, 8) + "..." : day.city}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.resultScrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable 
            style={[styles.summaryBox, { backgroundColor: Brand.primary }]}
            onPress={() => navigation.navigate("VerificationRequest", { itinerary })}
          >
            <Feather name="check-circle" size={16} color="#FFFFFF" />
            <Text style={styles.summaryText}>현지 전문가 검증 요청</Text>
            <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>

          <View style={styles.placesList}>
            {places.map((place, index) => {
              // 별점 계산 (vibeScore 10점 만점 → 5점 만점)
              const starRating = Math.min(5, Math.max(0, Math.round((place.vibeScore || 0) / 2)));
              const stars = "⭐".repeat(starRating) + "☆".repeat(5 - starRating);
              
              // 식사 여부 판단
              const isMeal = place.name?.includes("점심") || place.name?.includes("저녁") || 
                             place.name?.includes("아침") || place.name?.includes("식사") ||
                             place.name?.includes("카페") || place.name?.includes("레스토랑");
              
              return (
                <View key={place.id} style={styles.placeItem}>
                  {/* 타임라인 좌측 */}
                  <View style={styles.timelineLeft}>
                    <View style={[styles.placeNumber, { backgroundColor: isMeal ? "#F59E0B" : Brand.primary }]}>
                      <Text style={styles.placeNumberText}>{index + 1}</Text>
                    </View>
                    {index < places.length - 1 && (
                      <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />
                    )}
                  </View>
                  
                  {/* 장소 카드 */}
                  <View style={[styles.placeCard, { backgroundColor: theme.backgroundDefault }]}>
                    <View style={styles.placeCardContent}>
                      {/* 썸네일 이미지 */}
                      {place.image ? (
                        <View style={styles.placeThumbnail}>
                          <View style={[styles.placeThumbnailPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
                            <Feather name={isMeal ? "coffee" : "camera"} size={20} color={theme.textTertiary} />
                          </View>
                        </View>
                      ) : (
                        <View style={styles.placeThumbnail}>
                          <View style={[styles.placeThumbnailPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
                            <Feather name={isMeal ? "coffee" : "map-pin"} size={20} color={theme.textTertiary} />
                          </View>
                        </View>
                      )}
                      
                      {/* 장소 정보 */}
                      <View style={styles.placeInfo}>
                        {/* 장소명 + 별점 */}
                        <View style={styles.placeHeader}>
                          <Text style={[styles.placeName, { color: theme.text }]} numberOfLines={1}>
                            {isMeal ? "🍽️ " : ""}{place.name}
                          </Text>
                        </View>
                        
                        {/* 별점 표시 */}
                        <Text style={styles.placeStars}>{stars}</Text>
                        
                        {/* 시간 */}
                        <View style={styles.placeTimeRow}>
                          <Feather name="clock" size={12} color={theme.textSecondary} />
                          <Text style={[styles.placeTimeText, { color: theme.textSecondary }]}>
                            {place.startTime} - {place.endTime}
                          </Text>
                        </View>
                        
                        {/* 가격 정보 */}
                        <View style={styles.placePriceRow}>
                          <Feather name={isMeal ? "credit-card" : "tag"} size={12} color={Brand.primary} />
                          <Text style={[styles.placePriceText, { color: Brand.primary }]}>
                            {isMeal ? "💰 식사" : "🎫 입장료"}: {place.priceEstimate || "정보 없음"}
                          </Text>
                        </View>
                        
                        {/* 설명 (있을 경우) */}
                        {place.personaFitReason && (
                          <Text style={[styles.placeReason, { color: theme.textSecondary }]} numberOfLines={2}>
                            {place.personaFitReason}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
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
  header: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.xl, paddingTop: Spacing.sm },
  closeButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center", marginRight: Spacing.sm },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  section: { marginBottom: Spacing.lg },
  sectionHeader: { marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, fontWeight: "500" },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  textInput: { flex: 1, fontSize: 16, fontWeight: "600", padding: 0 },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  dateText: { fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  flex1: { flex: 1 },
  iconGrid: { flexDirection: "row", gap: Spacing.sm },
  iconButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  iconLabel: { fontSize: 11, fontWeight: "700" },
  vibeGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  vibeButton: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 3,
    aspectRatio: 1.2,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  vibeText: { fontSize: 12, fontWeight: "600" },
  toggleRow: { flexDirection: "row", gap: Spacing.sm },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  toggleText: { fontSize: 14, fontWeight: "700" },
  generateButton: { borderRadius: BorderRadius.xl, overflow: "hidden", marginTop: Spacing.lg },
  generateGradient: { flexDirection: "row", paddingVertical: Spacing.lg, justifyContent: "center", alignItems: "center", gap: Spacing.sm },
  generateText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  pickerModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  pickerModalContent: { borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingBottom: 40 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  pickerCancel: { fontSize: 16, fontWeight: "600" },
  pickerTitle: { fontSize: 16, fontWeight: "700" },
  pickerConfirm: { fontSize: 16, fontWeight: "700" },
  webPickerModal: { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "70%", borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl },
  webPickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  webPickerScroll: { maxHeight: 350 },
  webPickerOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  webPickerOptionText: { fontSize: 16, fontWeight: "500" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  loadingIconBox: { width: 96, height: 96, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: Spacing.xl },
  spinnerRing: { position: "absolute", width: 96, height: 96, borderRadius: 32, borderWidth: 4, borderTopColor: "transparent" },
  webSpinner: {},
  loadingIcon: { position: "absolute" },
  loadingTitle: { fontSize: 24, fontWeight: "900", marginBottom: Spacing.xs },
  loadingMessage: { fontSize: 14, fontWeight: "600" },
  // ═══════════════════════════════════════════════════════════════════════════
  // 📱 여정표 출력 화면 스타일 (모바일 최적화)
  // ═══════════════════════════════════════════════════════════════════════════
  resultContainer: { flex: 1 },
  resultHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: Spacing.md, 
    paddingBottom: Spacing.md,
    minHeight: 56, // 모바일 터치 영역 확보
  },
  headerButton: { width: 48, height: 48, justifyContent: "center", alignItems: "center" },
  resultTitle: { fontSize: 20, fontWeight: "800" }, // 18 → 20
  
  // 📊 요약 섹션 1: 날짜 + 장소수 + 총예산
  tripSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  tripSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripSummaryText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // 📊 요약 섹션 2: 누구랑 + 바이브 + 예산 + 이동스타일
  tripOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tripOptionBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  tripOptionText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // 🗺️ 지도 섹션
  mapSection: { 
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  
  // 🎯 Vibe 가중치 요약
  vibeWeightsSummary: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm, 
    marginHorizontal: Spacing.md, 
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg, 
    borderRadius: BorderRadius.md, 
    marginBottom: Spacing.md 
  },
  vibeWeightsSummaryText: { fontSize: 14, fontWeight: "700" }, // 13 → 14
  
  // 📅 일자 탭
  dayTabsContainer: { paddingVertical: Spacing.sm },
  dayTabs: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  dayTab: { 
    paddingHorizontal: Spacing.lg, 
    paddingVertical: Spacing.md, // sm → md (더 큰 터치 영역)
    borderRadius: BorderRadius.full,
    minWidth: 70, // 최소 너비 보장
    alignItems: "center",
  },
  dayTabText: { fontSize: 14, fontWeight: "700" }, // 13 → 14
  dayTabCity: { fontSize: 11, marginTop: 2 }, // 10 → 11
  
  // 📜 스크롤 영역
  resultScrollView: { flex: 1 },
  
  // ✅ CTA 버튼
  summaryBox: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm, 
    marginHorizontal: Spacing.md, 
    paddingVertical: Spacing.lg, // md → lg
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg, // md → lg
    marginBottom: Spacing.lg 
  },
  summaryText: { flex: 1, fontSize: 15, fontWeight: "700", color: "#FFFFFF", lineHeight: 22 }, // 13 → 15
  
  // 📍 장소 목록
  placesList: { paddingHorizontal: Spacing.md },
  placeItem: { flexDirection: "row", marginBottom: Spacing.xl }, // lg → xl (더 넓은 간격)
  
  // 🔢 타임라인 (좌측 번호)
  timelineLeft: { width: 44, alignItems: "center" }, // 40 → 44
  placeNumber: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    justifyContent: "center", 
    alignItems: "center" 
  }, // 32 → 36
  placeNumberText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" }, // 14 → 15
  timelineLine: { flex: 1, width: 2, marginVertical: Spacing.xs },
  
  // 🏷️ 장소 카드
  placeCard: { 
    flex: 1, 
    paddingVertical: Spacing.lg, // md → lg
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg, // md → lg
    marginLeft: Spacing.sm 
  },
  placeHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: Spacing.sm // xs → sm
  },
  placeName: { fontSize: 18, fontWeight: "800", flex: 1 }, // 16 → 18
  scoreBadge: { 
    paddingHorizontal: Spacing.md, // sm → md
    paddingVertical: 4, // 2 → 4
    borderRadius: BorderRadius.sm, // xs → sm
    marginLeft: Spacing.sm,
  },
  scoreText: { fontSize: 14, fontWeight: "800" }, // 12 → 14
  
  // 🕐 시간
  placeTimeRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: Spacing.sm, // xs → sm
    marginBottom: Spacing.sm // xs → sm
  },
  placeTimeText: { fontSize: 14, fontWeight: "600" }, // 12 → 14
  
  // 🏷️ Vibe 태그
  vibeTagsRow: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    gap: Spacing.sm, // xs → sm
    marginBottom: Spacing.sm // xs → sm
  },
  vibeTag: { 
    paddingHorizontal: Spacing.md, // sm → md
    paddingVertical: 4, // 2 → 4
    borderRadius: BorderRadius.sm // xs → sm
  },
  vibeTagText: { fontSize: 12, fontWeight: "700" }, // 10 → 12
  
  // 📝 장소 설명
  placeReason: { fontSize: 14, lineHeight: 20 }, // 13/18 → 14/20
});
