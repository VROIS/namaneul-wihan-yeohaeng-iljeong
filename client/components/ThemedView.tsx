import { View, type ViewProps, useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];

  const backgroundColor =
    isDark && darkColor
      ? darkColor
      : !isDark && lightColor
        ? lightColor
        : theme.backgroundRoot;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}

export default ThemedView;
