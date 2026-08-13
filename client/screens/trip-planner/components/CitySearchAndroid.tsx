// ⌨️ 2026-08-13 사장님 확정 = AOS 숙소·도시 검색 = 돋보기 필드 → 독립 전체화면 모달.
//   근본 = Android 15+ 가 "키보드만큼 화면축소"를 OS 차원에서 제거(구글 강제 edge-to-edge) + 시스템웹뷰 150 은
//   키보드 떠 있는 동안 웹뷰 크기가 바뀌면 내용을 지움(A36 실기기 실증) → 인라인 위젯은 키보드·앱화면에 깔려 사용 불가.
//   구조 = ResultStep 의 전체화면 숙소 Modal(2026-07-02 iOS 근본해결 검증본)과 같은 그릇. 구글 위젯 그대로 = 재발명 0(§16).
//   위젯 높이 고정(360) = 크기변경 0 = 지워질 계기 제거. iOS·웹 = InputStep 인라인 그대로(이 컴포넌트 미사용).
import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
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
        accessibilityLabel="숙소·도시 검색 열기"
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
                accessibilityLabel="검색 닫기"
              >
                <Icon name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <View style={{ marginHorizontal: 12, zIndex: 50 }}>
              <PlaceAutocompleteWidget
                placeholder={placeholder}
                language={language}
                // ⌨️ 높이 고정 = 웹뷰 크기변경 0 = "키보드 중 크기변경 = 내용 지움" 결함 회피 (2026-08-13)
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
