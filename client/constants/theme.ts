import { Platform } from "react-native";

export const Brand = {
  primary: "#4285F4",
  secondary: "#1A73E8",
  gradient: ["#4285F4", "#1A73E8"],
  luxuryGold: "#F59E0B",
  comfortBlue: "#3B82F6",
};

export const Colors = {
  light: {
    text: "#111827",
    textSecondary: "#6B7280",
    textTertiary: "#9CA3AF",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: Brand.primary,
    link: Brand.primary,
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#F9FAFB",
    backgroundSecondary: "#F3F4F6",
    backgroundTertiary: "#E5E7EB",
    border: "#E5E7EB",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#3B82F6",
  },
  dark: {
    text: "#F9FAFB",
    textSecondary: "#D1D5DB",
    textTertiary: "#9CA3AF",
    buttonText: "#FFFFFF",
    tabIconDefault: "#6B7280",
    tabIconSelected: "#60A5FA",
    link: "#60A5FA",
    backgroundRoot: "#111827",
    backgroundDefault: "#1F2937",
    backgroundSecondary: "#374151",
    backgroundTertiary: "#4B5563",
    border: "#374151",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171",
    info: "#60A5FA",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  inputHeight: 48,
  buttonHeight: 48,
  fabSize: 56,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  full: 9999,
};

export const Typography = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
    letterSpacing: -0.5,
  },
  h1: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700" as const,
    letterSpacing: -0.25,
  },
  h2: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  h3: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500" as const,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  fab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  elevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// Vibe Score 색상 (10점 만점 기준)
export function getVibeScoreColor(score: number): string {
  if (score >= 8.0) return "#8B5CF6"; // 보라색 - Excellent
  if (score >= 5.0) return "#F97316"; // 주황색 - Good
  return "#6B7280"; // 회색 - Average
}

// Vibe Score 그라데이션 (10점 만점 기준)
export function getVibeScoreGradient(score: number): string[] {
  if (score >= 8.0) return ["#8B5CF6", "#A78BFA"]; // 보라색 그라데이션 - Excellent
  if (score >= 5.0) return ["#F97316", "#FB923C"]; // 주황색 그라데이션 - Good
  return ["#6B7280", "#9CA3AF"]; // 회색 그라데이션 - Average
}

// Vibe Score 레벨 (10점 만점 기준)
export function getVibeScoreLevel(score: number): "excellent" | "good" | "average" {
  if (score >= 8.0) return "excellent";
  if (score >= 5.0) return "good";
  return "average";
}

// Vibe Score 레벨 라벨
export function getVibeScoreLabel(score: number): string {
  if (score >= 8.0) return "Excellent";
  if (score >= 5.0) return "Good";
  return "Average";
}

// Vibe Score 레벨 라벨 (한국어)
export function getVibeScoreLabelKo(score: number): string {
  if (score >= 8.0) return "우수";
  if (score >= 5.0) return "양호";
  return "보통";
}

export function normalizeScoreForDisplay(rawScore: number, maxScore: number = 30): number {
  return Math.min(10, (rawScore / maxScore) * 10);
}

export function getPersonaColor(persona: "luxury" | "comfort"): string {
  return persona === "luxury" ? Brand.luxuryGold : Brand.comfortBlue;
}
