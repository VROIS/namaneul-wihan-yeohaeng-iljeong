// 🏙️ 도시 카드 (정본 = docs/2026-07-30 도시버튼·베스트갤러리·BTS 통합.md B3·B5 + B-0 "A. 도시 카드")
// = 카드는 도시 칩을 누르면 **항상** 뜬다(2026-08-02 사장님 지시). 채우는 값은 전부 서버 조립분
//   (GET /api/cities/:id/representative) = 대표여정이 있으면 그 여정 것, 없으면 도시 DB 의 사진·요약·상위 3곳.
//   손으로 적어둔 도시 소개·유니스플래시 사진은 완전삭제(§19) = 이제 이 파일 어디에도 고정 문구가 없다.
// = 이 파일은 껍데기(TripisModal) 안에서만 쓰인다 = 자체 Modal 을 갖지 않고 어두운 배경 + 가운데 카드만 그린다.
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
// ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 1주일 디버깅 SSOT = expo-image + resolveImageSource 1벌(§16)
//   = Wikimedia 버킷 변환 + User-Agent 헤더 + Platform 분기를 이 파일이 다시 만들지 않는다.
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Brand, Fonts, Shadows, BorderRadius } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { resolveImageSource } from "@/lib/wikimedia-image";
import CityBadge from "./CityBadge";
import type { RepCard } from "./TripisModal";
// 관리자 판정 = 저장된 계정 1벌에서 읽는다(프로필 '나의 여정' 별과 완전히 같은 방식 §16).
import { getUserData } from "@/lib/auth";

// 배지 3색 = 프로필 '나의 TRIPIS' 영상 카드의 gradientPalettes 값 그대로
//   (출처 = client/screens/profile/components/VideosSection.tsx — 그 파일은 이번 작업 범위 밖이라 값만 가져옴).
//   순서 = 영상 1번째 · 해설 2번째 · 코스 3번째. 새 색 발명 금지(사장님 2026-08-02 = 톤앤매너 유지).
//   여정 슬롯의 [해설 듣기] 도 이 표의 guide 색을 그대로 읽어간다(§16 = 색 값 1벌, 새 색 발명 금지).
export const BADGE_COLORS = {
  video: ["#4F46E5", "#7C3AED"],
  guide: ["#06B6D4", "#3B82F6"],
  course: ["#EC4899", "#8B5CF6"],
} as const;

interface Props {
  rep: RepCard;
  onCreateTrip(): void; // [여정 만들기] = 뒤 플래너 도시입력칸이 이미 채워진 상태 → 카드만 닫는다
  onVideo(): void; // [영상] = 같은 모달 안에서 숏폼 영상 화면으로 전환(카드는 사라짐)
  // [해설]·[해설 만들기] = **한 곳** = 가이드 미니앱 해설 화면(그 장소번호). 그 화면이 창고에 있으면 보여주고 없으면 만든다 = 1벌(§16).
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
  const { t, i18n } = useTranslation();
  // 관리자 여부 = 저장된 계정의 role 1벌. 아이디 문자열·is_admin 으로 판단하지 않는다(§9 표7).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    getUserData()
      .then((u) => {
        if (alive) setIsAdmin(u?.role === "admin");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 해설 배지 자리는 **하나**다 = 상황에 따라 글자만 갈리고 가는 곳은 같다(부품·자리 1벌 = §0·§16).
  //   · 해설이 이미 있으면(서버가 창고에서 확인해 준 rep.hasGuide) = [해설] = 누구에게나 보인다.
  //   · 아직 없고 + 관리자 + 그 도시에 쓸 장소가 있으면 = [해설 만들기] = 관리자만 보이는 만들기 입구(사장님 순서 ㉠).
  //   · 그 밖(일반 사용자) = 안 보이고 자리만 지킨다 = 줄 높이·다음 배지 위치 불변.
  const canCreateGuide = !rep.hasGuide && isAdmin && rep.placeId !== null;

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
              /* §23 = 아이콘 + 짧은 동사만. 설명(도시명·날짜)은 넣지 않는다 = 카드 안이라 위치로 자명 */
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
            // 아이콘뿐인 버튼 = 스크린리더용 이름 필수(2026-08-03 §22 판단검증)
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Icon name="x" size={20} color="#FFFFFF" />
          </Pressable>

          <View style={styles.imageContent}>
            {/* ⚠️ 수정금지(승인필요) 2026-08-14 = 도시명은 고유명사라 t() 대상이 아니다. 한국어면 nameKo,
                그 외는 nameEn(이미 서버 응답에 있음, 새 조회 없음) — 도시 칩과 같은 규칙(§16). */}
            <Text style={styles.cityName}>
              {(() => {
                const name = i18n.language === "ko" ? rep.nameKo : rep.nameEn;
                return rep.country ? `${name} (${rep.country})` : name;
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
