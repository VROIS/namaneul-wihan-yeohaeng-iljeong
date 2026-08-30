import { StyleSheet } from "react-native";
import { Spacing, BorderRadius } from "@/constants/theme";

export const langModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    paddingTop: Spacing.lg,
    paddingBottom: Spacing["3xl"],
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  title: { fontSize: 20, fontWeight: "700" },
  list: { paddingHorizontal: Spacing.xl },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  itemSelected: { backgroundColor: "rgba(66, 133, 244, 0.08)" },
  itemText: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: "600" },
  itemSub: { fontSize: 13, marginTop: 2 },
  flag: { fontSize: 24 },
});
