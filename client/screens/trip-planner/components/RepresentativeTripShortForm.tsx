// 도시별 대표여정 숏폼 3D 모달/프리뷰 컴포넌트
import React from "react";
import { View, Text, Pressable, Image, Modal, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Brand, Fonts, Shadows, BorderRadius } from "@/constants/theme";
import Icon from "@/components/Icon";

export interface CityPreviewData {
  nameKo: string;
  nameEn: string;
  country: string;
  tagline: string;
  highlights: string[];
  days: string;
  imageUrl: string;
}

export const CITY_PREVIEW_MAP: Record<string, CityPreviewData> = {
  Paris: {
    nameKo: "파리",
    nameEn: "Paris",
    country: "프랑스",
    tagline: "에펠탑과 예술의 낭만이 흐르는 빛의 도시",
    highlights: [
      "에펠탑 야경 스팟",
      "루브르 박물관 패스트트랙",
      "몽마르트르 언덕 감성 카페",
    ],
    days: "3일 2야 코스",
    imageUrl:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&auto=format&fit=crop&q=80",
  },
  Brussels: {
    nameKo: "브뤼셀",
    nameEn: "Brussels",
    country: "벨기에",
    tagline: "중세 유럽의 광장과 와플·맥주 천국",
    highlights: [
      "그랑플라스 야경",
      "오줌싸개 소년 동상",
      "벨기에 수제 맥주 와플 투어",
    ],
    days: "2일 1야 코스",
    imageUrl:
      "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=600&auto=format&fit=crop&q=80",
  },
  Madrid: {
    nameKo: "마드리드",
    nameEn: "Madrid",
    country: "스페인",
    tagline: "열정의 미식과 프라도 미술관의 예술 탐방",
    highlights: [
      "마요르 광장 타파스 투어",
      "프라도 미술관 거장전",
      "마드리드 왕궁 산책",
    ],
    days: "3일 2야 코스",
    imageUrl:
      "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=600&auto=format&fit=crop&q=80",
  },
  Munich: {
    nameKo: "뮌헨",
    nameEn: "Munich",
    country: "독일",
    tagline: "알프스 관문과 옥토버페스트 전통 문화의 조화",
    highlights: [
      "마리엔 광장 시계탑",
      "호프브로이하우스 생맥주",
      "신시청사 역사 동선",
    ],
    days: "2일 2야 코스",
    imageUrl:
      "https://images.unsplash.com/photo-1595867818082-083862f3d630?w=600&auto=format&fit=crop&q=80",
  },
  London: {
    nameKo: "런던",
    nameEn: "London",
    country: "영국",
    tagline: "빅벤과 타워브리지, 클래식 영국 감성 여정",
    highlights: [
      "빅벤 & 국회의사당 스팟",
      "대영박물관 핵심 해설",
      "템스강 유람선 스카이라인",
    ],
    days: "4일 3야 코스",
    imageUrl:
      "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&auto=format&fit=crop&q=80",
  },
};

interface Props {
  visible: boolean;
  cityName: string;
  onClose: () => void;
  onSelectCity: (cityNameEn: string) => void;
}

export default function RepresentativeTripShortForm({
  visible,
  cityName,
  onClose,
  onSelectCity,
}: Props) {
  // ⚠️ 수정금지(승인필요) 2026-07-30 §19 = 기본 도시로 되돌리는 폴백 삭제.
  //   사유: 미리보기 없는 도시를 눌렀을 때 엉뚱한 도시 카드가 떠서 가짜 정보를 보여줬다.
  //   없으면 아무것도 띄우지 않는다 = 호출부(InputStep)가 목적지만 잡고 넘어간다.
  const preview = CITY_PREVIEW_MAP[cityName];
  if (!preview) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* 이미지 및 숏폼 태그 */}
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: preview.imageUrl }}
              style={styles.cityImage}
            />
            <LinearGradient
              colors={["transparent", "rgba(15, 23, 42, 0.9)"]}
              style={styles.imageOverlay}
            />
            <View style={styles.badgeRow}>
              <View style={styles.shortFormBadge}>
                <Icon name="play" size={12} color="#FFFFFF" />
                <Text style={styles.badgeText}>대표 숏폼 추천</Text>
              </View>
              <View style={styles.daysBadge}>
                <Text style={styles.badgeText}>{preview.days}</Text>
              </View>
            </View>

            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Icon name="x" size={20} color="#FFFFFF" />
            </Pressable>

            <View style={styles.imageContent}>
              <Text style={styles.cityName}>
                {preview.nameKo} ({preview.nameEn})
              </Text>
              <Text style={styles.tagline}>{preview.tagline}</Text>
            </View>
          </View>

          {/* 하단 세부 하이라이트 */}
          <View style={styles.bodyContent}>
            <Text style={styles.sectionTitle}>대표 추천 코스 하이라이트</Text>
            {preview.highlights.map((item, idx) => (
              <View key={idx} style={styles.highlightRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.highlightText}>{item}</Text>
              </View>
            ))}

            <Pressable
              style={styles.selectBtn}
              onPress={() => {
                onSelectCity(preview.nameEn);
                onClose();
              }}
            >
              <LinearGradient
                colors={[Brand.primary, Brand.secondary]}
                style={styles.selectGradient}
              >
                <Icon name="check-circle" size={18} color="#FFFFFF" />
                <Text style={styles.selectBtnText}>
                  {/* ⚠️ §23 = 버튼은 짧은 동사만. 어느 도시인지는 이 카드 안이라 위치로 자명하므로 도시명을 넣지 않는다(2026-07-30) */}
                  여정 만들기
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  shortFormBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  daysBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: Fonts.bold,
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
