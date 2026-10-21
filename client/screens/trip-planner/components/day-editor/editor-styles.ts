import { Platform, StyleSheet } from "react-native";
import { BorderRadius, Brand, Fonts, Spacing } from "@/constants/theme";

export const LEFT_COL = 38;
export const RULER_W = 56;
export const TRAY_THUMB = 56;
export const RED = "#EF4444";
export const CARD_PAD_V = 10;
export const NAME_H = 18;
export const META_H = 15;
export const SUMMARY_LINE = 14;
export const SUMMARY_MAX_LINES = 2;

export const noTouchScroll: any =
  Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : null;
export const noSelect: any =
  Platform.OS === "web" ? { userSelect: "none" } : null;
export const noTouch = { pointerEvents: "none" } as const;

export const editStyles = StyleSheet.create({
  root: { flex: 1 },
  fixedBar: { zIndex: 8 },
  startRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  startName: { fontSize: 13, fontFamily: Fonts.semiBold, flexShrink: 1 },
  startTime: { fontSize: 13, fontFamily: Fonts.medium },
  ghostBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  ghostBtnText: { fontSize: 12, fontFamily: Fonts.bold },
  primaryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: Brand.primary,
    minWidth: 56,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 12, fontFamily: Fonts.bold, color: "#FFFFFF" },
  tray: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: TRAY_THUMB + Spacing.md,
    borderBottomWidth: 1,
  },
  trayLabel: { alignItems: "center", minWidth: 34 },
  trayLabelText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: Fonts.bold,
    textAlign: "center",
  },
  trayItem: {
    width: TRAY_THUMB,
    height: TRAY_THUMB,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  block: {
    position: "absolute",
    left: 0,
    flexDirection: "row",
    pointerEvents: "box-none",
  },
  blockInner: { flex: 1, flexDirection: "row", pointerEvents: "box-none" },
  cardWrap: { flex: 1 },
  // 안내 = Tripis 첫 화면 안내와 같은 자리·크기·정렬(화면 한가운데 · 20/32 · 가운데) · 흰 바탕에서 읽히게 앱 파랑 굵은 글자 + 흰 번짐
  hintWrap: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  hintText: {
    color: Brand.primary,
    fontWeight: "700",
    fontSize: 20,
    lineHeight: 32,
    textAlign: "center",
    textShadowColor: "#FFFFFF",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  dragHandle: { ...StyleSheet.absoluteFillObject, left: LEFT_COL },
  cardLifted: { opacity: 0.35 },
  numberCol: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 10,
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.sm,
    paddingRight: 36,
    overflow: "hidden",
  },
  textCol: { flex: 1, justifyContent: "flex-start" },
  name: { fontSize: 14, lineHeight: NAME_H, fontFamily: Fonts.bold },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    height: META_H,
    overflow: "hidden",
  },
  meta: {
    fontSize: 11,
    lineHeight: META_H,
    fontFamily: Fonts.medium,
    flexShrink: 1,
  },
  metaTime: { fontSize: 11, lineHeight: META_H, fontFamily: Fonts.medium },
  summary: { fontSize: 11, lineHeight: SUMMARY_LINE },
  resizeHit: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 28,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  resizeBar: { width: 40, height: 4, borderRadius: 2, marginBottom: 2 },
  move: {
    position: "absolute",
    left: LEFT_COL,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  moveText: { fontSize: 11, fontFamily: Fonts.medium },
  hourLine: { position: "absolute", left: LEFT_COL, height: 1 },
  hourLabel: {
    position: "absolute",
    right: 4,
    fontSize: 11,
    fontFamily: Fonts.medium,
  },
  endLine: { position: "absolute", left: LEFT_COL, height: 2 },
  wheel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: RULER_W,
    borderRadius: BorderRadius.sm,
  },
  endText: {
    position: "absolute",
    left: LEFT_COL + 4,
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
});
