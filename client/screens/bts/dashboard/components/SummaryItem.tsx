// BTSDashboardScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text } from "react-native";
import { styles } from "../styles";

// ─── Summary Item ───
export default function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}
