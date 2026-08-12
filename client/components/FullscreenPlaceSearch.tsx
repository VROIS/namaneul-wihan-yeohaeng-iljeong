// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **전체화면 장소검색 그릇 1벌**(§0·§16).
//   유래 = 2026-07-02 iOS 전용 숙소 Modal(ResultStep)의 승격. 그때의 AOS 인라인 전제 폐기 = 2026-08-12 §19
//   — Android 15+(edge-to-edge 강제)는 키보드가 떠도 창을 안 줄여 인라인이 깔린다(A36 실기기 실측).
//   **폰(iOS+AOS 공용) = 이 전체화면 그릇**, 웹만 인라인으로 남긴다. 구글 위젯은 그대로 = 담는 그릇만 1벌.
//   사용처 = ResultStep(숙소 변경) + InputStep(도시·숙소 입력, AOS만). 새 사용처도 이 부품만 쓸 것(2벌 금지).
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Spacing } from "@/constants/theme";
import Icon from "@/components/Icon";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";

type Props = {
  visible: boolean;
  title: string;
  placeholder?: string;
  language?: string;
  cityPrefix?: string;
  onSelect: (place: PlaceSelection) => void;
  onClose: () => void;
};

export default function FullscreenPlaceSearch({
  visible,
  title,
  placeholder,
  language,
  cityPrefix,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const theme = Colors[useColorScheme() ?? "light"];
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: insets.top + Spacing.sm,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Icon name="x" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <View style={styles.headerButton} />
        </View>
        {/* 입력창 = 화면 최상단 = 후보 목록이 키보드 위 공간에 그대로 펼쳐진다(iOS에서 검증된 배치). */}
        <View style={styles.widgetBox}>
          <PlaceAutocompleteWidget
            placeholder={placeholder}
            language={language}
            cityPrefix={cityPrefix}
            onSelect={onSelect}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "600" },
  widgetBox: { marginHorizontal: 12, marginTop: 8, zIndex: 50 },
});
