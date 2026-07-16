// 저장된 여정 상세 화면 스타일 = SavedTripDetailScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import { StyleSheet } from "react-native";
import { Spacing, BorderRadius, Brand, Fonts } from "@/constants/theme";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    flex: 1,
  },
  videoCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  videoCardGradient: {
    padding: Spacing.lg,
  },
  videoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  videoCardTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
  },
  videoCardDesc: {
    fontSize: 14,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  videoButton: {
    backgroundColor: Brand.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  videoButtonDisabled: {
    opacity: 0.6,
  },
  videoButtonSpinner: {
    marginRight: Spacing.xs,
  },
  videoButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  progressText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  // 비디오 플레이어 스타일
  videoPlayerContainer: {
    padding: Spacing.md,
  },
  videoPlayer: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: BorderRadius.md,
    backgroundColor: "#000",
  },
  saveVideoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  saveVideoButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  regenerateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  regenerateButtonText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  infoCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  infoTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: 14,
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    flex: 1,
  },
  vibesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  vibesTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
    gap: Spacing.xs,
  },
  vibeTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  vibeTagText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },
});
