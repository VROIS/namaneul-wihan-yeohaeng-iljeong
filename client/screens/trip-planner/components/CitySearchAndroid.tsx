// ⌨️ 2026-08-13 사장님 확정 = AOS 숙소·도시 검색 = 돋보기 필드 → 독립 전체화면 모달.
import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import { Brand, Fonts } from "@/constants/theme";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";

type Props = {
  theme: { backgroundRoot: string; text: string };
  topInset: number;
  selectedName?: string;
  placeholder: string;
  language: string;
  cityPrefix?: string;
  onSelect: (place: PlaceSelection) => void;
};

export default function CitySearchAndroid({
  theme,
  topInset,
  selectedName,
  placeholder,
  language,
  cityPrefix,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      {/* 돋보기 필드 = 누르면 모달. 시각은 위젯 대기 입력칸과 동일 톤(F8FAFC·E2E8F0·14). */}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          minHeight: 48,
          backgroundColor: "#F8FAFC",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
        accessibilityRole="button"
        accessibilityLabel={t("trip.searchOpenA11y")}
      >
        <Icon name="search" size={16} color={Brand.primary} />
        <Text
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: Fonts.medium,
            color: selectedName ? "#0F172A" : "#94A3B8",
          }}
          numberOfLines={1}
        >
          {selectedName || placeholder}
        </Text>
      </Pressable>

      {open && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.backgroundRoot,
              paddingTop: topInset + 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                marginBottom: 4,
              }}
            >
              <Pressable
                onPress={() => setOpen(false)}
                style={{ padding: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t("trip.searchCloseA11y")}
              >
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <View style={{ marginHorizontal: 12, zIndex: 50 }}>
              <PlaceAutocompleteWidget
                placeholder={placeholder}
                language={language}
                height={360}
                cityPrefix={cityPrefix}
                onSelect={(place) => {
                  onSelect(place);
                  setOpen(false);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
