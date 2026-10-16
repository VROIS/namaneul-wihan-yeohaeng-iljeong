export const ArirangColors = {
  red: "#C73E2D",
  redDeep: "#9B2B1F",
  redLight: "#E85D4A",
  redWash: "rgba(199, 62, 45, 0.08)",

  purple: "#6C2DC7",
  purpleSoft: "#9B59B6",
  lavender: "#D8B4FE",

  taegeukBlue: "#0047A0", // 한국 유산 포인트
  armyGold: "#D4AF37", // 인증 뱃지, 프리미엄
  heritageBlack: "#1A1A1A", // 로고, 제목

  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;

export const BTSThemeColors = {
  light: {
    background: "#FAF8F5",
    surface: "#FFFFFF",
    elevated: "#F5F0EB",
    glass: "rgba(199, 62, 45, 0.04)",
    divider: "rgba(0, 0, 0, 0.06)",
    textPrimary: "#1A1A1A",
    textSecondary: "#6B7280",
    textDisabled: "#C0B8C8",
    tabIconActive: ArirangColors.red,
    tabIconInactive: "#9CA3AF",
    cardBorder: "rgba(199, 62, 45, 0.08)",
    cardShadow: "rgba(0, 0, 0, 0.06)",
  },
  dark: {
    background: "#0A0810",
    surface: "#161222",
    elevated: "#1E1830",
    glass: "rgba(108, 45, 199, 0.06)",
    divider: "rgba(255, 255, 255, 0.08)",
    textPrimary: "#F5F0EB",
    textSecondary: "#9B95A8",
    textDisabled: "#4A4458",
    tabIconActive: ArirangColors.red,
    tabIconInactive: "#6B7280",
    cardBorder: "rgba(199, 62, 45, 0.12)",
    cardShadow: "rgba(0, 0, 0, 0.25)",
  },
} as const;

// ⚠️ 수정금지(승인필요) — BTS 미니앱 직접 참조 색상 (BTSColors.neonPurple 형태)
export const BTSColors = {
  ...BTSThemeColors,
  neonPurple: "#A855F7",
  deepViolet: "#1E1040",
  spaceBlack: "#05050A",
  glassBorder: "rgba(255,255,255,0.1)",
  glassBg: "rgba(255,255,255,0.05)",
  backgroundCard: "rgba(255,255,255,0.06)",
  textPrimary: "#F5F0EB",
  textSecondary: "#9B95A8",
  textTertiary: "#6B6280",
  textMuted: "#4A4458",
  purpleGlowLight: "rgba(168,85,247,0.15)",
  danger: "#EF4444",
};

// ⚠️ 수정금지(승인필요) — 캐릭터별 카드 그래디언트 (BTSCharacterSelectScreen에서 사용)
export const CharacterGradients: Record<string, readonly [string, string]> = {
  collector: ["#0D7377", "#064E4F"] as const,
  romanticist: ["#C74B7A", "#8E2E55"] as const,
  explorer: ["#E8720C", "#B85A09"] as const,
  challenger: ["#2563EB", "#1D4ED8"] as const,
  companion: ["#6B9E78", "#4A7A58"] as const,
  recharger: ["#D97706", "#B45309"] as const,
  chiller: ["#64748B", "#475569"] as const,
};
