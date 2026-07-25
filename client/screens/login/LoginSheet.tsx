// ⚠️ 사장님 SSOT 2026-07-25 = 로그인 = 별도 화면 아닌 인앱 팝업(SnapSheet). '내손앱'처럼.
//   기존 LoginScreen(보관)의 폼을 그대로 담되(§16 재사용), 화면이동 대신 팝업 닫기(onDone)로 동작.
//   로고+슬로건 = "앱 정체성" = 팝업 크기(스냅)에 따라 실시간 리사이즈(방법B): 로고+타이틀 = progress interpolate / 슬로건 = adjustsFontSizeToFit.
//   곁가지 제외(사장님 "메인앱만") = WhatsApp·BTS·언어선택 미포함. 애플 = 별도 세션.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  useColorScheme,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import SnapSheet from "@/components/SnapSheet";
import { Colors, Brand } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { useLogin } from "./hooks/useLogin";
import { styles } from "./styles";

// ⚠️ 방법B = 팝업 노출 진행도(progress: 0=peek ~ 1=full)에 따라 로고 크기·타이틀 폰트 실시간 리사이즈.
//   로고: 48~120px(정사각 aspectRatio:1) / 타이틀: 22~38pt. 슬로건은 adjustsFontSizeToFit(성능 안전 하이브리드).
function ResizableBrand({ progress }: { progress: SharedValue<number> }) {
  const { t } = useTranslation();

  const logoStyle = useAnimatedStyle(() => {
    const size = interpolate(
      progress.value,
      [0, 1],
      [48, 120],
      Extrapolation.CLAMP,
    );
    return { width: size, height: size };
  });
  const titleStyle = useAnimatedStyle(() => {
    const fs = interpolate(
      progress.value,
      [0, 1],
      [22, 38],
      Extrapolation.CLAMP,
    );
    return { fontSize: fs, lineHeight: fs };
  });

  return (
    <View style={styles.tripisHeader}>
      <Animated.Image
        source={require("../../../assets/images/tripis-mark.png")}
        style={[{ aspectRatio: 1, marginBottom: 16 }, logoStyle]}
        resizeMode="contain"
      />
      <View style={styles.tripisTitleRow}>
        <Animated.Text style={[styles.tripisTitle, titleStyle]}>
          Tripis
        </Animated.Text>
        <Text style={styles.tripisTitleKo}>트리피스</Text>
      </View>
      <Text
        style={styles.tripisSubtitle}
        adjustsFontSizeToFit
        numberOfLines={2}
        minimumFontScale={0.6}
      >
        {t("login.slogan")}
      </Text>
    </View>
  );
}

// ⚠️ 2026-07-25 = 폼 본문(useLogin 포함)을 별도 컴포넌트로 분리 = SnapSheet 자식은 visible=false면 언마운트(SnapSheet.tsx `if(!visible) return null`).
//   → 팝업 닫으면 useLogin state(생년월일·이메일·에러) 소멸 = 재열림 시 항상 깨끗(개인정보 잔류·상태 잔류 방지, react-best 지적).
//   → 닫혀있을 땐 useLogin 의 카카오 웹 code useEffect·useGoogleAuthRequest 도 안 돎 = LoginScreen(보관)과의 카카오 code 이중소비 위험 제거.
function LoginSheetForm({ onClose }: { onClose: () => void }) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  // 로그인 성공/게스트 = 팝업만 닫음(배경 화면 유지, 화면 이동 X). 인증 지속은 saveAuth 가 이미 처리(§16).
  const login = useLogin({ onDone: onClose });
  const {
    t,
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
    handleKakaoPress,
    emailInput,
    setEmailInput,
    emailLoading,
    handleEmailLogin,
  } = login;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── 생년월일 (소셜 로그인 필수) ── 사장님 SSOT 2026-07-25 = 팝업 노출 = 로고+슬로건+생년월일+구글+카톡+이메일만. 언어선택·게스트·약관 제외. */}
      <View style={styles.formSection}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
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
                // 웹: type="number"는 선행 0 제거·숫자 변형 유발. text+inputMode로 정확한 입력 보장
                type: "text",
                inputMode: "numeric",
              })}
            />
          </View>
          <Text style={[styles.dateSeparator, { color: theme.textTertiary }]}>
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
                // 웹: type="number"는 선행 0 제거·숫자 변형 유발
                type: "text",
                inputMode: "numeric",
              })}
            />
          </View>
          <Text style={[styles.dateSeparator, { color: theme.textTertiary }]}>
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
                // 웹: type="number"는 선행 0 제거·숫자 변형 유발
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

      {/* ── 소셜 로그인 ── */}
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
          accessibilityRole="button"
          accessibilityLabel="카카오로 시작하기"
          accessibilityState={{ disabled: oauthLoading }}
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
          accessibilityRole="button"
          accessibilityLabel={t("login.googleStart")}
          accessibilityState={{ disabled: oauthLoading }}
        >
          <View style={styles.googleIcon}>
            <Text style={styles.googleIconText}>G</Text>
          </View>
          <Text style={[styles.googleButtonText, { color: theme.text }]}>
            {t("login.googleStart")}
          </Text>
        </Pressable>

        {/* ⚠️ 개발단계 이메일 로그인(유지) = 사장님 실제 메일로 admin 인식. 구글 OAuth 웹 400 우회. */}
        <View style={styles.emailLoginBox}>
          <Text style={[styles.emailLoginLabel, { color: theme.textTertiary }]}>
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
              accessibilityRole="button"
              accessibilityLabel={t("login.emailLoginBtn")}
              accessibilityState={{
                disabled: emailLoading || !emailInput.trim(),
              }}
            >
              <Text style={styles.emailLoginBtnText}>
                {t("login.emailLoginBtn")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// 바깥 껍데기 = 신호 수신 + visible 관리 + SnapSheet. 폼(LoginSheetForm)은 visible 일 때만 마운트(위 주석 참조).
export default function LoginSheet() {
  const { loginRequestedAt, clearLoginRequest } = useMapToggle();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // loginRequestedAt 신호 수신 → 팝업 열기(AI의견·전문가 오버레이와 동일 패턴). 소비 후 clear(다음 요청 재실행 보장).
  useEffect(() => {
    if (!loginRequestedAt) return;
    setVisible(true);
    clearLoginRequest();
  }, [loginRequestedAt, clearLoginRequest]);

  return (
    <SnapSheet
      visible={visible}
      onClose={() => setVisible(false)}
      title={t("login.title")}
      fullRatio={0.92}
      initialSnap="full"
      renderTitleAccessory={(progress) => (
        <ResizableBrand progress={progress} />
      )}
    >
      <LoginSheetForm onClose={() => setVisible(false)} />
    </SnapSheet>
  );
}
