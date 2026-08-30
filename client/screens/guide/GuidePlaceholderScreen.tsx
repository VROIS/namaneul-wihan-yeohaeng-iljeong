// ⚠️ 수정금지(승인필요) — 가이드 미니앱 임시 화면 (2026-07-19 §12 1단계)
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/Icon";

export default function GuidePlaceholderScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Icon name="camera" size={48} color="#fff" />
      <Text style={styles.title}>가이드</Text>
      <Text style={styles.subtitle}>준비 중 (3단계에서 카메라 모듈 이식)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
});
