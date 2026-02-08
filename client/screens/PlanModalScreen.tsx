import React, { useState } from "react";
import { View, StyleSheet, Text, Pressable, TextInput, ScrollView, useColorScheme, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Typography, Spacing, BorderRadius, Brand, Colors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import ThemedText from "@/components/ThemedText";
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
} from "@/types/trip";

type Step = "companion" | "focus" | "destination" | "dates" | "vibes" | "style";

const STEPS: Step[] = ["companion", "focus", "destination", "dates", "vibes", "style"];

export default function PlanModalScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [currentStep, setCurrentStep] = useState<Step>("companion");
  const [formData, setFormData] = useState<TripFormData>({
    birthDate: "1990-01-01",
    companionType: "Family",
    companionCount: 4,
    companionAges: "",
    curationFocus: "Everyone",
    destination: "",
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "21:00",
    vibes: [],
    travelStyle: "Reasonable",
  });

  const currentStepIndex = STEPS.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) {
      setCurrentStep(STEPS[currentStepIndex + 1]);
    } else {
      handleCreate();
    }
  };

  const goBack = () => {
    if (!isFirstStep) {
      setCurrentStep(STEPS[currentStepIndex - 1]);
    } else {
      navigation.goBack();
    }
  };

  const handleCreate = () => {
    console.log("Creating trip with:", formData);
    navigation.goBack();
  };

  const toggleVibe = (vibe: Vibe) => {
    setFormData(prev => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter(v => v !== vibe)
        : [...prev.vibes, vibe],
    }));
  };

  const renderCompanionStep = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>누구와 함께 떠나시나요?</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        동행을 선택하면 맞춤 여행을 추천해 드립니다
      </ThemedText>

      <View style={styles.optionsGrid}>
        {COMPANION_OPTIONS.map(option => (
          <Pressable
            key={option.id}
            style={[
              styles.optionCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
              formData.companionType === option.id && {
                borderColor: Brand.primary,
                borderWidth: 2,
                backgroundColor: `${Brand.primary}10`,
              },
            ]}
            onPress={() => setFormData(prev => ({ ...prev, companionType: option.id }))}
          >
            <View style={[
              styles.optionIcon,
              { backgroundColor: formData.companionType === option.id ? `${Brand.primary}20` : theme.backgroundSecondary },
            ]}>
              <Feather
                name={option.icon as any}
                size={24}
                color={formData.companionType === option.id ? Brand.primary : theme.textSecondary}
              />
            </View>
            <Text style={[
              styles.optionLabel,
              { color: formData.companionType === option.id ? Brand.primary : theme.text },
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {(formData.companionType === "Family" || formData.companionType === "Group") ? (
        <View style={styles.inputSection}>
          <ThemedText style={styles.inputLabel}>동행자 나이 (쉼표로 구분)</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="예: 10, 13, 55, 59"
            placeholderTextColor={theme.textTertiary}
            value={formData.companionAges}
            onChangeText={text => setFormData(prev => ({ ...prev, companionAges: text }))}
            keyboardType="default"
          />
        </View>
      ) : null}
    </View>
  );

  const renderFocusStep = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>이번 여행의 주인공은?</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        누구를 위한 여행인지에 따라 일정이 달라집니다
      </ThemedText>

      <View style={styles.focusList}>
        {CURATION_FOCUS_OPTIONS.map(option => (
          <Pressable
            key={option.id}
            style={[
              styles.focusCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
              formData.curationFocus === option.id && {
                borderColor: Brand.primary,
                borderWidth: 2,
                backgroundColor: `${Brand.primary}10`,
              },
            ]}
            onPress={() => setFormData(prev => ({ ...prev, curationFocus: option.id }))}
          >
            <View style={styles.focusContent}>
              <Text style={[
                styles.focusLabel,
                { color: formData.curationFocus === option.id ? Brand.primary : theme.text },
              ]}>
                {option.label}
              </Text>
              <Text style={[styles.focusDesc, { color: theme.textSecondary }]}>
                {option.description}
              </Text>
            </View>
            {formData.curationFocus === option.id ? (
              <View style={[styles.checkCircle, { backgroundColor: Brand.primary }]}>
                <Feather name="check" size={16} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderDestinationStep = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>어디로 떠나시나요?</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        도시 또는 나라를 입력해주세요
      </ThemedText>

      <TextInput
        style={[
          styles.destinationInput,
          { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text },
        ]}
        placeholder="예: 파리, 프랑스"
        placeholderTextColor={theme.textTertiary}
        value={formData.destination}
        onChangeText={text => setFormData(prev => ({ ...prev, destination: text }))}
      />
    </View>
  );

  const renderDatesStep = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>언제 떠나시나요?</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        렌터카처럼 시작 시간과 종료 시간까지 선택하세요
      </ThemedText>

      <View style={styles.dateRow}>
        <View style={styles.dateColumn}>
          <ThemedText style={styles.inputLabel}>시작일</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textTertiary}
            value={formData.startDate}
            onChangeText={text => setFormData(prev => ({ ...prev, startDate: text }))}
          />
        </View>
        <View style={styles.dateColumn}>
          <ThemedText style={styles.inputLabel}>시작 시간</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="09:00"
            placeholderTextColor={theme.textTertiary}
            value={formData.startTime}
            onChangeText={text => setFormData(prev => ({ ...prev, startTime: text }))}
          />
        </View>
      </View>

      <View style={styles.dateRow}>
        <View style={styles.dateColumn}>
          <ThemedText style={styles.inputLabel}>종료일</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textTertiary}
            value={formData.endDate}
            onChangeText={text => setFormData(prev => ({ ...prev, endDate: text }))}
          />
        </View>
        <View style={styles.dateColumn}>
          <ThemedText style={styles.inputLabel}>종료 시간</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="21:00"
            placeholderTextColor={theme.textTertiary}
            value={formData.endTime}
            onChangeText={text => setFormData(prev => ({ ...prev, endTime: text }))}
          />
        </View>
      </View>
    </View>
  );

  const renderVibesStep = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>어떤 분위기를 원하시나요?</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        여러 개 선택할 수 있습니다
      </ThemedText>

      <View style={styles.vibesGrid}>
        {VIBE_OPTIONS.map(vibe => {
          const isSelected = formData.vibes.includes(vibe.id);
          return (
            <Pressable
              key={vibe.id}
              style={[
                styles.vibeCard,
                { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
                isSelected && {
                  borderColor: Brand.primary,
                  borderWidth: 2,
                  backgroundColor: `${Brand.primary}10`,
                },
              ]}
              onPress={() => toggleVibe(vibe.id)}
            >
              <Feather
                name={vibe.icon as any}
                size={24}
                color={isSelected ? Brand.primary : theme.textSecondary}
              />
              <Text style={[
                styles.vibeLabel,
                { color: isSelected ? Brand.primary : theme.text },
              ]}>
                {vibe.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderStyleStep = () => (
    <View style={styles.stepContent}>
      <ThemedText style={styles.stepTitle}>여행 스타일을 선택하세요</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        예산과 취향에 맞는 스타일을 선택해주세요
      </ThemedText>

      <View style={styles.styleList}>
        {TRAVEL_STYLE_OPTIONS.map(style => (
          <Pressable
            key={style.id}
            style={[
              styles.styleCard,
              { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
              formData.travelStyle === style.id && {
                borderColor: Brand.primary,
                borderWidth: 2,
                backgroundColor: `${Brand.primary}10`,
              },
            ]}
            onPress={() => setFormData(prev => ({ ...prev, travelStyle: style.id }))}
          >
            <View style={[
              styles.styleIcon,
              { backgroundColor: formData.travelStyle === style.id ? `${Brand.primary}20` : theme.backgroundSecondary },
            ]}>
              <Feather
                name={style.icon as any}
                size={20}
                color={formData.travelStyle === style.id ? Brand.primary : theme.textSecondary}
              />
            </View>
            <View style={styles.styleContent}>
              <Text style={[
                styles.styleLabel,
                { color: formData.travelStyle === style.id ? Brand.primary : theme.text },
              ]}>
                {style.label}
              </Text>
              <Text style={[styles.styleDesc, { color: theme.textSecondary }]}>
                {style.description}
              </Text>
            </View>
            {formData.travelStyle === style.id ? (
              <View style={[styles.checkCircle, { backgroundColor: Brand.primary }]}>
                <Feather name="check" size={16} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "companion": return renderCompanionStep();
      case "focus": return renderFocusStep();
      case "destination": return renderDestinationStep();
      case "dates": return renderDatesStep();
      case "vibes": return renderVibesStep();
      case "style": return renderStyleStep();
      default: return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={goBack} style={styles.headerButton}>
          <Feather name={isFirstStep ? "x" : "arrow-left"} size={24} color={theme.text} />
        </Pressable>
        <View style={styles.progressContainer}>
          {STEPS.map((step, index) => (
            <View
              key={step}
              style={[
                styles.progressDot,
                { backgroundColor: index <= currentStepIndex ? Brand.primary : theme.border },
              ]}
            />
          ))}
        </View>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {renderCurrentStep()}
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable onPress={goNext} style={styles.nextButton}>
          <LinearGradient
            colors={Brand.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.nextButtonGradient}
          >
            <Text style={styles.nextButtonText}>
              {isLastStep ? "여정 생성하기" : "다음"}
            </Text>
            {!isLastStep ? (
              <Feather name="arrow-right" size={20} color="#FFFFFF" />
            ) : null}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  progressContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  stepContent: {},
  stepTitle: {
    ...Typography.h1,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    ...Typography.body,
    marginBottom: Spacing.xl,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  optionCard: {
    width: "47%",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  optionLabel: {
    ...Typography.label,
    fontWeight: "600",
  },
  inputSection: {
    marginTop: Spacing.xl,
  },
  inputLabel: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    ...Typography.body,
  },
  focusList: {
    gap: Spacing.md,
  },
  focusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  focusContent: {
    flex: 1,
  },
  focusLabel: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  focusDesc: {
    ...Typography.small,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  destinationInput: {
    height: Spacing.inputHeight * 1.2,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    ...Typography.h3,
  },
  dateRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  dateColumn: {
    flex: 1,
  },
  vibesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  vibeCard: {
    width: "30%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  vibeLabel: {
    ...Typography.caption,
    fontWeight: "600",
  },
  styleList: {
    gap: Spacing.md,
  },
  styleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  styleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  styleContent: {
    flex: 1,
  },
  styleLabel: {
    ...Typography.h3,
    marginBottom: 2,
  },
  styleDesc: {
    ...Typography.caption,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  nextButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  nextButtonGradient: {
    height: Spacing.buttonHeight,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nextButtonText: {
    ...Typography.label,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
