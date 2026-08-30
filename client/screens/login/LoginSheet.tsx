// ⚠️ 사장님 SSOT 2026-07-31 = **순서 = 생년월일 → 구글 → 카톡 → 애플(아이폰만) → 메일.**
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Modal,
  ActivityIndicator,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import Icon from "@/components/Icon";
import { Colors, Brand } from "@/constants/theme";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { useLogin } from "./hooks/useLogin";
import { BIRTHDATE_REQUIRED } from "@shared/birthdate-policy";
import { styles } from "./styles";

function LoginSheetForm({ onClose }: { onClose: () => void }) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

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
    handleApplePress,
    isAppleAvailable,
    emailInput,
    setEmailInput,
    emailLoading,
    handleEmailLogin,
  } = login;

  // ⚠️ 수정금지(승인필요) 2026-08-24 사장님 승인 = 이메일 입력칸 사용 가능 조건 = 생년월일 정책 토글 1벌.
  const canUseEmail = !BIRTHDATE_REQUIRED || (isAdult && !!ageGroup);
  const busy = oauthLoading || emailLoading;
  const emailBtnDisabled = busy || !canUseEmail || !emailInput.trim();
  // ⚠️ 사장님 SSOT 2026-07-27(AOS 실기기) = 로그인 요청~응답 약 1초 동안 화면이 그대로라

  return (
    <ScrollView
      contentContainerStyle={styles.loginCardBody}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── 브랜드(이미지 로고 제거, Tripis 글자 + 슬로건 축소) ── 상단존 최소화(사장님 확정). */}
      {/* ⚠️ 사장님 SSOT 2026-07-25 = 슬로건 제거 = 상단존 최소화 → 하단 인증(카카오/구글/이메일)이 한눈에 보이게. Tripis 글자만 유지. */}
      {/* ⚠️ 수정금지(승인필요) 2026-08-15 사장님 승인 = 한글 발음표기("트리피스") 삭제 = 언어 무관 고정 워드마크(Tripis)만 유지, 번역 대상 아님. */}
      <View style={styles.loginBrand}>
        <View style={styles.loginBrandTitleRow}>
          <Text style={styles.loginBrandTitle}>Tripis</Text>
        </View>
      </View>

      {/* ── 생년월일 ── 사장님 SSOT = 팝업 노출 = 로고글자+생년월일+구글+카톡+이메일.
          필수 여부 = shared/birthdate-policy 토글(2026-08-24 = 'optional'). */}
      <View style={styles.formSection}>
        {/* ⚠️ 사장님 SSOT 2026-07-25 = 힌트("실제 생년월일…") 설명문 제거(§23) + "(필수 입력)"을 라벨 같은 줄에 작게 = 사용자가 필수임을 즉시 인식(설명 아닌 마커). 행(baseline)+간격 style = RN 크로스플랫폼 정석(공백 하드코딩 아님). */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t("login.birthDate")}
          </Text>
          {/* ⚠️ 2026-08-24 사장님 승인 = 필수/선택 마커 1벌 = 정책 토글(shared/birthdate-policy) 표기.
              선택 정책 = "(선택)" 마커만. 설명문 금지(§23) = 선택이면 조용히 선택. */}
          <Text style={[styles.labelRequired, { color: theme.textTertiary }]}>
            {t(BIRTHDATE_REQUIRED ? "login.required" : "login.optional")}
          </Text>
        </View>
        <View style={styles.dateInputRow}>
          <View
            style={[
              styles.dateInputBox,
              styles.sheetDateBox,
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
              styles.sheetDateBox,
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
              styles.sheetDateBox,
              styles.sheetYearBox,
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

      {/* ⚠️ 사장님 SSOT 2026-07-27(AOS 실기기) = 로그인 요청~응답 약 1초 동안 화면이 그대로라
            "버그인가? 잘못 눌렀나" 하고 다시 누르는 오조작 유발 → **진행 중임을 한 줄로 보여준다.**
            옛 덮개(오버레이) 방식 완전삭제 §19 = 배경색을 직접 칠하다 보니 밝은 모드에서 글자가 안 보이고,
            카드 높이까지 흔드는 부작용이 남. 카드 안 보통 한 줄이면 그런 문제가 아예 없다. */}
      {busy && (
        <View style={styles.loginBusyRow}>
          <ActivityIndicator size="small" color={theme.link} />
          <Text style={[styles.loginBusyText, { color: theme.text }]}>
            {t("login.signingIn")}
          </Text>
        </View>
      )}

      {/* ── 소셜 로그인 ──
          ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **순서 = 생년월일 → 구글 → 카톡 → 애플 → 메일.**
            옛 순서(카카오가 구글보다 위)는 이 파일 맨 위 설명과도 **반대**여서 어느 쪽이 맞는지
            알 수 없는 상태였다 = 삭제 §19. 아미봉 인증창과 **같은 순서 1벌**로 맞춘다. */}
      <View style={styles.socialSection}>
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
          accessibilityLabel={t("login.kakaoStart")}
          accessibilityState={{ disabled: oauthLoading }}
        >
          <View style={styles.kakaoIcon}>
            <Text style={styles.kakaoIconText}>K</Text>
          </View>
          <Text style={styles.kakaoButtonText}>{t("login.kakaoStart")}</Text>
        </Pressable>

        {/* ⚠️ 수정금지(승인필요) 2026-07-31 사장님 SSOT = **애플 = 아이폰에서만 보인다.**
            안드로이드에는 애플 로그인이 아예 없으므로(애플이 iOS 에서만 제공) 버튼을 감춘다.
            아미봉 인증창(BTSLandingScreen)이 쓰는 것과 **똑같은 판단 1벌** = 두 창이 항상 같이 움직인다. */}
        {isAppleAvailable && (
          <Pressable
            style={({ pressed }) => [
              styles.socialButton,
              styles.appleButton,
              pressed && styles.buttonPressed,
              oauthLoading && styles.buttonDisabled,
            ]}
            onPress={handleApplePress}
            disabled={oauthLoading}
            accessibilityRole="button"
            accessibilityLabel={t("login.appleStart")}
            accessibilityState={{ disabled: oauthLoading }}
          >
            <View style={styles.appleIcon}>
              <Text style={styles.appleIconText}></Text>
            </View>
            <Text style={styles.appleButtonText}>{t("login.appleStart")}</Text>
          </Pressable>
        )}

        {/* ⚠️ 이메일 로그인 = 구글(지메일)로 로그인 못 하는 사용자가 다른 이메일로 시작하는 정식 경로. 설명 라벨 없이 입력창만 = 사용자가 순서대로 진행(§23 설명형 텍스트 금지, 사장님 SSOT 2026-07-25). */}
        <View style={styles.emailLoginBox}>
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
              // ⚠️ 사장님 SSOT 2026-07-26 = 생년월일(연령대 표시)이 먼저. 그 전엔 이메일 입력 자체를 막음
              editable={!busy && canUseEmail}
              returnKeyType="done"
              onSubmitEditing={handleEmailLogin}
            />
            <Pressable
              style={({ pressed }) => [
                styles.emailLoginBtn,
                {
                  backgroundColor: Brand.primary,
                  opacity: emailBtnDisabled ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
              onPress={handleEmailLogin}
              disabled={emailBtnDisabled}
              accessibilityRole="button"
              accessibilityLabel={t("login.emailLoginBtn")}
              accessibilityState={{ disabled: emailBtnDisabled }}
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

export default function LoginSheet() {
  const { loginRequestedAt, clearLoginRequest } = useMapToggle();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [visible, setVisible] = useState(() => {
    // ⚠️ 수정금지(승인필요) — 카카오 웹 로그인 복귀 버그 수정(2026-07-28 세션7, 실측 확정).
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).has("code");
    }
    return false;
  });

  useEffect(() => {
    if (!loginRequestedAt) return;
    setVisible(true);
    clearLoginRequest();
  }, [loginRequestedAt, clearLoginRequest]);

  const handleClose = () => setVisible(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* ⚠️ 사장님 SSOT 2026-07-25 = 상단 고정 = 카드를 화면 위쪽(maxHeight 60%)에 둠 → 키보드(하단 ~40%)와 물리적으로 안 겹침.
          슬로건·힌트 제거 + 버튼여백 축소로 콘텐츠 슬림화 = 카카오/구글/이메일까지 스크롤 없이 한눈에(사장님 SSOT). KAV 불필요(카드가 키보드 위). */}
      <View style={styles.loginOverlay}>
        {/* dim 배경 탭 = 닫기. 뒤 여정 흐리게 보임 = 맥락 유지. */}
        <Pressable style={styles.loginBackdrop} onPress={handleClose} />
        {/* 카드 = 화면 상단(safe-area 아래). 위 절반 고정 = 키보드와 물리적 분리. */}
        <View
          style={[
            styles.loginCard,
            {
              backgroundColor: theme.backgroundRoot,
              marginTop: insets.top + 12,
            },
          ]}
        >
          {/* ⚠️ 사장님 SSOT 2026-07-25 = "로그인" 제목 텍스트 삭제 = 우리 요소(Tripis)를 카드 최상단부터 시작 → 상단 여백 회수 → 삼성폰 키보드 위로 이격(§23 = 뭐하는 창인지 요소로 자명). 닫기 X만 절대위치(세로공간 0). */}
          <Pressable
            onPress={handleClose}
            style={styles.loginCloseBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Icon name="x" size={24} color={theme.text} />
          </Pressable>
          <LoginSheetForm onClose={handleClose} />
        </View>
      </View>
    </Modal>
  );
}
