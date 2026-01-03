import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, Brand } from "@/constants/theme";

interface HeaderTitleProps {
  title: string;
  showIcon?: boolean;
}

export function HeaderTitle({ title, showIcon = true }: HeaderTitleProps) {
  return (
    <View style={styles.container}>
      {showIcon && (
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.icon}
          resizeMode="contain"
        />
      )}
      <ThemedText style={styles.title}>{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  icon: {
    width: 28,
    height: 28,
    marginRight: Spacing.sm,
    borderRadius: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.25,
  },
});
