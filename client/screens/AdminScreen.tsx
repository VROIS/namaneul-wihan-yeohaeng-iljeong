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
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Colors, Spacing, Brand } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";

const ADMIN_PASSWORD = "nubi2026";

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

  const handleLogin = useCallback(() => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setError("");
      setPassword("");
    } else {
      setError("비밀번호가 틀렸습니다");
      setPassword("");
    }
  }, [password]);

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
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        {/* 상단 닫기 버튼 */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={24} color={theme.text} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>관리자 인증</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.authContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.authBox}>
            <Feather name="shield" size={48} color={Brand.primary} />
            <ThemedText style={[styles.authTitle, { color: theme.text }]}>
              관리자 대시보드
            </ThemedText>
            <ThemedText style={[styles.authSubtitle, { color: theme.textSecondary }]}>
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
              <ThemedText style={[styles.errorText, { color: Colors.light.danger }]}>
                {error}
              </ThemedText>
            ) : null}

            <TouchableOpacity
              style={[styles.loginButton, { backgroundColor: Brand.primary }]}
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.loginButtonText}>로그인</ThemedText>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // 인증 완료 후: 관리자 대시보드
  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        {/* 상단 닫기 버튼 */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="x" size={24} color={theme.text} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>관리자 대시보드</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.lg }}>
          <ThemedText style={styles.subtitle}>
            웹에서는 새 탭에서 열어주세요
          </ThemedText>
          <ThemedText
            style={[styles.link, { color: Brand.primary }]}
            onPress={() => window.open(adminUrl, "_blank")}
          >
            {adminUrl}
          </ThemedText>
        </View>
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
          <Feather name="x" size={24} color="#FFFFFF" />
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
