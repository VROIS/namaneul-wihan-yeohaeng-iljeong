import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  useColorScheme,
  Platform,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useNavigation } from "@react-navigation/native";
import Icon from "@/components/Icon";

import { Colors, Spacing, Brand } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";
import { saveAuth } from "@/lib/auth"; // ⚠️ 관리자 로그인 성공 시 세션 저장 → 전문가 탭이 관리자 인식 = 문의답변 프리패스(2026-07-13)

export default function AdminScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const adminUrl = `${getApiUrl()}/admin`;

  // ⚠️ 수정금지(승인필요) 2026-07-13 = 비번을 서버(/api/admin/login)에서 검증(§19 클라 비번상수 폐기) → 성공 시 관리자 세션 저장.
  //   이래야 전문가 탭이 관리자로 인식해 문의답변 프리패스 + 대시보드 열림.
  const handleLogin = useCallback(async () => {
    if (!password || isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.token) {
        await saveAuth({
          id: data.user.id,
          email: data.user.email,
          displayName: data.user.displayName,
          name: data.user.displayName,
          provider: (data.user.provider || "google") as "kakao" | "google" | "whatsapp",
          language: data.user.preferredLanguage || "ko",
          birthDate: data.user.birthDate || "1990-01-01",
          isPaid: data.user.isPaid,
          token: data.token,
        });
        setIsAuthenticated(true);
        setPassword("");
      } else if (res.status === 401) {
        setError("비밀번호가 틀렸습니다");
        setPassword("");
      } else {
        // 리뷰 2026-07-13 = 500(관리자계정 없음 등)을 "비번 틀림"으로 오표시하던 것 분리 = 원인 오인 방지.
        setError("관리자 로그인 오류입니다 (서버 설정 확인)");
        setPassword("");
      }
    } catch {
      setError("서버 연결 실패");
      setPassword("");
    } finally {
      setIsLoading(false);
    }
  }, [password, isLoading]);

  const handleClose = useCallback(() => {
    setIsAuthenticated(false);
    setPassword("");
    setError("");
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  // 비밀번호 인증 화면
  if (!isAuthenticated) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        {/* 상단 닫기 버튼 */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="x" size={24} color={theme.text} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>관리자 인증</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.authContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.authBox}>
            <Icon name="shield" size={48} color={Brand.primary} />
            <ThemedText style={[styles.authTitle, { color: theme.text }]}>
              관리자 대시보드
            </ThemedText>
            <ThemedText
              style={[styles.authSubtitle, { color: theme.textSecondary }]}
            >
              접근하려면 비밀번호를 입력하세요
            </ThemedText>

            <TextInput
              style={[
                styles.passwordInput,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: error ? Colors.light.danger : theme.border,
                },
              ]}
              placeholder="비밀번호 입력"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError("");
              }}
              onSubmitEditing={handleLogin}
              autoFocus
            />

            {error ? (
              <ThemedText
                style={[styles.errorText, { color: Colors.light.danger }]}
              >
                {error}
              </ThemedText>
            ) : null}

            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: Brand.primary, opacity: isLoading ? 0.6 : 1 }]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.loginButtonText}>로그인</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // 인증 완료 후: 관리자 대시보드 (웹에서는 iframe 사용)
  if (Platform.OS === "web") {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        {/* 상단 닫기 버튼 */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <ThemedText style={[styles.headerTitle, { color: "#FFFFFF" }]}>
            관리자 대시보드
          </ThemedText>
          <View style={{ width: 40 }} />
        </View>

        {/* iframe으로 관리자 대시보드 직접 표시 */}
        <iframe
          src={adminUrl}
          style={
            {
              flex: 1,
              width: "100%",
              height: "100%",
              border: "none",
            } as any
          }
          title="Admin Dashboard"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* 상단 닫기 버튼 */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="x" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <ThemedText style={[styles.headerTitle, { color: "#FFFFFF" }]}>
          관리자 대시보드
        </ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Brand.primary} />
        </View>
      )}

      <WebView
        source={{ uri: adminUrl }}
        style={{ flex: 1 }}
        startInLoadingState={true}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
      />
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Brand.primary,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  authContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  authBox: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 16,
  },
  authTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12,
  },
  authSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  passwordInput: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: 13,
    marginTop: -8,
  },
  loginButton: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  link: {
    fontSize: 14,
    textDecorationLine: "underline",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
  },
});
