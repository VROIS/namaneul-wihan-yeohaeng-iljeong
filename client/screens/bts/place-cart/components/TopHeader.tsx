// 상단 고정존(뒤로가기 + 언어 스위치 + 도시 버튼행) = BTSPlaceCartScreen 분리(2026-07-16 §0 슬림화, 순수 이동)
import React from "react";
import { View, Text, Pressable, StyleSheet, Switch } from "react-native";
import { BlurView } from "expo-blur";

import type { BTSCity } from "@/contexts/BTSContext";
import LiquidButton from "@/components/ui/LiquidButton";
import { localizedName } from "../utils";
import { styles } from "../styles";

// ⚠️ 수정금지(승인필요) — 2026-04-22 Part B: 상단 고정존 (뒤로가기 + 도시 버튼). 여기까지만 고정, 이하 전부 스크롤
// ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: 우측 상단 언어 스위치 (iOS 스타일). back 반대 위치. Screen 4 부터 노출.
export default function TopHeader({
  insetsTop,
  tint,
  isKorean,
  onBack,
  onLangToggle,
  backLabel,
  cityButtons,
  selectedCityId,
  onCityPick,
}: {
  insetsTop: number;
  tint: string;
  isKorean: boolean;
  onBack: () => void;
  onLangToggle: (toKo: boolean) => void;
  backLabel: string;
  cityButtons: BTSCity[];
  selectedCityId: number | undefined;
  onCityPick: (city: BTSCity) => void;
}) {
  return (
    <View>
      <View style={[styles.backRow, { paddingTop: insetsTop + 4 }]}>
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          accessibilityLabel={backLabel}
        >
          <BlurView
            intensity={40}
            tint="light"
            style={StyleSheet.absoluteFillObject}
          />
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(255,255,255,0.3)" },
            ]}
          />
          <Text style={styles.backText}>←</Text>
        </Pressable>

        {/* ⚠️ 수정금지(승인필요) — 2026-04-24 Track 5b: 언어 스위치. EN ○─ 한. RN built-in Switch 재사용 (새 컴포넌트/라이브러리 0). */}
        <View style={styles.langSwitchWrap}>
          <Text
            style={[
              styles.langLabel,
              !isKorean && { color: tint, fontWeight: "800" },
            ]}
          >
            EN
          </Text>
          <Switch
            value={isKorean}
            onValueChange={onLangToggle}
            trackColor={{ false: "#D0D0D0", true: tint }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#D0D0D0"
            style={styles.langSwitch}
          />
          <Text
            style={[
              styles.langLabel,
              isKorean && { color: tint, fontWeight: "800" },
            ]}
          >
            한
          </Text>
        </View>
      </View>

      <View style={styles.cityRow}>
        {cityButtons.map((city) => (
          <LiquidButton
            key={city.id}
            label={localizedName(city, isKorean)}
            size="md"
            flex={1}
            tint={tint}
            variant={selectedCityId === city.id ? "selected" : "default"}
            onPress={() => onCityPick(city)}
          />
        ))}
      </View>
    </View>
  );
}
