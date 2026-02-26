import React from "react";
import * as LucideIcons from "lucide-react-native";
import type { LucideProps } from "lucide-react-native";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";

// Utility to convert kebab-case (e.g. "map-pin") to PascalCase ("MapPin")
const toPascalCase = (str: string) =>
  str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

export interface IconProps extends Omit<LucideProps, "color"> {
  name: string; // Supports both PascalCase ('MapPin') and kebab-case ('map-pin')
  color?: string;
  size?: number;
}

export function Icon({ name, color, size = 24, ...rest }: IconProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const iconName =
    name.includes("-") || name === name.toLowerCase()
      ? toPascalCase(name)
      : name;
  const LucideIcon = (LucideIcons as any)[iconName];

  if (!LucideIcon) {
    console.warn(`[Icon] Missing icon: ${name} (resolved to ${iconName})`);
    return null;
  }

  const iconColor = color || theme.text;
  return <LucideIcon color={iconColor} size={size} {...rest} />;
}

export default Icon;
