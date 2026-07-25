// 로그인 화면 = 조립 전용 = 2026-07-15 §0 슬림화 분리(옛 1,056줄 단일파일 → login/ 폴더 완전분리, 순수 이동)
import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Spacing, Brand } from "@/constants/theme";
import Icon from "@/components/Icon";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { isWhatsAppOtpConfigured } from "@/lib/auth-oauth";
import { useLogin } from "./hooks/useLogin";
import LanguageModal from "./components/LanguageModal";
import WhatsAppModal from "./components/WhatsAppModal";
import { styles } from "./styles";

export default function LoginScreen() {
  // ⚠️ 2026-07-25 = 이 화면(과도기 보관) = 로그인 성공 시 기존대로 Main 리셋. useLogin(onDone) 로 위임(§0 단일경로).
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const login = useLogin({
    onDone: () => navigation.reset({ index: 0, routes: [{ name: "Main" }] }),
  });
  const {
    t,
    theme,
    insets,
    currentLang,
    setShowLanguageModal,
    day,
    month,
    year,
    dateError,
    oauthLoading,
    dayRef,
    monthRef,
    yearRef,
    age,
    ageGroup,
    isAdult,
    isDateComplete,
    validateAndSetDay,
    validateAndSetMonth,
    validateAndSetYear,
    handleGooglePress,
    handleWhatsAppPress,
    handleKakaoPress,
    emailInput,
    setEmailInput,
    emailLoading,
    handleEmailLogin,
    handleGuestBrowse,
  } = login;

  return (
    <LinearGradient
      colors={["rgba(139, 92, 246, 0.05)", "#FFFFFF"]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + Spacing.md,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── TRIPIS 통합 헤더 = 시안 = tripia-onboarding.jsx:35-45 ── */}
          <View style={styles.tripisHeader}>
            <Image
              source={require("../../../assets/images/tripis-mark.png")}
              style={styles.tripisMark}
              resizeMode="contain"
            />
            <View style={styles.tripisTitleRow}>
              <Text style={styles.tripisTitle}>Tripis</Text>
              <Text style={styles.tripisTitleKo}>트리피스</Text>
            </View>
            <Text style={styles.tripisSubtitle}>{t("login.slogan")}</Text>
          </View>

          {/* ── 구분선 ── */}
          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          {/* ── 언어 선택 ── */}
          <View style={styles.formSection}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {t("login.language")}
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

            {/* ── 생년월일 ── */}
            <Text
              style={[
                styles.label,
                { color: theme.textSecondary, marginTop: Spacing.xl },
              ]}
            >
              {t("login.birthDate")}
            </Text>
            <Text style={[styles.birthDateHint, { color: theme.textTertiary }]}>
              {t("login.birthDateHint")}
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
                  ref={dayRef}
                  style={[styles.dateInput, { color: theme.text }]}
                  placeholder="DD"
                  placeholderTextColor={theme.textTertiary}
                  value={day}
                  onChangeText={validateAndSetDay}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                  {...(Platform.OS === "web" && {
                    // @ts-expect-error 웹: type="number"는 선행 0 제거·숫자 변형(03→02 등) 유발. text+inputMode로 정확한 입력 보장
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
              <Text style={styles.errorText}>{t("login.adultOnly")}</Text>
            ) : null}
          </View>

          {/* ── 소셜 로그인 버튼 ── */}
          <View style={styles.socialSection}>
            {/* 카카오 */}
            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.kakaoButton,
                pressed && styles.buttonPressed,
                oauthLoading && styles.buttonDisabled,
              ]}
              onPress={handleKakaoPress}
              disabled={oauthLoading}
            >
              <View style={styles.kakaoIcon}>
                <Text style={styles.kakaoIconText}>K</Text>
              </View>
              <Text style={styles.kakaoButtonText}>카카오로 시작하기</Text>
            </Pressable>

            {/* 구글 */}
            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.googleButton,
                { borderColor: theme.border },
                pressed && styles.buttonPressed,
                oauthLoading && styles.buttonDisabled,
              ]}
              onPress={handleGooglePress}
              disabled={oauthLoading}
            >
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={[styles.googleButtonText, { color: theme.text }]}>
                {t("login.googleStart")}
              </Text>
            </Pressable>

            {/* ⚠️ 사장님 SSOT 2026-07-14 = 개발단계 이메일 로그인(구글 OAuth 웹 400 우회). 메일 넣으면 그 계정으로 로그인(사장님 메일=admin). 로그인 정식화 때 폐기 §19. */}
            <View style={styles.emailLoginBox}>
              <Text
                style={[styles.emailLoginLabel, { color: theme.textTertiary }]}
              >
                {t("login.emailDevLabel")}
              </Text>
              <View style={styles.emailLoginRow}>
                <TextInput
                  style={[
                    styles.emailInput,
                    {
                      backgroundColor: theme.backgroundDefault,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  placeholder={t("login.emailPlaceholder")}
                  placeholderTextColor={theme.textTertiary}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!emailLoading}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.emailLoginBtn,
                    {
                      backgroundColor: Brand.primary,
                      opacity:
                        emailLoading || !emailInput.trim()
                          ? 0.5
                          : pressed
                            ? 0.8
                            : 1,
                    },
                  ]}
                  onPress={handleEmailLogin}
                  disabled={emailLoading || !emailInput.trim()}
                >
                  <Text style={styles.emailLoginBtnText}>
                    {t("login.emailLoginBtn")}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 로그인 없이 둘러보기 (테스트용) */}
            <Pressable
              onPress={handleGuestBrowse}
              style={({ pressed }) => [
                { opacity: pressed ? 0.7 : 1, paddingVertical: Spacing.sm },
              ]}
            >
              <Text style={[styles.disclaimer, { color: theme.link }]}>
                {t("login.guestBrowse")}
              </Text>
            </Pressable>
            {/* BTS 투어 바로가기 (로그인 없이 접근) */}
            <Pressable
              onPress={() => navigation.navigate("BTSConcertPlanner")}
              style={({ pressed }) => [
                { opacity: pressed ? 0.7 : 1, paddingVertical: Spacing.sm },
              ]}
            >
              <Text style={[styles.disclaimer, { color: theme.link }]}>
                {t("login.btsTour")}
              </Text>
            </Pressable>

            {/* WhatsApp (출시 전 비활성화: 터치 불가) */}
            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.whatsappButton,
                pressed && isWhatsAppOtpConfigured() && styles.buttonPressed,
                (oauthLoading || !isWhatsAppOtpConfigured()) &&
                  styles.buttonDisabled,
                !isWhatsAppOtpConfigured() && { opacity: 0.5 },
              ]}
              onPress={handleWhatsAppPress}
              disabled={oauthLoading || !isWhatsAppOtpConfigured()}
              pointerEvents={isWhatsAppOtpConfigured() ? "auto" : "none"}
            >
              <MaterialCommunityIcons
                name="whatsapp"
                size={24}
                color="#FFFFFF"
              />
              <Text style={styles.whatsappButtonText}>
                {t("login.whatsappStart")}
              </Text>
            </Pressable>

            <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
              {t("login.termsAgree")}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── 언어 선택 모달 ── */}
      <LanguageModal login={login} />

      {/* ── WhatsApp OTP 모달 ── */}
      <WhatsAppModal login={login} />
    </LinearGradient>
  );
}
