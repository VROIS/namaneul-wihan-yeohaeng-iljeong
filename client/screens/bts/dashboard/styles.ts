// BTSDashboardScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import { StyleSheet, Dimensions } from "react-native";
import { BTSColors, BTSBorderRadius } from "@/constants/bts-theme";

const { width: SCREEN_W } = Dimensions.get("window");
export const REEL_W = SCREEN_W * 0.75;
export const REEL_H = REEL_W * 1.2;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BTSColors.spaceBlack,
  },

  // Header
  headerWrap: {
    paddingHorizontal: 20,
    marginTop: 8,
    zIndex: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderRadius: 20,
    overflow: "hidden",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  backText: {
    color: BTSColors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BTSColors.textPrimary,
  },
  shareBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  shareIcon: {
    color: BTSColors.neonPurple,
    fontSize: 18,
    fontWeight: "700",
  },

  // Sections
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: BTSColors.textPrimary,
    paddingHorizontal: 24,
  },
  sectionSub: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 16,
  },

  // Reels
  reelsSection: {
    marginTop: 20,
  },
  reelCard: {
    height: REEL_H,
    borderRadius: BTSBorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  reelGradient: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 20,
  },
  reelCatBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reelCatText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  reelTime: {
    fontSize: 14,
    fontWeight: "800",
    color: BTSColors.neonPurple,
    marginBottom: 6,
  },
  reelName: {
    fontSize: 22,
    fontWeight: "900",
    color: BTSColors.textPrimary,
    marginBottom: 6,
  },
  reelDesc: {
    fontSize: 13,
    color: BTSColors.textSecondary,
    lineHeight: 18,
  },

  // Timeline
  timelineSection: {
    marginTop: 32,
  },
  timelineRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  timelineLine: {
    width: 24,
    alignItems: "center",
    paddingTop: 6,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 4,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: BTSColors.backgroundCard,
    borderRadius: BTSBorderRadius.md,
    padding: 14,
    marginLeft: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  timelineCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timelineEmoji: {
    fontSize: 24,
  },
  timelineName: {
    fontSize: 15,
    fontWeight: "700",
    color: BTSColors.textPrimary,
  },
  timelineTime: {
    fontSize: 11,
    color: BTSColors.neonPurple,
    fontWeight: "600",
    marginTop: 2,
  },
  priceBadge: {
    backgroundColor: BTSColors.purpleGlowLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priceText: {
    fontSize: 11,
    color: BTSColors.neonPurple,
    fontWeight: "700",
  },
  timelineReason: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    marginTop: 8,
    lineHeight: 17,
  },

  // Summary
  summarySection: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  summaryCard: {
    borderRadius: BTSBorderRadius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BTSColors.textPrimary,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "900",
    color: BTSColors.neonPurple,
  },
  summaryLabel: {
    fontSize: 12,
    color: BTSColors.textTertiary,
    fontWeight: "500",
  },

  // Bottom actions
  bottomActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BTSColors.spaceBlack + "E0",
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: BTSBorderRadius["2xl"],
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BTSColors.glassBorder,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: BTSColors.textSecondary,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: BTSBorderRadius["2xl"],
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
