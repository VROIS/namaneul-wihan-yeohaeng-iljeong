// ⚠️ 사장님 SSOT 2026-07-25(세션2) = 로그인 = 화면 상단에 뜨는 센터 모달(RN Modal). '내손앱'처럼 인앱 팝업이되,
//   바텀시트(밑에서)는 키보드(밑에서)와 구조적 겹침 → 상단 모달로 교체(키보드 겹침 원천 차단, 조사: 범용앱+NN/G+Material).
//   기존 LoginScreen(보관)의 폼을 그대로 담되(§16 재사용), 화면이동 대신 팝업 닫기(onDone)로 동작.
//   상단 = 이미지 로고(png=iOS 미표시 버그) 제거 + "Tripis 트리피스" 글자 유지 + 슬로건 축소(넘침 방지).
//   곁가지 제외(사장님 "메인앱만") = WhatsApp·BTS·언어선택 미포함. 애플 = 별도 세션.
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
import { styles } from "./styles";

// ⚠️ 폼 본문(useLogin 포함) = Modal 자식 = visible=false면 언마운트 → 재열림 시 useLogin state(생년월일·이메일·에러) 소멸 = 항상 깨끗(개인정보·상태 잔류 방지).
//   닫혀있을 땐 useLogin의 카카오 웹 code useEffect·useGoogleAuthRequest도 안 돎 = LoginScreen(보관)과 카카오 code 이중소비 위험 제거.
function LoginSheetForm({ onClose }: { onClose: () => void }) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  // 로그인 성공 = 팝업만 닫음(배경 화면 유지, 화면 이동 X). 인증 반영은 saveAuth 가 자동으로 알림(§16).
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

  // ⚠️ 사장님 SSOT 2026-07-26 = "생년월일 입력 → 연령대 표시된 상태" 여야 이메일 입력 가능.
  //   연령대 배지(아래 isAdult && ageGroup)와 같은 조건 1벌 = 화면과 입력 제한이 항상 일치.
  const canUseEmail = isAdult && !!ageGroup;
  const busy = oauthLoading || emailLoading;
  const emailBtnDisabled = busy || !canUseEmail || !emailInput.trim();
  // ⚠️ 사장님 SSOT 2026-07-27(AOS 실기기) = 로그인 요청~응답 약 1초 동안 화면이 그대로라
  //   "버그인가? 내가 잘못 눌렀나?" 하고 다시 누르게 됨. **진행 중임을 반드시 보여준다.**

  return (
    <ScrollView
      contentContainerStyle={styles.loginCardBody}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── 브랜드(이미지 로고 제거, Tripis 글자 + 슬로건 축소) ── 상단존 최소화(사장님 확정). */}
      {/* ⚠️ 사장님 SSOT 2026-07-25 = 슬로건 제거 = 상단존 최소화 → 하단 인증(카카오/구글/이메일)이 한눈에 보이게. Tripis 글자만 유지. */}
      <View style={styles.loginBrand}>
        <View style={styles.loginBrandTitleRow}>
          <Text style={styles.loginBrandTitle}>Tripis</Text>
          <Text style={styles.tripisTitleKo}>트리피스</Text>
        </View>
      </View>

      {/* ── 생년월일 (소셜 로그인 필수) ── 사장님 SSOT = 팝업 노출 = 로고글자+생년월일+구글+카톡+이메일. */}
      <View style={styles.formSection}>
        {/* ⚠️ 사장님 SSOT 2026-07-25 = 힌트("실제 생년월일…") 설명문 제거(§23) + "(필수 입력)"을 라벨 같은 줄에 작게 = 사용자가 필수임을 즉시 인식(설명 아닌 마커). 행(baseline)+간격 style = RN 크로스플랫폼 정석(공백 하드코딩 아님). */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t("login.birthDate")}
          </Text>
          <Text style={[styles.labelRequired, { color: theme.textTertiary }]}>
            {t("login.required")}
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
              //   = 생년월일 우회 원천 차단. 조건 = 위 연령대 배지가 뜨는 조건과 동일(isAdult && ageGroup).
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

// 바깥 껍데기 = 신호 수신 + visible 관리 + 상단 고정 센터 모달(RN Modal).
//   상단 정렬(flex-start) + dim(여정 흐리게=맥락 유지). 카드가 화면 위쪽(키보드 위)에 고정 = 키보드(하단)와 안 겹침 → KAV 불필요.
export default function LoginSheet() {
  const { loginRequestedAt, clearLoginRequest } = useMapToggle();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [visible, setVisible] = useState(() => {
    // ⚠️ 수정금지(승인필요) — 카카오 웹 로그인 복귀 버그 수정(2026-07-28 세션7, 실측 확정).
    //   카카오는 팝업이 아니라 전체 페이지 리다이렉트라, 돌아올 때 앱이 통째로 새로고침되며
    //   이 시트가 "닫힌 초기상태"로 리셋된다. 시트가 닫혀 있으면 안의 useLogin(카카오 code 처리)이
    //   아예 마운트되지 않아 처리가 방치되고, 사용자가 다시 열어야만 그제서야 처리가 시작돼
    //   "로그인 중…"에 갇힌 것처럼 보였다(Chrome DevTools 로 직접 재현·확정).
    //   → 돌아온 시점(주소에 카카오 code 있음)이면 처음부터 열어서 즉시 처리가 시작되게 한다.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).has("code");
    }
    return false;
  });

  // loginRequestedAt 신호 수신 → 팝업 열기(AI의견·전문가 오버레이와 동일 패턴). 소비 후 clear(다음 요청 재실행 보장).
  useEffect(() => {
    if (!loginRequestedAt) return;
    setVisible(true);
    clearLoginRequest();
  }, [loginRequestedAt, clearLoginRequest]);

  // 닫기(성공/취소 공통) = 팝업만 닫음. 인증 반영은 saveAuth 가 자동으로 알림(§0 두 벌 금지, 2026-07-27).
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
