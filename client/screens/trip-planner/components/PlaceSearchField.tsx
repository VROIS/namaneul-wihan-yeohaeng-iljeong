// 🎹 2026-08-12 사장님 승인 = 플래너 도시·숙소 검색 필드 1벌 (InputStep 슬림화 = §0 700줄 가드).
//   플랫폼 분기: iOS·웹 = 구글 위젯 인라인(기존 그대로 = §2 작동하는 것 안 건드림) /
//   AOS = 대리칸 → 전체화면 그릇(FullscreenPlaceSearch = 숙소 변경과 같은 부품 1벌)
//   — Android 15+ 는 키보드가 떠도 창을 안 줄여(edge-to-edge) 인라인 위젯이 깔린다(A36 실측 2026-08-12).
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

import { Fonts } from "@/constants/theme";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection,
} from "@/components/PlaceAutocompleteWidget";
import FullscreenPlaceSearch from "@/components/FullscreenPlaceSearch";

type Props = {
  placeholder: string;
  language: string;
  destination?: string;
  accommodationName?: string;
  onSelect: (place: PlaceAutoSelection) => void;
};

export default function PlaceSearchField({
  placeholder,
  language,
  destination,
  accommodationName,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const cityPrefix = destination ? `${destination} ` : undefined;

  if (Platform.OS !== "android") {
    return (
      <PlaceAutocompleteWidget
        placeholder={placeholder}
        language={language}
        cityPrefix={cityPrefix}
        onSelect={onSelect}
      />
    );
  }
  return (
    <>
      <Pressable
        style={styles.proxy}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="숙소·도시 검색"
      >
        <Text
          style={[styles.proxyText, !accommodationName && styles.proxyEmpty]}
          numberOfLines={1}
        >
          {accommodationName || placeholder}
        </Text>
      </Pressable>
      <FullscreenPlaceSearch
        visible={open}
        title="숙소·도시 검색"
        placeholder={placeholder}
        language={language}
        cityPrefix={cityPrefix}
        onSelect={(place) => {
          onSelect(place);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// 대리칸 겉모습 = 구글 위젯 입력칸 규격 1벌(위젯 로딩판과 동일 톤)
const styles = StyleSheet.create({
  proxy: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  proxyText: { fontSize: 13, fontFamily: Fonts.medium, color: "#0F172A" },
  proxyEmpty: { color: "#94A3B8" },
});
