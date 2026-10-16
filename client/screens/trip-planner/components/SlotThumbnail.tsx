import React from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { SvgXml } from "react-native-svg";
import { resolveImageSource } from "@/lib/wikimedia-image";
import {
  COLORS as BTS_MARKER_COLORS,
  LUCIDE as BTS_MARKER_LUCIDE,
} from "@/components/bts/bts-marker-svg";
import { Icon } from "@/components/Icon";
import { resultStyles as styles } from "../styles/result";
import type { PlannerApi } from "../hooks/useTripPlanner";

const PLACEHOLDER_SVG_BY_CAT: Record<string, string> = Object.fromEntries(
  Object.keys(BTS_MARKER_LUCIDE).map((cat) => [
    cat,
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="${BTS_MARKER_COLORS[cat] || "#666"}" stroke="white" stroke-width="3"/><g transform="translate(10,10) scale(0.8333)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BTS_MARKER_LUCIDE[cat]}</g></svg>`,
  ]),
);

// ⚠️ 수정금지(승인필요) 2026-10-09 사장님 결정 = 슬롯 썸네일 1벌(여정 슬롯 · 수정 화면 공용) (정본 §)
export default function SlotThumbnail({
  place,
  isMealSlot,
  isMeal,
  theme,
  t,
  size = 48,
}: {
  place: any;
  isMealSlot: boolean;
  isMeal: boolean;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
  size?: number;
}) {
  const box = size === 48 ? null : { width: size, height: size };
  if (place.image) {
    return (
      <Image
        source={resolveImageSource(place.image, "card")}
        style={[styles.placeThumbnailImage, box]}
        contentFit="cover"
        priority="normal"
        cachePolicy="memory-disk"
        transition={150}
      />
    );
  }
  const cat =
    place.slotCategory ||
    place.seedCategory ||
    (isMealSlot || isMeal ? "restaurant" : null);
  const svg = cat ? PLACEHOLDER_SVG_BY_CAT[cat] : null;
  return (
    <View
      style={[
        styles.placeThumbnailPlaceholder,
        box,
        {
          backgroundColor: isMealSlot ? "#FFF5F0" : theme.backgroundSecondary,
        },
      ]}
    >
      {svg ? (
        <SvgXml xml={svg} width={30} height={30} />
      ) : (
        <Icon
          name={isMealSlot || isMeal ? "coffee" : "map-pin"}
          size={20}
          color={isMealSlot ? "#FF6B35" : theme.textTertiary}
        />
      )}
      {size === 48 && (
        <Text
          style={{
            fontSize: 8,
            lineHeight: 10,
            marginTop: 1,
            color: theme.textTertiary,
          }}
        >
          {t("trip.googleMapsInfo")}
        </Text>
      )}
    </View>
  );
}
