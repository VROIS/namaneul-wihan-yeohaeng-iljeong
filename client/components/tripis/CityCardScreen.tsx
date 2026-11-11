// ⚠️ 수정금지(승인필요) 2026-11-11 사장님 결정 = 도시 대표 카드 사진 자리 바탕 = 밝은 회색(검은 화면 깜빡임 제거) (정본 2026-11-11)
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
// ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT = expo-image + resolveImageSource 1벌(§16)
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Brand, Fonts, Shadows, BorderRadius } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { resolveImageSource } from "@/lib/wikimedia-image";
import CityBadge from "./CityBadge";
import type { RepCard } from "./TripisModal";

export const BADGE_COLORS = {
  video: ["#4F46E5", "#7C3AED"],
  guide: ["#06B6D4", "#3B82F6"],
  course: ["#EC4899", "#8B5CF6"],
} as const;

// ⚠️ 수정금지(승인필요) 2026-08-20 사장님 승인 = 도시대표카드 국가명 영어 통일용.
const COUNTRY_NAMES_EN: Record<string, string> = {
  AD: "Andorra",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  BE: "Belgium",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CO: "Colombia",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HK: "Hong Kong",
  HR: "Croatia",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IS: "Iceland",
  IT: "Italy",
  JP: "Japan",
  KE: "Kenya",
  KR: "South Korea",
  LU: "Luxembourg",
  MC: "Monaco",
  MX: "Mexico",
  MY: "Malaysia",
  NL: "Netherlands",
  NO: "Norway",
  PE: "Peru",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  SE: "Sweden",
  SG: "Singapore",
  TH: "Thailand",
  TR: "Turkey",
  TW: "Taiwan",
  US: "United States",
  VN: "Vietnam",
};

export const CITY_CARD_WIDTH = 166;
export const CITY_CARD_GAP = 8;

interface Props {
  rep: RepCard;
  selected?: boolean;
  onSelect?(): void;
  onCreateTrip(): void;
  onVideo(): void;
  onGuide(): void;
  onCourse(): void;
}

export default function CityCardScreen({
  rep,
  selected = false,
  onSelect,
  onCreateTrip,
  onVideo,
  onGuide,
  onCourse,
}: Props) {
  const { t } = useTranslation();
  const canCreateGuide = !rep.hasGuide && rep.placeId !== null;
  const cityTitle = (() => {
    const name = rep.nameEn || rep.nameKo;
    const countryName = rep.countryCode
      ? COUNTRY_NAMES_EN[rep.countryCode]
      : null;
    return countryName ? `${name} (${countryName})` : name;
  })();

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.imageContainer}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onSelect}
          accessibilityRole="button"
          accessibilityLabel={cityTitle}
          accessibilityState={{ selected }}
        >
          <Image
            source={resolveImageSource(rep.imageUrl, "card")}
            style={styles.cityImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <LinearGradient
            colors={["rgba(15, 23, 42, 0.2)", "rgba(15, 23, 42, 0.85)"]}
            style={styles.imageOverlay}
          />
          <View style={styles.imageContent}>
            <Text style={styles.cityName} numberOfLines={1}>
              {cityTitle}
            </Text>
          </View>
        </Pressable>
        <View style={styles.badgeRow} pointerEvents="box-none">
          <View style={styles.badgeScaleWrap} pointerEvents="box-none">
            <CityBadge
              icon="play"
              label={t("trip.cityCardVideo")}
              colors={BADGE_COLORS.video}
              visible={rep.hasVideo === true}
              delay={0}
              onPress={onVideo}
            />
            <CityBadge
              icon="book-open"
              label={
                canCreateGuide
                  ? t("trip.cityCardGuideCreate")
                  : t("trip.cityCardGuideListen")
              }
              colors={BADGE_COLORS.guide}
              visible={rep.hasGuide || canCreateGuide}
              delay={1200}
              onPress={onGuide}
            />
            <CityBadge
              icon="map"
              label={t("trip.cityCardCourse")}
              colors={BADGE_COLORS.course}
              visible={rep.itineraryId !== null}
              delay={2400}
              onPress={onCourse}
            />
          </View>
        </View>
      </View>

      <View style={styles.bodyContent}>
        <Pressable onPress={onSelect}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {t("trip.cityCardHighlights")}
          </Text>
          <View style={styles.highlightsWrap}>
            {rep.highlights.slice(0, 3).map((item, idx) => (
              <View key={idx} style={styles.highlightRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.highlightText} numberOfLines={1}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </Pressable>

        <Pressable
          style={styles.selectBtn}
          onPress={onCreateTrip}
          accessibilityRole="button"
          accessibilityLabel={t("trip.pickPopular")}
        >
          <LinearGradient
            colors={[Brand.primary, Brand.secondary]}
            style={styles.selectGradient}
          >
            <Icon name="check-circle" size={12} color="#FFFFFF" />
            <Text style={styles.selectBtnText}>{t("trip.pickPopular")}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CITY_CARD_WIDTH,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    flexShrink: 0,
    ...Shadows.card,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: Brand.primary,
  },
  imageContainer: {
    height: 104,
    width: "100%",
    position: "relative",
    backgroundColor: "#CBD5E1",
  },
  cityImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  badgeRow: {
    position: "absolute",
    top: 7,
    left: 7,
    right: 7,
    overflow: "hidden",
  },
  badgeScaleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    transform: [{ scale: 0.72 }],
    transformOrigin: "left top",
  },
  imageContent: {
    position: "absolute",
    bottom: 7,
    left: 9,
    right: 9,
  },
  cityName: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontFamily: Fonts.bold,
  },
  bodyContent: {
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    marginBottom: 4,
  },
  highlightsWrap: {
    minHeight: 40,
    justifyContent: "flex-start",
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2.5,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.primary,
    flexShrink: 0,
  },
  highlightText: {
    fontSize: 9.5,
    fontFamily: Fonts.medium,
    color: "#334155",
    flex: 1,
  },
  selectBtn: {
    marginTop: 6,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    ...Shadows.card,
  },
  selectGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6.5,
  },
  selectBtnText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontFamily: Fonts.bold,
  },
});
