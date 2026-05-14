/**
 * ⚠️ 수정금지(승인필요) 2026-05-12 = 사용자 SSOT = 우리 모달 통째 폐기
 * = Google Maps Embed iframe = 사진/평점/리뷰/메뉴/시간 = 모두 Google 자동
 * = 우리 = 신뢰성 정보 큐레이션 + 클릭 = Google 자동 = 인간 본능 후킹
 * = 비용 = 완전 무료 + 무제한 (= Maps Embed API)
 * = 정책 = 캐시 X = 실시간 사용자 호출 = 정책 안전
 */
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  Linking,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/Icon";
import { getApiUrl } from "@/lib/query-client";

// ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 패턴 재사용 = 서버 endpoint /api/bts/map-config 에서 키 받음
// = Replit Secrets 의 GOOGLE_MAPS_API_KEY = 동일 키 (= DB api_keys + Replit 통합)
// = 클라이언트 빌드에 키 직접 노출 X = 런타임 fetch = 보안 ↑

interface PlaceDetailModalProps {
  visible: boolean;
  onClose: () => void;
  place: {
    name: string;
    nameKo?: string;
    lat?: number;
    lng?: number;
    googleMapsUrl?: string;
    [key: string]: any; // = 호환성 = 옛 모달의 다양한 필드 (= 사용 X 이지만 type 호환)
  } | null;
  theme?: any;
}

export function PlaceDetailModal({
  visible,
  onClose,
  place,
}: PlaceDetailModalProps) {
  const insets = useSafeAreaInsets();
  // ⚠️ 수정금지(승인필요) 2026-05-12 = BTS 패턴 = /api/bts/map-config fetch
  const [embedApiKey, setEmbedApiKey] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    fetch(`${getApiUrl()}/api/bts/map-config`)
      .then((r) => r.json())
      .then((d) => setEmbedApiKey(d.googleMapsApiKey || null))
      .catch(() => setEmbedApiKey(""));
  }, [visible]);

  if (!place) return null;

  // ⚠️ 수정금지(승인필요) 2026-05-12 = Embed URL 결정 우선순위 (= 사용자 SSOT 정확 매칭)
  // = 1) googlePlaceId (= 100% 정확 = 사진/평점/리뷰 카드 자동) ⭐
  // = 2) name + city 검색 (= 동명 회피 = lat/lng 보다 정확)
  // = 3) lat/lng (= 마지막 fallback = 엉뚱한 매칭 위험)
  const placeId = (place as any).googlePlaceId;
  const cityName = (place as any).city || "";
  const displayName = place.nameKo || place.name;
  const keyReady = embedApiKey !== null;
  const hasKey = !!embedApiKey;

  let embedUrl: string | null = null;
  if (keyReady) {
    if (hasKey && placeId && placeId.startsWith("ChIJ")) {
      // ⭐ 1 순위 = place_id = 사진/평점/리뷰 카드 + 지도 = 100% 정확
      embedUrl = `https://www.google.com/maps/embed/v1/place?key=${embedApiKey}&q=place_id:${placeId}`;
    } else if (hasKey) {
      // 2 순위 = name + city 검색 (= 동명 회피 = lat/lng 보다 정확)
      const q = encodeURIComponent(cityName ? `${place.name}, ${cityName}` : place.name);
      embedUrl = `https://www.google.com/maps/embed/v1/place?key=${embedApiKey}&q=${q}`;
    } else {
      // 3 순위 = key fetch 실패 = Legacy embed (= 단순 지도)
      const q = cityName
        ? encodeURIComponent(`${place.name}, ${cityName}`)
        : (place.lat && place.lng ? `${place.lat},${place.lng}` : encodeURIComponent(place.name));
      embedUrl = `https://maps.google.com/maps?q=${q}&z=16&output=embed`;
    }
  }

  // Google Maps 앱으로 열기 (= 익숙한 UX = 외부 앱)
  const handleOpenInApp = () => {
    if (placeId && placeId.startsWith("ChIJ")) {
      Linking.openURL(`https://www.google.com/maps/place/?q=place_id:${placeId}`);
    } else if (place.googleMapsUrl) {
      Linking.openURL(place.googleMapsUrl);
    } else if (place.lat && place.lng) {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* 헤더 = 닫기 + 이름 + 외부 Google Maps 열기 */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn} hitSlop={8}>
            <Icon name="x" size={24} color="#000" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <Pressable onPress={handleOpenInApp} style={styles.headerBtn} hitSlop={8}>
            <Icon name="external-link" size={20} color="#666" />
          </Pressable>
        </View>

        {/* Google Maps Embed = 사진 + 평점 + 리뷰 + 시간 + 메뉴 = 자동 */}
        {!embedUrl ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#666" />
          </View>
        ) : Platform.OS === "web" ? (
          React.createElement("iframe", {
            src: embedUrl,
            style: {
              width: "100%",
              height: "100%",
              border: 0,
              flex: 1,
            },
            allowFullScreen: true,
            loading: "lazy",
            referrerPolicy: "no-referrer-when-downgrade",
          })
        ) : (
          <WebView
            source={{ uri: embedUrl }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    color: "#000",
    marginHorizontal: 8,
  },
  webview: {
    flex: 1,
    width: "100%",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
