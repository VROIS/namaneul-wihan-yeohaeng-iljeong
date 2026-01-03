import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
  const navigation = useNavigation();

  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeDay, setActiveDay] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const spinValue = new Animated.Value(0);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [tempDate, setTempDate] = useState(new Date());
  const [showWebInput, setShowWebInput] = useState<PickerMode>(null);

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

  const handleGenerate = async () => {
    setScreen("Loading");
    setLoadingStep(0);

    const vibeWeights = calculateVibeWeights(formData.vibes, formData.curationFocus);

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
        vibeWeights,
        days: [
          {
            day: 1,
            summary: "도착 후 시내 중심부 탐방. 파리의 상징적인 랜드마크를 둘러봅니다.",
            places: [
              {
                id: "1",
                name: "에펠탑",
                description: "파리의 상징",
                startTime: formData.startTime,
                endTime: "11:00",
                lat: 48.8584,
                lng: 2.2945,
                vibeScore: 95,
                confidenceScore: 98,
                sourceType: "Google",
                personaFitReason: "가족 모두가 즐길 수 있는 대표 관광지",
                tags: ["랜드마크", "포토스팟"],
                vibeTags: ["Hotspot"],
                realityCheck: { weather: "Sunny", crowd: "Medium", status: "Open" },
                image: "",
                priceEstimate: "약 25유로/인",
              },
              {
                id: "2",
                name: "개선문",
                description: "나폴레옹의 승리를 기념",
                startTime: "12:00",
                endTime: "13:30",
                lat: 48.8738,
                lng: 2.2950,
                vibeScore: 88,
                confidenceScore: 95,
                sourceType: "Google",
                personaFitReason: "역사와 문화를 체험할 수 있는 명소",
                tags: ["역사", "건축"],
                vibeTags: ["Culture"],
                realityCheck: { weather: "Sunny", crowd: "Low", status: "Open" },
                image: "",
                priceEstimate: "약 13유로/인",
              },
            ],
          },
          {
            day: 2,
            summary: "예술과 미식의 하루. 루브르 박물관과 현지 맛집 탐방.",
            places: [
              {
                id: "3",
                name: "루브르 박물관",
                description: "세계 최대 규모의 박물관",
                startTime: "10:00",
                endTime: formData.endTime,
                lat: 48.8606,
                lng: 2.3376,
                vibeScore: 98,
                confidenceScore: 99,
                sourceType: "Google",
                personaFitReason: "문화/예술 Vibe에 완벽한 선택",
                tags: ["예술", "박물관"],
                vibeTags: ["Culture", "Healing"],
                realityCheck: { weather: "Cloudy", crowd: "High", status: "Open" },
                image: "",
                priceEstimate: "약 17유로/인",
              },
            ],
          },
        ],
      });
      setScreen("Result");
    }, 6000);
  };

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
                onPress={() => setFormData(prev => ({ ...prev, companionType: option.id }))}
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
                  {vibe.label}
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
    const currentDay = itinerary.days[activeDay];

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

        <View style={[styles.mapPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="map" size={48} color={theme.textTertiary} />
          <Text style={[styles.mapPlaceholderText, { color: theme.textTertiary }]}>
            {itinerary.startDate} - {itinerary.endDate}
          </Text>
        </View>

        {itinerary.vibeWeights && itinerary.vibeWeights.length > 0 ? (
          <View style={[styles.vibeWeightsSummary, { backgroundColor: `${Brand.primary}10` }]}>
            <Feather name="target" size={16} color={Brand.primary} />
            <Text style={[styles.vibeWeightsSummaryText, { color: Brand.primary }]}>
              {formatVibeWeightsSummary(itinerary.vibeWeights)}
            </Text>
          </View>
        ) : null}

        <View style={styles.dayTabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
            {itinerary.days.map((day, idx) => (
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
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.resultScrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.summaryBox, { backgroundColor: Brand.primary }]}>
            <Feather name="zap" size={16} color="#FFFFFF" />
            <Text style={styles.summaryText}>{currentDay.summary}</Text>
          </View>

          <View style={styles.placesList}>
            {currentDay.places.map((place, index) => (
              <View key={place.id} style={styles.placeItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.placeNumber, { backgroundColor: Brand.primary }]}>
                    <Text style={styles.placeNumberText}>{index + 1}</Text>
                  </View>
                  {index < currentDay.places.length - 1 ? (
                    <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />
                  ) : null}
                </View>
                <View style={[styles.placeCard, { backgroundColor: theme.backgroundDefault }]}>
                  <View style={styles.placeHeader}>
                    <Text style={[styles.placeName, { color: theme.text }]}>{place.name}</Text>
                    <View style={[styles.scoreBadge, { backgroundColor: `${Brand.primary}20` }]}>
                      <Text style={[styles.scoreText, { color: Brand.primary }]}>{place.vibeScore}</Text>
                    </View>
                  </View>
                  <View style={styles.placeTimeRow}>
                    <Feather name="clock" size={14} color={theme.textSecondary} />
                    <Text style={[styles.placeTimeText, { color: theme.textSecondary }]}>
                      {place.startTime} - {place.endTime}
                    </Text>
                  </View>
                  {place.vibeTags && place.vibeTags.length > 0 ? (
                    <View style={styles.vibeTagsRow}>
                      {place.vibeTags.map(tag => (
                        <View key={tag} style={[styles.vibeTag, { backgroundColor: `${Brand.primary}15` }]}>
                          <Text style={[styles.vibeTagText, { color: Brand.primary }]}>
                            {getVibeLabel(tag)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.placeReason, { color: theme.textSecondary }]} numberOfLines={2}>
                    {place.personaFitReason}
                  </Text>
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
  resultContainer: { flex: 1 },
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  headerButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  resultTitle: { fontSize: 18, fontWeight: "800" },
  mapPlaceholder: { height: 200, justifyContent: "center", alignItems: "center", marginHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.md },
  mapPlaceholderText: { fontSize: 14, fontWeight: "600", marginTop: Spacing.sm },
  vibeWeightsSummary: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginHorizontal: Spacing.lg, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md },
  vibeWeightsSummaryText: { fontSize: 13, fontWeight: "700" },
  dayTabsContainer: { paddingVertical: Spacing.sm },
  dayTabs: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  dayTab: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  dayTabText: { fontSize: 13, fontWeight: "700" },
  resultScrollView: { flex: 1 },
  summaryBox: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginHorizontal: Spacing.lg, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.lg },
  summaryText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#FFFFFF", lineHeight: 20 },
  placesList: { paddingHorizontal: Spacing.lg },
  placeItem: { flexDirection: "row", marginBottom: Spacing.lg },
  timelineLeft: { width: 40, alignItems: "center" },
  placeNumber: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  placeNumberText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  timelineLine: { flex: 1, width: 2, marginVertical: Spacing.xs },
  placeCard: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, marginLeft: Spacing.sm },
  placeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.xs },
  placeName: { fontSize: 16, fontWeight: "800" },
  scoreBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.xs },
  scoreText: { fontSize: 12, fontWeight: "800" },
  placeTimeRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginBottom: Spacing.xs },
  placeTimeText: { fontSize: 12, fontWeight: "600" },
  vibeTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs, marginBottom: Spacing.xs },
  vibeTag: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.xs },
  vibeTagText: { fontSize: 10, fontWeight: "700" },
  placeReason: { fontSize: 13, lineHeight: 18 },
});
