import React from "react";
import { View, StyleSheet, Text, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Typography, Spacing, Brand, Colors } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={[styles.placeholder, { marginTop: insets.top }]}>
        <View style={[styles.iconContainer, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="map-pin" size={48} color={Brand.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          지도 기능 준비 중
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          곧 여행지와 경로를 지도에서 확인할 수 있어요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    textAlign: "center",
  },
});
