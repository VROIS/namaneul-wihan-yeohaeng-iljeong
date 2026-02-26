import React, { ReactNode } from "react";
import {
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  useColorScheme,
  ActivityIndicator,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { BorderRadius, Spacing, Colors, Typography } from "@/constants/theme";
import Icon from "@/components/Icon";

interface ButtonProps {
  onPress?: () => void;
  children?: ReactNode;
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  icon?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  fullWidth?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  onPress,
  children,
  label,
  variant = "primary",
  size = "medium",
  icon,
  loading = false,
  style,
  disabled = false,
  fullWidth = true,
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const scale = useSharedValue(1);

  const getVariantStyles = () => {
    switch (variant) {
      case "secondary":
        return {
          bg: theme.backgroundSecondary,
          text: theme.text,
          border: "transparent",
        };
      case "outline":
        return { bg: "transparent", text: theme.text, border: theme.border };
      case "ghost":
        return {
          bg: "transparent",
          text: theme.textSecondary,
          border: "transparent",
        };
      case "danger":
        return { bg: theme.danger, text: "#FFFFFF", border: "transparent" };
      case "primary":
      default:
        return {
          bg: theme.link,
          text: theme.buttonText,
          border: "transparent",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "small":
        return {
          height: 36,
          px: Spacing.md,
          textType: "small" as const,
          iconSize: 16,
        };
      case "large":
        return {
          height: 56,
          px: Spacing.xl,
          textType: "h3" as const,
          iconSize: 24,
        };
      case "medium":
      default:
        return {
          height: Spacing.buttonHeight,
          px: Spacing.lg,
          textType: "body" as const,
          iconSize: 20,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();
  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!isDisabled) scale.value = withSpring(0.96, springConfig);
  };

  const handlePressOut = () => {
    if (!isDisabled) scale.value = withSpring(1, springConfig);
  };

  return (
    <AnimatedPressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        styles.button,
        {
          backgroundColor: variantStyles.bg,
          borderColor: variantStyles.border,
          borderWidth: variant === "outline" ? 1 : 0,
          height: sizeStyles.height,
          paddingHorizontal: sizeStyles.px,
          opacity: isDisabled ? 0.6 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.text} />
      ) : (
        <View style={styles.contentRow}>
          {icon && (
            <Icon
              name={icon}
              size={sizeStyles.iconSize}
              color={variantStyles.text}
            />
          )}
          {(label || children) && (
            <ThemedText
              type={sizeStyles.textType}
              style={[
                styles.buttonText,
                {
                  color: variantStyles.text,
                  marginLeft: icon ? Spacing.sm : 0,
                },
              ]}
            >
              {label || children}
            </ThemedText>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: BorderRadius.xl, // Slightly more round according to modern standard
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontWeight: "600",
  },
});

export default Button;
