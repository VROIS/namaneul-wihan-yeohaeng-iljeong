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
  Dimensions,
  Animated,
  Easing,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { Spacing, BorderRadius, Brand, Colors, Fonts } from "@/constants/theme";
import Icon from "@/components/Icon";
import { RootStackParamList } from "../navigation/RootStackNavigator";
import {
  UserData,
  calculateAge,
  getAgeGroup,
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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Language = {
  code: string;
  flag: string;
  name: string;
  nativeName: string;
};

const LANGUAGES: Language[] = [
  { code: "ko", flag: "🇰🇷", name: "Korean", nativeName: "한국어" },
  { code: "en", flag: "🇺🇸", name: "English", nativeName: "English" },
  { code: "fr", flag: "🇫🇷", name: "French", nativeName: "Français" },
  { code: "zh", flag: "🇨🇳", name: "Chinese", nativeName: "中文" },
  { code: "ja", flag: "🇯🇵", name: "Japanese", nativeName: "日本語" },
  { code: "es", flag: "🇪🇸", name: "Spanish", nativeName: "Español" },
  { code: "de", flag: "🇩🇪", name: "German", nativeName: "Deutsch" },
];

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    LANGUAGES[0],
  );
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
      language: selectedLanguage.code,
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
        Alert.alert("로그인 실패", "Google 로그인 중 오류가 발생했습니다.");
      })
      .finally(() => setOauthLoading(false));
  }, [googleResponse, birthDateStr, selectedLanguage.code, navigation]);

  // 카카오 웹 리다이렉트 복귀 시 code 처리
  useEffect(() => {
    if (Platform.OS !== "web" || !isKakaoOAuthConfigured()) return;
    const url = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(url);
    const code = params.get("code");
    if (!code) return;

    const callbackData = getKakaoCallbackData();
    const birthDate = callbackData?.birthDate;
    const language = callbackData?.language || selectedLanguage.code;
    if (!birthDate) {
      Alert.alert(
        "로그인 실패",
        "생년월일 정보가 없습니다. 다시 시도해주세요.",
      );
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
            "로그인 실패",
            result.error || "카카오 로그인에 실패했습니다.",
          );
        }
      })
      .catch((err) => {
        console.error("Kakao login error:", err);
        Alert.alert("로그인 실패", "카카오 로그인 중 오류가 발생했습니다.");
      })
      .finally(() => setOauthLoading(false));
  }, [selectedLanguage.code, navigation]);

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
        setDateError("유효하지 않은 월입니다");
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
        setDateError("유효하지 않은 연도입니다");
      }
    }
  };

  const requireBirthDateAndAdult = (): boolean => {
    if (!isDateComplete) {
      setDateError("생년월일을 먼저 입력해주세요");
      Alert.alert("알림", "서비스 이용을 위해 생년월일 입력이 필요합니다.");
      dayRef.current?.focus();
      return false;
    }
    if (!birthDate || !isAdult) {
      setDateError("만 18세 이상만 이용 가능합니다");
      Alert.alert("알림", "만 18세 이상만 이용 가능합니다.");
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
      language: selectedLanguage.code,
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
      Alert.alert("로그인 실패", result.error || "서버 통신에 실패했습니다.");
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
      Alert.alert("알림", "올바른 전화번호를 입력해주세요.");
      return;
    }
    setOauthLoading(true);
    const result = await whatsappOtpSend(whatsappPhone);
    setOauthLoading(false);
    if (result.success) {
      setWhatsappStep("otp");
      setWhatsappOtp("");
    } else {
      Alert.alert("OTP 발송 실패", result.error || "다시 시도해주세요.");
    }
  };

  const handleWhatsAppVerify = async () => {
    if (!whatsappOtp || whatsappOtp.length < 4) {
      Alert.alert("알림", "OTP 6자리를 입력해주세요.");
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
        "로그인 실패",
        result.error || "WhatsApp 로그인에 실패했습니다.",
      );
    }
  };

  const handleKakaoPress = async () => {
    if (!requireBirthDateAndAdult()) return;
    if (isKakaoOAuthConfigured() && Platform.OS === "web") {
      setOauthLoading(true);
      try {
        await startKakaoLoginWeb(birthDateStr!, selectedLanguage.code);
      } catch (err) {
        console.error("Kakao login start error:", err);
        Alert.alert("로그인 실패", "카카오 로그인을 시작할 수 없습니다.");
        setOauthLoading(false);
      }
    } else {
      await handleSocialLogin("kakao");
    }
  };

  return (
    <View style={styles.container}>
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
          {/* ── 상단 타이포그래픽 문구 (애니메이션 제거, 정적 텍스트 복구) ── */}
          <View style={styles.typoSection}>
            <Text style={[styles.typoLine1, { color: theme.text }]}>
              AI가 설계하고
            </Text>
            <Text style={[styles.typoLine2, { color: theme.textSecondary }]}>
              현지 전문가가 검증한
            </Text>
          </View>

          {/* ── NUBI 로고 ── */}
          <View style={styles.logoSection}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.appLogo}
              resizeMode="contain"
            />
          </View>

          {/* ── 구분선 ── */}
          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          {/* ── 언어 선택 ── */}
          <View style={styles.formSection}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              언어
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
              <Text style={styles.flagText}>{selectedLanguage.flag}</Text>
              <Text style={[styles.selectorText, { color: theme.text }]}>
                {selectedLanguage.nativeName}
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
              생년월일
            </Text>
            <Text style={[styles.birthDateHint, { color: theme.textTertiary }]}>
              실제 생년월일을 입력하시면 가족 맞춤 일정을 드려요
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
                만 18세 이상만 이용 가능합니다
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
                Google로 시작하기
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
                WhatsApp으로 시작하기
              </Text>
            </Pressable>

            <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
              로그인 시 이용약관 및 개인정보처리방침에 동의합니다
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
                언어 선택
              </Text>
              <Pressable onPress={() => setShowLanguageModal(false)}>
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.languageList}>
              {LANGUAGES.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[
                    styles.languageItem,
                    selectedLanguage.code === lang.code &&
                    styles.languageItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedLanguage(lang);
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
                  {selectedLanguage.code === lang.code ? (
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
                {whatsappStep === "phone" ? "전화번호 입력" : "OTP 입력"}
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
                  WhatsApp으로 OTP를 받을 전화번호를 입력하세요
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
                  <Text style={styles.whatsappButtonText}>OTP 발송</Text>
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
                  {whatsappPhone}로 발송된 6자리 OTP를 입력하세요
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
                  <Text style={styles.whatsappButtonText}>확인</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  flex: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingHorizontal: Spacing.xl, backgroundColor: "#FFFFFF" },

  /* ── 타이포그래픽 문구 ── */
  typoSection: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  typoLine1: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: "#1565C0",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  typoLine2: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: "#1E88E5",
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 2,
  },

  /* ── 로고 ── */
  logoSection: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  appLogo: {
    width: SCREEN_WIDTH * 0.42,
    height: SCREEN_WIDTH * 0.42,
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
