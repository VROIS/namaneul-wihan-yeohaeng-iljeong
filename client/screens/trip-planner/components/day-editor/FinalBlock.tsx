import React from "react";
import { View, Text, Pressable } from "react-native";
import { Icon } from "@/components/Icon";
import { resultStyles } from "../../styles/result";
import SlotThumbnail from "../SlotThumbnail";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import {
  editStyles as es,
  LEFT_COL,
  RED,
  RULER_W,
  noTouch,
} from "./editor-styles";

// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = BTS 날의 마지막 슬롯(공연장) = 공연 시작 시각에 고정 · 지우기 · 끌기 · 길이 조절 없음 · 길게 누르면 전체 편집 모드로 들어가고 편집 중 톡 누르면 끝난다 (정본 §)
export default function FinalBlock({
  place,
  top,
  height,
  startText,
  stay,
  late,
  theme,
  t,
  editMode,
  onEnterEdit,
  onExitEdit,
}: {
  place: any;
  top: number;
  height: number;
  startText: string;
  stay: number;
  late: number;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
  editMode: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
}) {
  return (
    <View style={[es.block, { top, height, right: RULER_W }]}>
      <View style={[es.numberCol, { width: LEFT_COL }, noTouch]}>
        <View
          style={[
            resultStyles.placeNumber,
            { backgroundColor: theme.textSecondary },
          ]}
        >
          <Icon name="lock" size={16} color="#FFFFFF" />
        </View>
      </View>
      <Pressable
        style={[
          es.card,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: theme.border,
            paddingLeft: 8,
          },
        ]}
        onLongPress={onEnterEdit}
        onPress={editMode ? onExitEdit : undefined}
        delayLongPress={500}
      >
        <View style={resultStyles.placeThumbnail}>
          <SlotThumbnail
            place={place}
            isMealSlot={false}
            isMeal={false}
            theme={theme}
            t={t}
          />
        </View>
        <View style={es.textCol}>
          <Text
            style={[es.name, { color: theme.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {place.nameEn || place.nameLocal || place.name}
          </Text>
          <Text style={[es.meta, { color: theme.textSecondary }]}>
            {startText} · {t("trip.durationM", { m: stay })}
          </Text>
          {late > 0 && (
            <Text style={[es.meta, { color: RED }]}>
              {t("trip.editLate", { m: late })}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}
