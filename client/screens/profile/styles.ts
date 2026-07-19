// 프로필 화면 메인 스타일 = ProfileScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
import { StyleSheet } from "react-native";
import {
  Spacing,
  BorderRadius,
  Typography,
  Shadows,
  Fonts,
} from "@/constants/theme";

export const styles = StyleSheet.create({
  profileCard: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    ...Shadows.fab,
  },
  userName: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  userEmail: {
    ...Typography.small,
  },
  loginButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  statIcon: {
    marginBottom: Spacing.sm,
  },
  statValue: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  personaContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  personaCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  personaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  personaTitle: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  personaDesc: {
    ...Typography.caption,
  },
  menuCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  menuItemLabel: {
    ...Typography.body,
  },
  // 🗂️ 나의 여정 스타일
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyTrips: {
    alignItems: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  emptyTripsText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    marginTop: Spacing.md,
  },
  emptyTripsHint: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  tripsScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  tripCard: {
    width: 190,
    padding: Spacing.md,
    // ⚠️ 2026-07-03 = X 삭제버튼 절대위치 기준(우측 상단). 도시명이 X와 안 겹치게 우측 여백 확보.
    position: "relative",
    paddingRight: Spacing.md + 20,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  // ⚠️ 2026-07-03 사장님 SSOT = 카드 우측 상단 X = 항상 표시, 즉시 삭제. 글라스 미니멀(은은한 반투명 원). 이모지 금지 = Lucide x 아이콘.
  cardDeleteBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(120,120,128,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  tripCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  videoReadyBadge: {
    backgroundColor: "#22c55e",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tripCardTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.xs,
  },
  // 🗂️ 2026-07-03 = 나의여정 카드 4요소 = 메인앱 요약헤더 폰트·색 통일(Fonts=Pretendard, tripSummaryText=semiBold12 / tripDescriptionText=bold14 위계)
  cardCity: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    marginBottom: 2,
  },
  cardBudget: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    marginBottom: Spacing.xs,
  },
  cardSummary: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    lineHeight: 16,
  },
  tripCardDate: {
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  tripCardTags: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  tripTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  tripTagText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
  },
  // 🎬 나의 영상 스타일
  videoCard: {
    width: 140,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  videoThumbnail: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  videoThumbnailGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  videoCardTitle: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    marginBottom: 2,
  },
  videoCardDate: {
    fontSize: 11,
  },
});
