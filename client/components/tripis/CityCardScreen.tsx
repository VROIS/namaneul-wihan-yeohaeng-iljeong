// = 카드는 도시 칩을 누르면 **항상** 뜬다(2026-08-02 사장님 지시). 채우는 값은 전부 서버 조립분
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

//   순서 = 영상 1번째 · 해설 2번째 · 코스 3번째. 새 색 발명 금지(사장님 2026-08-02 = 톤앤매너 유지).
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

interface Props {
  rep: RepCard;
  onCreateTrip(): void; // [여정 만들기] = 뒤 플래너 도시입력칸이 이미 채워진 상태 → 카드만 닫는다
  onVideo(): void; // [영상] = 같은 모달 안에서 숏폼 영상 화면으로 전환(카드는 사라짐)
  onGuide(): void;
  onCourse(): void; // [코스] = 그 여정 화면(프로필 '나의 여정' 카드와 같은 경로)
  onClose(): void;
}

export default function CityCardScreen({
  rep,
  onCreateTrip,
  onVideo,
  onGuide,
  onCourse,
  onClose,
}: Props) {
  const { t } = useTranslation();

  //   · 없고 + 그 도시에 쓸 장소가 있으면 = [해설 만들기] = 누구나 보이는 만들기 입구(2026-08-20 사장님 승인 =
  const canCreateGuide = !rep.hasGuide && rep.placeId !== null;

  return (
    <View style={styles.overlay}>
      <View style={styles.modalCard}>
        {/* 사진 + 그 위에 얹히는 배지 줄·닫기·도시명 */}
        <View style={styles.imageContainer}>
          <Image
            source={resolveImageSource(rep.imageUrl, "card")}
            style={styles.cityImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <LinearGradient
            colors={["transparent", "rgba(15, 23, 42, 0.9)"]}
            style={styles.imageOverlay}
          />
          {/* 배지 3단 = 영상 · 해설 · 코스 (2026-08-02 사장님 확정 순서·이름).
              누르면 셋 다 같은 흐름 = 카드는 닫히고 같은 모달 안에서 화면만 갈린다.
              없는 것은 안 보이되 자리는 그대로 = 줄 높이가 흔들리지 않고, 생기면 그 자리에 켜진다. */}
          <View style={styles.badgeRow}>
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

          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Icon name="x" size={20} color="#FFFFFF" />
          </Pressable>

          <View style={styles.imageContent}>
            {/* ⚠️ 수정금지(승인필요) 2026-08-20 사장님 승인 = 도시명·국가명 영어 일괄통일(§ COUNTRY_NAMES_EN).
                한국어 분기 폐기 = 2026-08-20 §19 — 도시명은 고유명사, 뷰어 언어와 무관하게 항상 nameEn.
                nameEn 이 비어있는 도시 대비 = nameKo 폴백(city-resolver.ts 의 nameEn||name 관례와 동일 §16). */}
            <Text style={styles.cityName}>
              {(() => {
                const name = rep.nameEn || rep.nameKo;
                const countryName = rep.countryCode
                  ? COUNTRY_NAMES_EN[rep.countryCode]
                  : null;
                return countryName ? `${name} (${countryName})` : name;
              })()}
            </Text>
            {/* 한 줄 카피 = 비어 있으면(그 도시에 요약이 없음) 줄 자체를 안 그린다 = 빈 줄 방지(2026-08-02) */}
            {!!rep.tagline && <Text style={styles.tagline}>{rep.tagline}</Text>}
          </View>
        </View>

        {/* 하단 세부 하이라이트 = 서버가 골라 내려준 장소명 3줄 그대로(대표여정 있으면 그 여정 것, 없으면 도심 상위 3곳) */}
        <View style={styles.bodyContent}>
          <Text style={styles.sectionTitle}>
            {t("trip.cityCardHighlights")}
          </Text>
          {rep.highlights.map((item, idx) => (
            <View key={idx} style={styles.highlightRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.highlightText}>{item}</Text>
            </View>
          ))}

          <Pressable style={styles.selectBtn} onPress={onCreateTrip}>
            <LinearGradient
              colors={[Brand.primary, Brand.secondary]}
              style={styles.selectGradient}
            >
              <Icon name="check-circle" size={18} color="#FFFFFF" />
              <Text style={styles.selectBtnText}>
                {/* ⚠️ §23 = 버튼은 짧은 동사만. 어느 도시인지는 이 카드 안이라 위치로 자명하므로 도시명을 넣지 않는다(2026-07-30) */}
                {t("trip.generate")}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    overflow: "hidden",
    ...Shadows.elevated,
  },
  imageContainer: {
    height: 200,
    width: "100%",
    position: "relative",
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
    top: 14,
    left: 14,
    flexDirection: "row",
    gap: 8,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContent: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
  },
  cityName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: Fonts.bold,
  },
  tagline: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 12.5,
    fontFamily: Fonts.medium,
    marginTop: 2,
  },
  bodyContent: {
    padding: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    marginBottom: 12,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Brand.primary,
  },
  highlightText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#334155",
  },
  selectBtn: {
    marginTop: 16,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    ...Shadows.card,
  },
  selectGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
  },
  selectBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
});
