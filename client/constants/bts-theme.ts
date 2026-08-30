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

// ⚠️ 수정금지(승인필요) — BTS 미니앱 직접 참조 색상 (BTSCharacterSelect/PlaceCart/Dashboard에서 사용)
export const BTSDirectColors = {
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

export const BTSTypography = {
  tourTitle: {
    fontFamily: "NotoSerifKR-Bold",
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  display: {
    fontFamily: "PlayfairDisplay-Bold",
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h1: {
    fontFamily: "Pretendard-Bold",
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.25,
  },
  h2: {
    fontFamily: "Pretendard-SemiBold",
    fontSize: 20,
    lineHeight: 28,
  },
  h3: {
    fontFamily: "Pretendard-SemiBold",
    fontSize: 17,
    lineHeight: 24,
  },
  body: {
    fontFamily: "Pretendard-Regular",
    fontSize: 16,
    lineHeight: 26, // 한국어 최적 line-height 1.6
  },
  caption: {
    fontFamily: "Pretendard-Medium",
    fontSize: 13,
    lineHeight: 18,
  },
  small: {
    fontFamily: "Pretendard-Medium",
    fontSize: 11,
    lineHeight: 16,
  },
} as const;

export const BTSSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
} as const;

export const BTSBorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
} as const;

export const BTSShadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardDark: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  elevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  fab: {
    shadowColor: ArirangColors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

export const BTSSizes = {
  buttonHeight: 52,
  buttonRadius: 14,
  tabBarHeight: 60,
  fabSize: 56,
  iconDefault: 24,
  iconTab: 20,
  iconInline: 16,
  touchMin: 44, // 애플 HIG 최소 터치 영역
} as const;

export const MemberVibeColors: Record<string, string> = {
  rm: "#0D7377", // 딥 틸 — 문화/예술
  v: "#C74B7A", // 로즈 — 로맨틱
  jhope: "#E8720C", // 브라이트 오렌지 — 핫스팟
  jungkook: "#2563EB", // 일렉트릭 블루 — 모험
  jimin: "#6B9E78", // 세이지 그린 — 힐링
  jin: "#D97706", // 웜 앰버 — 미식
  suga: "#64748B", // 쿨 그레이 — 칠
} as const;

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

export const ConcertGradient = {
  colors: [ArirangColors.redDeep, ArirangColors.red] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

export const LandingLayout = {
  heroRatio: 0.45, // 상단 45%
  inputRatio: 0.55, // 하단 55%
} as const;
