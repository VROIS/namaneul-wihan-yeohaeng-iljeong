/**
 * PlaceDetailModal
 * 장소 카드 클릭 시 표시되는 인앱 상세 모달
 * - 이미지 풀스크린 뷰어
 * - nubiReason 강조 표시
 * - 인앱 지도 (WebView, 외부 앱 이탈 없음)
 * - 시간/가격/이동 정보
 */
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Brand } from "@/constants/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

interface PlaceDetailModalProps {
  visible: boolean;
  onClose: () => void;
  place: {
    name: string;
    nameKo?: string;
    image?: string;
    nubiReason?: string;
    nubiEvidenceUrl?: string;
    nubiReasonSource?: string;
    startTime?: string;
    endTime?: string;
    estimatedPriceEur?: number;
    priceEstimate?: string;
    isMealSlot?: boolean;
    mealType?: string;
    mealPrice?: number;
    lat?: number;
    lng?: number;
    googleMapsUrl?: string;
    tripAdvisorRating?: number;
    tripAdvisorReviewCount?: number;
    personaFitReason?: string;
    geminiReason?: string;
    type?: string;
  } | null;
  theme: any;
}

export function PlaceDetailModal({
  visible,
  onClose,
  place,
  theme,
}: PlaceDetailModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [imageFullscreen, setImageFullscreen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);

  if (!place) return null;

  const isMeal =
    place.isMealSlot || place.type === "lunch" || place.type === "dinner";
  const displayName = place.nameKo || place.name;
  const displayReason =
    place.nubiReason || place.personaFitReason || place.geminiReason || "";
  const mealLabel =
    place.mealType === "lunch"
      ? "🍽️ 점심"
      : place.mealType === "dinner"
        ? "🍽️ 저녁"
        : "";

  // 인앱 Google Maps HTML (단일 장소 핀)
  const apiKey = ""; // 서버에서 주입 — 클라이언트 키 없이 embed URL 사용
  const mapEmbedUrl =
    place.lat && place.lng
      ? `https://maps.google.com/maps?q=${place.lat},${place.lng}&z=16&output=embed`
      : null;

  const handleOpenGoogleMaps = () => {
    if (place.googleMapsUrl) {
      Linking.openURL(place.googleMapsUrl);
    } else if (place.lat && place.lng) {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
      );
    }
  };

  // 풀스크린 이미지 뷰어
  if (imageFullscreen && place.image) {
    return (
      <Modal
        visible={true}
        transparent
        animationType="fade"
        onRequestClose={() => setImageFullscreen(false)}
      >
        <View style={styles.fullscreenOverlay}>
          <Pressable
            style={styles.fullscreenClose}
            onPress={() => setImageFullscreen(false)}
          >
            <Icon name="x" size={28} color="#fff" />
          </Pressable>
          <Image
            source={{ uri: place.image }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
          <Text style={styles.fullscreenCaption}>{displayName}</Text>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        {/* 헤더 */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              backgroundColor: theme.backgroundDefault,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={8}>
            <Icon name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <Text
            style={[styles.headerTitle, { color: theme.text }]}
            numberOfLines={1}
          >
            {isMeal ? `${mealLabel} ` : ""}
            {displayName}
          </Text>
          {/* 외부 Google Maps 링크 (아이콘만) */}
          <Pressable
            onPress={handleOpenGoogleMaps}
            style={styles.headerBtn}
            hitSlop={8}
          >
            <Icon name="external-link" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* 이미지 영역 */}
          <Pressable
            onPress={() => place.image && setImageFullscreen(true)}
            style={styles.imageContainer}
          >
            {place.image ? (
              <>
                <Image
                  source={{ uri: place.image }}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
                {/* 확대 힌트 */}
                <View style={styles.imageZoomHint}>
                  <Icon name="maximize-2" size={14} color="#fff" />
                </View>
              </>
            ) : (
              <View
                style={[
                  styles.heroImagePlaceholder,
                  {
                    backgroundColor: isMeal
                      ? "#FFF5F0"
                      : theme.backgroundSecondary,
                  },
                ]}
              >
                <Icon
                  name={isMeal ? "coffee" : "map-pin"}
                  size={48}
                  color={isMeal ? "#FF6B35" : theme.textTertiary}
                />
                <Text
                  style={[styles.noImageText, { color: theme.textTertiary }]}
                >
                  {displayName}
                </Text>
              </View>
            )}
          </Pressable>

          {/* nubiReason - 핵심 차별화 */}
          {displayReason ? (
            <View
              style={[
                styles.reasonCard,
                {
                  backgroundColor: `${Brand.primary}10`,
                  borderColor: `${Brand.primary}30`,
                },
              ]}
            >
              <View style={styles.reasonHeader}>
                <Text style={[styles.reasonLabel, { color: Brand.primary }]}>
                  {t("place.nubiReason")}
                </Text>
                {place.nubiReasonSource && (
                  <Text
                    style={[styles.reasonSource, { color: theme.textTertiary }]}
                  >
                    {place.nubiReasonSource === "instagram"
                      ? t("place.sourceInstagram")
                      : place.nubiReasonSource === "naver_blog"
                        ? t("place.sourceNaverBlog")
                        : place.nubiReasonSource === "youtube"
                          ? t("place.sourceYoutube")
                          : ""}
                  </Text>
                )}
              </View>
              <Text style={[styles.reasonText, { color: theme.text }]}>
                {displayReason}
              </Text>
            </View>
          ) : null}

          {/* 시간 / 가격 / 평점 */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.backgroundDefault,
                borderColor: theme.border,
              },
            ]}
          >
            {/* 시간 */}
            {place.startTime && place.endTime && (
              <View style={styles.infoRow}>
                <Icon name="clock" size={16} color={Brand.primary} />
                <Text style={[styles.infoText, { color: theme.text }]}>
                  {place.startTime} — {place.endTime}
                </Text>
              </View>
            )}

            {/* 가격 */}
            <View style={styles.infoRow}>
              <Icon
                name={isMeal ? "credit-card" : "tag"}
                size={16}
                color={Brand.primary}
              />
              <Text style={[styles.infoText, { color: theme.text }]}>
                {isMeal
                  ? t("place.mealPerPerson", { price: place.mealPrice || "??" })
                  : place.estimatedPriceEur &&
                      place.estimatedPriceEur > 0 &&
                      place.estimatedPriceEur < 500
                    ? t("place.entrancePerPerson", { price: place.estimatedPriceEur })
                    : place.priceEstimate && place.priceEstimate !== "무료"
                      ? place.priceEstimate
                      : t("place.freeEntrance")}
              </Text>
            </View>

            {/* TripAdvisor 평점 */}
            {place.tripAdvisorRating && place.tripAdvisorRating > 0 ? (
              <View style={styles.infoRow}>
                <Icon name="star" size={16} color="#FF6B35" />
                <Text style={[styles.infoText, { color: theme.text }]}>
                  {t("place.tripAdvisorRating", { rating: place.tripAdvisorRating.toFixed(1), count: (place.tripAdvisorReviewCount || 0).toLocaleString() })}
                </Text>
              </View>
            ) : null}
          </View>

          {/* 인앱 지도 섹션 */}
          {place.lat && place.lng ? (
            <View style={styles.mapSection}>
              <Pressable
                style={[
                  styles.mapToggleBtn,
                  {
                    backgroundColor: showMap
                      ? `${Brand.primary}15`
                      : theme.backgroundDefault,
                    borderColor: Brand.primary,
                  },
                ]}
                onPress={() => {
                  setShowMap(!showMap);
                  setMapLoading(true);
                }}
              >
                <Icon name="map" size={16} color={Brand.primary} />
                <Text style={[styles.mapToggleText, { color: Brand.primary }]}>
                  {showMap ? t("place.hideMap") : t("place.showMap")}
                </Text>
                <Icon
                  name={showMap ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Brand.primary}
                />
              </Pressable>

              {showMap && mapEmbedUrl && (
                <View style={styles.mapContainer}>
                  {mapLoading && (
                    <View style={styles.mapLoader}>
                      <ActivityIndicator size="small" color={Brand.primary} />
                      <Text
                        style={{
                          color: theme.textSecondary,
                          marginTop: 6,
                          fontSize: 12,
                        }}
                      >
                        {t("place.mapLoading")}
                      </Text>
                    </View>
                  )}
                  <WebView
                    source={{ uri: mapEmbedUrl }}
                    style={[styles.mapWebView, mapLoading && { opacity: 0 }]}
                    onLoad={() => setMapLoading(false)}
                    onError={() => setMapLoading(false)}
                    javaScriptEnabled
                    domStorageEnabled
                    originWhitelist={["*"]}
                  />
                </View>
              )}
            </View>
          ) : null}

          {/* 외부 Google Maps 버튼 */}
          {(place.googleMapsUrl || (place.lat && place.lng)) && (
            <Pressable
              style={[styles.externalMapBtn, { borderColor: theme.border }]}
              onPress={handleOpenGoogleMaps}
            >
              <Icon name="navigation" size={15} color={theme.textSecondary} />
              <Text
                style={[styles.externalMapText, { color: theme.textSecondary }]}
              >
                {t("place.openGoogleMaps")}
              </Text>
              <Icon name="external-link" size={13} color={theme.textTertiary} />
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },

  imageContainer: {
    width: SCREEN_W,
    height: 240,
    position: "relative",
  },
  heroImage: {
    width: SCREEN_W,
    height: 240,
  },
  heroImagePlaceholder: {
    width: SCREEN_W,
    height: 240,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  noImageText: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  imageZoomHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 16,
    padding: 6,
  },

  reasonCard: {
    margin: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  reasonHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  reasonSource: {
    fontSize: 11,
  },
  reasonText: {
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
  },

  infoCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },

  mapSection: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  mapToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  mapToggleText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  mapContainer: {
    height: 260,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 8,
    position: "relative",
  },
  mapLoader: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
    backgroundColor: "#f5f5f5",
  },
  mapWebView: {
    flex: 1,
  },

  externalMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  externalMapText: {
    fontSize: 13,
  },

  // 풀스크린 이미지
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.75,
  },
  fullscreenCaption: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 16,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
