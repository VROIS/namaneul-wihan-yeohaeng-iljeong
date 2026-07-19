/**
 * AuthInputZone — 공유 로그인 컴포넌트 (하단 55%)
 * BTS앱과 메인앱 모두 사용 가능 (theme prop으로 전환)
 *
 * BTS앱: 아리랑 레드 강조, 한지 화이트 배경
 * 메인앱: 제미나이 블루 강조, 화이트 배경
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { ArirangColors } from "@/constants/bts-theme";
import { Brand } from "@/constants/theme";

// ⚠️ 수정금지(승인필요) — 공유 인증 컴포넌트, BTS+메인앱 공용
type AuthTheme = "bts" | "default";

interface AuthInputZoneProps {
  theme?: AuthTheme;
  onAuthComplete?: (user: any) => void;
  onBirthDateChange?: (date: string) => void;
}

// 테마별 색상 매핑
const themeColors = {
  bts: {
    accent: ArirangColors.red, // #C73E2D
    accentLight: ArirangColors.redWash,
    background: "#FAF8F5", // 한지 화이트
    text: "#1A1A1A",
    textSecondary: "#6B7280",
    divider: "rgba(199, 62, 45, 0.1)",
  },
  default: {
    accent: Brand.primary, // #4285F4
    accentLight: "rgba(66, 133, 244, 0.08)",
    background: "#FFFFFF",
    text: "#111827",
    textSecondary: "#6B7280",
    divider: "rgba(0, 0, 0, 0.06)",
  },
};

export function AuthInputZone({
  theme = "bts",
  onAuthComplete,
  onBirthDateChange,
}: AuthInputZoneProps) {
  const c = themeColors[theme];
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);

  // 생년월일 입력 포맷 (DD/MM/YYYY)
  const handleBirthDateInput = (text: string) => {
    // 숫자만 추출
    const digits = text.replace(/\D/g, "");
    let formatted = "";
    if (digits.length > 0) formatted = digits.substring(0, 2);
    if (digits.length > 2) formatted += "/" + digits.substring(2, 4);
    if (digits.length > 4) formatted += "/" + digits.substring(4, 8);
    setBirthDate(formatted);
    onBirthDateChange?.(formatted);
  };

  // OAuth 로그인 핸들러 (인앱 처리)
  const handleOAuth = async (provider: string) => {
    setLoading(true);
    try {
      // TODO: 서버 OAuth 엔드포인트 호출
      // const response = await fetch(`/api/auth/${provider}`);
      console.log(`OAuth 시작: ${provider}`);
    } catch (e) {
      console.error("OAuth 오류:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.inner}>
        {/* OAuth 버튼 그룹 */}
        <View style={styles.buttonGroup}>
          {/* 구글 */}
          <TouchableOpacity
            style={[styles.oauthButton, styles.googleButton]}
            onPress={() => handleOAuth("google")}
            activeOpacity={0.8}
          >
            <Text style={[styles.oauthIcon, { fontSize: 18 }]}>G</Text>
            <Text style={[styles.oauthText, { color: "#1A1A1A" }]}>
              Google로 시작
            </Text>
          </TouchableOpacity>

          {/* 카카오 */}
          <TouchableOpacity
            style={[styles.oauthButton, { backgroundColor: "#FEE500" }]}
            onPress={() => handleOAuth("kakao")}
            activeOpacity={0.8}
          >
            <Text style={[styles.oauthIcon, { fontSize: 16 }]}>K</Text>
            <Text style={[styles.oauthText, { color: "#3C1E1E" }]}>
              Kakao로 시작
            </Text>
          </TouchableOpacity>

          {/* Apple (iOS만) */}
          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={[styles.oauthButton, { backgroundColor: "#000000" }]}
              onPress={() => handleOAuth("apple")}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.oauthIcon, { color: "#FFFFFF", fontSize: 18 }]}
              ></Text>
              <Text style={[styles.oauthText, { color: "#FFFFFF" }]}>
                Apple로 시작
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 구분선 */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
          <Text style={[styles.dividerText, { color: c.textSecondary }]}>
            생년월일 입력
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: c.divider }]} />
        </View>

        {/* 생년월일 입력 — 캐릭터 매칭용 필수 */}
        <View style={styles.birthDateRow}>
          <TextInput
            style={[
              styles.birthDateInput,
              {
                borderColor: birthDate.length === 10 ? c.accent : c.divider,
                color: c.text,
              },
            ]}
            placeholder="DD / MM / YYYY"
            placeholderTextColor={c.textSecondary}
            value={birthDate}
            onChangeText={handleBirthDateInput}
            keyboardType="number-pad"
            maxLength={10}
          />
          {birthDate.length === 10 && (
            <Text style={[styles.birthDateCheck, { color: c.accent }]}>
              {/* Lucide check-circle 대체 */}
              OK
            </Text>
          )}
        </View>

        {/* 시작 버튼 */}
        <TouchableOpacity
          style={[
            styles.startButton,
            {
              backgroundColor: c.accent,
              opacity: birthDate.length === 10 ? 1 : 0.4,
            },
          ]}
          disabled={birthDate.length !== 10 || loading}
          onPress={() => onAuthComplete?.({ birthDate })}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startButtonText}>시작하기</Text>
          )}
        </TouchableOpacity>

        {/* 동의 문구 */}
        <Text style={[styles.disclaimer, { color: c.textSecondary }]}>
          시작하면 위치정보 및 AI 콘텐츠 사용에 동의합니다
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  inner: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  buttonGroup: {
    gap: 12,
  },
  oauthButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 14,
    gap: 10,
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  oauthIcon: {
    fontWeight: "700",
  },
  oauthText: {
    fontSize: 16,
    fontFamily: "Pretendard-Medium",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Pretendard-Medium",
  },
  birthDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  birthDateInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: "Pretendard-Medium",
    textAlign: "center",
    letterSpacing: 2,
  },
  birthDateCheck: {
    fontSize: 14,
    fontFamily: "Pretendard-Bold",
  },
  startButton: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Pretendard-SemiBold",
  },
  disclaimer: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
    fontFamily: "Pretendard-Regular",
  },
});
