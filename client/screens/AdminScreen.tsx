import React from "react";
import { View, StyleSheet, useColorScheme, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { WebView } from "react-native-webview";

import { Colors, Spacing, Brand } from "@/constants/theme";
import ThemedText from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";

export default function AdminScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();

  const adminUrl = `${getApiUrl()}/admin`;

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={{ paddingTop: headerHeight + Spacing.lg, paddingHorizontal: Spacing.lg }}>
          <ThemedText style={styles.title}>Admin Dashboard</ThemedText>
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
      <WebView
        source={{ uri: adminUrl }}
        style={{ 
          flex: 1, 
          marginTop: headerHeight,
          marginBottom: tabBarHeight,
        }}
        startInLoadingState={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  link: {
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
