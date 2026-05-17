import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  useColorScheme,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { LinearGradient } from "expo-linear-gradient";
import { Spacing, BorderRadius, Brand, Colors, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { RootStackParamList } from "../navigation/RootStackNavigator";
import {
  UserData,
  calculateAge,
  getAgeGroup,
  saveAuth,
  socialLogin,
  socialLoginWithGoogle,
  socialLoginWithKakao,
  whatsappOtpSend,
  whatsappOtpVerify,
} from "../lib/auth";
import {
  useGoogleAuthRequest,
  isGoogleOAuthConfigured,
  isWhatsAppOtpConfigured,
  getIdTokenFromGoogleResponse,
} from "../lib/auth-oauth";
import {
  isKakaoOAuthConfigured,
  startKakaoLoginWeb,
  exchangeKakaoCodeForToken,
  getKakaoCallbackData,
} from "../lib/auth-kakao";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, changeLanguageAndPersist } from "../lib/i18n";


export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const currentLang = SUPPORTED_LANGS.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGS[0];
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const [googleRequest, googleResponse, googlePromptAsync] =
    useGoogleAuthRequest();
  const processedGoogleRef = useRef<typeof googleResponse>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappOtp, setWhatsappOtp] = useState("");
  const [whatsappStep, setWhatsappStep] = useState<"phone" | "otp">("phone");

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
  const birthDateStr = birthDate ? birthDate.toISOString().split("T")[0] : null;

  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success" || !birthDateStr)
      return;
    if (processedGoogleRef.current === googleResponse) return;
    processedGoogleRef.current = googleResponse;
    // @ts-expect-error Type mismatch from AuthSession
    const idToken = getIdTokenFromGoogleResponse(googleResponse);
    if (!idToken) return;
    setOauthLoading(true);
      socialLoginWithGoogle({
      idToken,
      birthDate: birthDateStr,
      language: i18n.language,
      deviceType: Platform.OS === "web" ? "web" : "mobile",
    })
      .then((result) => {
        if (result.success) {
          navigation.reset({ index: 0, routes: [{ name: "Main" }] });
        } else {
          Alert.alert(
            "로그인 실패",
            result.error || "Google 로그인에 실패했습니다.",
          );
        }
      })
      .catch((err) => {
        console.error("Google login error:", err);
        Alert.alert(t("login.loginFailed"), t("login.loginFailed"));
      })
      .finally(() => setOauthLoading(false));
  }, [googleResponse, birthDateStr, i18n.language, navigation]);

  // 카카오 웹 리다이렉트 복귀 시 code 처리
  useEffect(() => {
    if (Platform.OS !== "web" || !isKakaoOAuthConfigured()) return;
    const url = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(url);
    const code = params.get("code");
    if (!code) return;

    const callbackData = getKakaoCallbackData();
    const birthDate = callbackData?.birthDate;
    const language = callbackData?.language || i18n.language;
    if (!birthDate) {
      Alert.alert(t("login.loginFailed"), t("login.loginFailed"));
      if (typeof window !== "undefined" && window.history) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      return;
    }

    setOauthLoading(true);
    exchangeKakaoCodeForToken(code)
      .then((accessToken) =>
        socialLoginWithKakao({
          accessToken,
          birthDate,
          language,
          deviceType: "web",
        }),
      )
      .then((result) => {
        if (typeof window !== "undefined" && window.history) {
          window.history.replaceState({}, "", window.location.pathname);
        }
        if (result.success) {
          navigation.reset({ index: 0, routes: [{ name: "Main" }] });
        } else {
          Alert.alert(
            t("login.loginFailed"),
            result.error || t("login.loginFailed"),
          );
        }
      })
      .catch((err) => {
        console.error("Kakao login error:", err);
        Alert.alert("로그인 실패", "카카오 로그인 중 오류가 발생했습니다.");
      })
      .finally(() => setOauthLoading(false));
  }, [i18n.language, navigation]);

  const validateAndSetDay = (value: string) => {
    const num = value.replace(/[^0-9]/g, "").slice(0, 2);
    setDay(num);
    setDateError(null);
    if (num.length === 2) {
      const d = parseInt(num, 10);
      if (d < 1 || d > 31) {
        setDateError("유효하지 않은 날짜입니다");
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
        setDateError(t("login.monthInvalid"));
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
        setDateError(t("login.yearInvalid"));
      }
    }
  };

  const requireBirthDateAndAdult = (): boolean => {
    if (!isDateComplete) {
      setDateError(t("login.birthRequired"));
      Alert.alert(t("login.alert"), t("login.birthRequiredAlert"));
      dayRef.current?.focus();
      return false;
    }
    if (!birthDate || !isAdult) {
      setDateError(t("login.adultOnly"));
      Alert.alert(t("login.alert"), t("login.adultOnly"));
      return false;
    }
    return true;
  };

  const handleSocialLogin = async (
    provider: "kakao" | "google" | "whatsapp",
  ) => {
    if (!requireBirthDateAndAdult()) return;

    const result = await socialLogin({
      provider,
      birthDate: birthDate!.toISOString().split("T")[0],
      language: i18n.language,
      deviceType: Platform.OS,
      displayName:
        provider === "kakao"
          ? "카카오 사용자"
          : provider === "whatsapp"
            ? "WhatsApp User"
            : "Google User",
    });

    if (result.success && result.user) {
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      Alert.alert(t("login.loginFailed"), result.error || t("login.loginFailed"));
    }
  };

  const handleGooglePress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (isGoogleOAuthConfigured()) {
      await googlePromptAsync();
    } else {
      await handleSocialLogin("google");
    }
  };

  const handleWhatsAppPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    setShowWhatsAppModal(true);
    setWhatsappStep("phone");
    setWhatsappPhone("");
    setWhatsappOtp("");
  };

  const handleWhatsAppSendOtp = async () => {
    const phone = whatsappPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      Alert.alert(t("login.alert"), t("login.phoneHint"));
      return;
    }
    setOauthLoading(true);
    const result = await whatsappOtpSend(whatsappPhone);
    setOauthLoading(false);
    if (result.success) {
      setWhatsappStep("otp");
      setWhatsappOtp("");
    } else {
      Alert.alert(t("login.loginFailed"), result.error || t("common.retry"));
    }
  };

  const handleWhatsAppVerify = async () => {
    if (!whatsappOtp || whatsappOtp.length < 4) {
      Alert.alert(t("login.alert"), t("login.otpHint", { phone: whatsappPhone }));
      return;
    }
    setOauthLoading(true);
    const result = await whatsappOtpVerify({
      phoneNumber: whatsappPhone,
      otp: whatsappOtp,
      birthDate: birthDateStr!,
      language: selectedLanguage.code,
      deviceType: Platform.OS === "web" ? "web" : "mobile",
    });
    setOauthLoading(false);
    if (result.success) {
      setShowWhatsAppModal(false);
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      Alert.alert(
        t("login.loginFailed"),
        result.error || t("login.loginFailed"),
      );
    }
  };

  const handleKakaoPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (isKakaoOAuthConfigured() && Platform.OS === "web") {
      setOauthLoading(true);
      try {
        await startKakaoLoginWeb(birthDateStr!, i18n.language);
      } catch (err) {
        console.error("Kakao login start error:", err);
        Alert.alert("로그인 실패", "카카오 로그인을 시작할 수 없습니다.");
        setOauthLoading(false);
      }
    } else {
      await handleSocialLogin("kakao");
    }
  };

  const handleGuestBrowse = async () => {
    const guestUser: UserData = {
      id: "guest_browse",
      displayName: "비회원",
      provider: "kakao",
      language: i18n.language,
      birthDate: birthDateStr || "1990-01-01",
    };
    await saveAuth(guestUser);
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

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
              source={require("../../assets/images/tripis-mark.png")}
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
              <Text style={styles.errorText}>
                {t("login.adultOnly")}
              </Text>
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
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {t("login.languageSelect")}
              </Text>
              <Pressable onPress={() => setShowLanguageModal(false)}>
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.languageList}>
              {SUPPORTED_LANGS.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[
                    styles.languageItem,
                    currentLang.code === lang.code &&
                    styles.languageItemSelected,
                  ]}
                  onPress={async () => {
                    await changeLanguageAndPersist(lang.code);
                    setShowLanguageModal(false);
                  }}
                >
                  <Text style={styles.flagText}>{lang.flag}</Text>
                  <View style={styles.languageTextContainer}>
                    <Text style={[styles.languageName, { color: theme.text }]}>
                      {lang.nativeName}
                    </Text>
                    <Text
                      style={[
                        styles.languageSubname,
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

      {/* ── WhatsApp OTP 모달 ── */}
      <Modal
        visible={showWhatsAppModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWhatsAppModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {whatsappStep === "phone" ? t("login.phoneInput") : t("login.otpInput")}
              </Text>
              <Pressable onPress={() => setShowWhatsAppModal(false)}>
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            {whatsappStep === "phone" ? (
              <View style={styles.whatsappModalBody}>
                <Text
                  style={[
                    styles.whatsappModalHint,
                    { color: theme.textTertiary },
                  ]}
                >
                  {t("login.phoneHint")}
                </Text>
                <TextInput
                  style={[
                    styles.whatsappInput,
                    { color: theme.text, borderColor: theme.border },
                  ]}
                  placeholder="01012345678"
                  placeholderTextColor={theme.textTertiary}
                  value={whatsappPhone}
                  onChangeText={setWhatsappPhone}
                  keyboardType="phone-pad"
                />
                <Pressable
                  style={[styles.whatsappSubmit, styles.whatsappButton]}
                  onPress={handleWhatsAppSendOtp}
                  disabled={oauthLoading}
                >
                  <Text style={styles.whatsappButtonText}>{t("login.otpSend")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.whatsappModalBody}>
                <Text
                  style={[
                    styles.whatsappModalHint,
                    { color: theme.textTertiary },
                  ]}
                >
                  {t("login.otpHint", { phone: whatsappPhone })}
                </Text>
                <TextInput
                  style={[
                    styles.whatsappInput,
                    { color: theme.text, borderColor: theme.border },
                  ]}
                  placeholder="000000"
                  placeholderTextColor={theme.textTertiary}
                  value={whatsappOtp}
                  onChangeText={(t) =>
                    setWhatsappOtp(t.replace(/\D/g, "").slice(0, 6))
                  }
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Pressable
                  style={[styles.whatsappSubmit, styles.whatsappButton]}
                  onPress={handleWhatsAppVerify}
                  disabled={oauthLoading}
                >
                  <Text style={styles.whatsappButtonText}>{t("common.confirm")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setWhatsappStep("phone")}
                  style={{ marginTop: Spacing.sm }}
                >
                  <Text style={{ color: theme.textTertiary, fontSize: 13 }}>
                    전화번호 변경
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl },

  /* ── TRIPIS 통합 헤더 = 시안 tripia-onboarding.jsx:35-45 ── */
  tripisHeader: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  tripisMark: {
    height: 120,
    width: 120,
    marginBottom: 24,
  },
  tripisTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 28,
  },
  tripisTitle: {
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1.2,
    color: Brand.primary,
    lineHeight: 38,
  },
  tripisTitleKo: {
    fontSize: 14,
    color: "#6B6459",
    letterSpacing: 1,
  },
  tripisSubtitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.6,
    textAlign: "center",
    color: "#1A1A1A",
  },

  /* ── 구분선 ── */
  divider: {
    height: 1,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.xl,
  },

  /* ── 폼 ── */
  formSection: { marginBottom: Spacing.md },
  label: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  birthDateHint: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  flagText: { fontSize: 24 },
  selectorText: { flex: 1, fontSize: 16, fontFamily: Fonts.medium },
  dateInputRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  dateInputBox: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    width: 56,
    height: 52,
    justifyContent: "center",
  },
  yearBox: { width: 80 },
  dateInput: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    paddingHorizontal: Spacing.sm,
  },
  dateSeparator: { fontSize: 20, fontFamily: Fonts.medium },
  ageBadge: {
    backgroundColor: Brand.primary,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    marginLeft: Spacing.sm,
  },
  ageBadgeText: { color: "#FFFFFF", fontSize: 13, fontFamily: Fonts.bold },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    fontFamily: Fonts.sans,
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  /* ── 소셜 버튼 ── */
  socialSection: { gap: Spacing.md, paddingBottom: Spacing.lg },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.6 },
  kakaoButton: { backgroundColor: "#FEE500" },
  kakaoIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#3C1E1E",
    justifyContent: "center",
    alignItems: "center",
  },
  kakaoIconText: { color: "#FEE500", fontSize: 14, fontFamily: Fonts.bold },
  kakaoButtonText: { color: "#000000", fontSize: 16, fontFamily: Fonts.bold },
  whatsappButton: { backgroundColor: "#25D366" },
  whatsappButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  googleButton: { backgroundColor: "#FFFFFF", borderWidth: 1 },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#4285F4",
    justifyContent: "center",
    alignItems: "center",
  },
  googleIconText: { color: "#FFFFFF", fontSize: 14, fontFamily: Fonts.bold },
  googleButtonText: { fontSize: 16, fontFamily: Fonts.bold },
  disclaimer: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    textAlign: "center",
    marginTop: Spacing.md,
    lineHeight: 18,
  },

  /* ── 언어 모달 ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing["3xl"],
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  languageList: { paddingHorizontal: Spacing.xl },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  languageItemSelected: { backgroundColor: "rgba(66, 133, 244, 0.08)" },
  languageTextContainer: { flex: 1 },
  languageName: { fontSize: 16, fontWeight: "600" },
  languageSubname: { fontSize: 13, marginTop: 2 },

  /* ── WhatsApp OTP 모달 ── */
  whatsappModalBody: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  whatsappModalHint: { fontSize: 13, marginBottom: Spacing.md },
  whatsappInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  whatsappSubmit: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
});
