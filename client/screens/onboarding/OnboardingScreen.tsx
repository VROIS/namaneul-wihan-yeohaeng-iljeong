// 온보딩 화면 = client/screens/OnboardingScreen.tsx 분리(2026-07-16 §0 슬림화, 순수 이동, trip-planner/ 폴더 패턴 동일)
import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  useColorScheme,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/Icon";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Spacing, Colors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useTranslation } from "react-i18next";
import { saveAuth, calculateAge, getAgeGroup, type UserData } from "@/lib/auth";
import { SUPPORTED_LANGS } from "@/lib/i18n";
import { styles } from "./styles";
import LanguageModal from "./components/LanguageModal";

export default function OnboardingScreen() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const currentLang =
    SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const birthDate = useMemo(() => {
    if (day.length === 2 && month.length === 2 && year.length === 4) {
      const d = parseInt(day, 10);
      const m = parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      const date = new Date(y, m, d);
      if (
        date.getDate() === d &&
        date.getMonth() === m &&
        date.getFullYear() === y
      ) {
        return date;
      }
    }
    return null;
  }, [day, month, year]);

  const age = useMemo(
    () => (birthDate ? calculateAge(birthDate) : null),
    [birthDate],
  );
  const ageGroup = useMemo(
    () => (age !== null ? getAgeGroup(age) : null),
    [age],
  );
  const isAdult = age !== null && age >= 18;
  const isDateComplete =
    day.length === 2 && month.length === 2 && year.length === 4;

  const validateAndSetDay = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDay(num);
    setDateError(null);
    if (num.length === 2) {
      const d = parseInt(num, 10);
      if (d < 1 || d > 31) {
        setDateError(t("onboarding.dateInvalid"));
      } else {
        monthRef.current?.focus();
      }
    }
  };

  const validateAndSetMonth = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 2);
    setMonth(num);
    setDateError(null);
    if (num.length === 2) {
      const m = parseInt(num, 10);
      if (m < 1 || m > 12) {
        setDateError(t("onboarding.monthInvalid"));
      } else {
        yearRef.current?.focus();
      }
    }
  };

  const validateAndSetYear = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 4);
    setYear(num);
    setDateError(null);
    if (num.length === 4) {
      const y = parseInt(num, 10);
      const currentYear = new Date().getFullYear();
      if (y < 1920 || y > currentYear - 10) {
        setDateError(t("onboarding.yearInvalid"));
      }
    }
  };

  const handleSocialLogin = async (provider: "kakao" | "google") => {
    if (!birthDate || !isAdult) {
      setDateError(t("onboarding.adultOnly"));
      return;
    }

    const userData: UserData = {
      id: `${provider}_${Date.now()}`,
      email: `user@${provider}.com`,
      name: provider === "kakao" ? "카카오 사용자" : "Google User",
      provider,
      language: i18n.language,
      birthDate: birthDate.toISOString(),
      ageGroup: ageGroup || "",
      createdAt: new Date().toISOString(),
    };

    await saveAuth(userData);
    navigation.reset({
      index: 0,
      routes: [{ name: "Main" }],
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + Spacing.xl,
              paddingBottom: insets.bottom + Spacing.xl,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Icon name="arrow-left" size={24} color={theme.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {t("onboarding.signUp")}
            </Text>
            <View style={styles.placeholder} />
          </View>

          {/* Form Section */}
          <View style={styles.formSection}>
            {/* Language Selector */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {t("onboarding.language")}
            </Text>
            <Pressable
              style={[
                styles.selector,
                {
                  backgroundColor: theme.backgroundDefault,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setShowLanguageModal(true)}
            >
              <Text style={styles.flagText}>{currentLang.flag}</Text>
              <Text style={[styles.selectorText, { color: theme.text }]}>
                {currentLang.nativeName}
              </Text>
              <Icon name="chevron-down" size={20} color={theme.textTertiary} />
            </Pressable>

            {/* Birth Date Input - Card Style DD/MM/YYYY */}
            <Text
              style={[
                styles.label,
                { color: theme.textSecondary, marginTop: Spacing.xl },
              ]}
            >
              {t("onboarding.birthDate")}
            </Text>
            <Text style={[styles.birthDateHint, { color: theme.textTertiary }]}>
              {t("onboarding.birthDateHint")}
            </Text>
            <View style={styles.dateInputRow}>
              <View
                style={[
                  styles.dateInputBox,
                  {
                    backgroundColor: theme.backgroundDefault,
                    borderColor: dateError ? "#EF4444" : theme.border,
                  },
                ]}
              >
                <TextInput
                  style={[styles.dateInput, { color: theme.text }]}
                  placeholder="DD"
                  placeholderTextColor={theme.textTertiary}
                  value={day}
                  onChangeText={validateAndSetDay}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                  {...(Platform.OS === "web" && {
                    // @ts-expect-error 웹: type="number"는 선행 0 제거·숫자 변형 유발
                    type: "text",
                    inputMode: "numeric",
                  })}
                />
              </View>
              <Text
                style={[styles.dateSeparator, { color: theme.textTertiary }]}
              >
                /
              </Text>
              <View
                style={[
                  styles.dateInputBox,
                  {
                    backgroundColor: theme.backgroundDefault,
                    borderColor: dateError ? "#EF4444" : theme.border,
                  },
                ]}
              >
                <TextInput
                  ref={monthRef}
                  style={[styles.dateInput, { color: theme.text }]}
                  placeholder="MM"
                  placeholderTextColor={theme.textTertiary}
                  value={month}
                  onChangeText={validateAndSetMonth}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                />
              </View>
              <Text
                style={[styles.dateSeparator, { color: theme.textTertiary }]}
              >
                /
              </Text>
              <View
                style={[
                  styles.dateInputBox,
                  styles.yearBox,
                  {
                    backgroundColor: theme.backgroundDefault,
                    borderColor: dateError ? "#EF4444" : theme.border,
                  },
                ]}
              >
                <TextInput
                  ref={yearRef}
                  style={[styles.dateInput, { color: theme.text }]}
                  placeholder="YYYY"
                  placeholderTextColor={theme.textTertiary}
                  value={year}
                  onChangeText={validateAndSetYear}
                  keyboardType="number-pad"
                  maxLength={4}
                  textAlign="center"
                  {...(Platform.OS === "web" && {
                    // @ts-expect-error 웹: type="number"는 선행 0 제거·숫자 변형 유발
                    type: "text",
                    inputMode: "numeric",
                  })}
                />
              </View>
              {isAdult && ageGroup ? (
                <View style={styles.ageBadge}>
                  <Text style={styles.ageBadgeText}>{ageGroup}</Text>
                </View>
              ) : null}
            </View>
            {dateError ? (
              <Text style={styles.errorText}>{dateError}</Text>
            ) : isDateComplete && !isAdult && age !== null ? (
              <Text style={styles.errorText}>{t("onboarding.adultOnly")}</Text>
            ) : null}
          </View>

          {/* Social Login Buttons */}
          <View style={styles.socialSection}>
            {/* Kakao Button */}
            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.kakaoButton,
                pressed && styles.buttonPressed,
                (!isAdult || !isDateComplete) && styles.buttonDisabled,
              ]}
              onPress={() => handleSocialLogin("kakao")}
              disabled={!isAdult || !isDateComplete}
            >
              <View style={styles.kakaoIcon}>
                <Text style={styles.kakaoIconText}>K</Text>
              </View>
              <Text style={styles.kakaoButtonText}>
                {t("onboarding.kakaoStart")}
              </Text>
            </Pressable>

            {/* Google Button */}
            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.googleButton,
                { borderColor: theme.border },
                pressed && styles.buttonPressed,
                (!isAdult || !isDateComplete) && styles.buttonDisabled,
              ]}
              onPress={() => handleSocialLogin("google")}
              disabled={!isAdult || !isDateComplete}
            >
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={[styles.googleButtonText, { color: theme.text }]}>
                {t("onboarding.googleStart")}
              </Text>
            </Pressable>

            <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
              {t("onboarding.termsAgree")}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Language Selection Modal */}
      <LanguageModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        currentLang={currentLang}
        theme={theme}
      />
    </View>
  );
}
