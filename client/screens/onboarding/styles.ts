import { StyleSheet } from "react-native";
import { Spacing, BorderRadius, Brand } from "@/constants/theme";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing["2xl"],
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  placeholder: {
    width: 32,
  },
  formSection: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  birthDateHint: {
    fontSize: 12,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    fontStyle: "italic",
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  flagText: {
    fontSize: 24,
  },
  selectorText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  dateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateInputBox: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    width: 56,
    height: 52,
    justifyContent: "center",
  },
  yearBox: {
    width: 80,
  },
  dateInput: {
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: Spacing.sm,
  },
  dateSeparator: {
    fontSize: 20,
    fontWeight: "500",
  },
  ageBadge: {
    backgroundColor: Brand.primary,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    marginLeft: Spacing.sm,
  },
  ageBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  socialSection: {
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    gap: Spacing.md,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  kakaoButton: {
    backgroundColor: "#FEE500",
  },
  kakaoIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  kakaoIconText: {
    color: "#FEE500",
    fontSize: 14,
    fontWeight: "800",
  },
  kakaoButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#4285F4",
    justifyContent: "center",
    alignItems: "center",
  },
  googleIconText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  disclaimer: {
    fontSize: 12,
    textAlign: "center",
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing["3xl"],
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  languageList: {
    paddingHorizontal: Spacing.xl,
  },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  languageItemSelected: {
    backgroundColor: "rgba(66, 133, 244, 0.08)",
  },
  languageTextContainer: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: "600",
  },
  languageSubname: {
    fontSize: 13,
    marginTop: 2,
  },
});
