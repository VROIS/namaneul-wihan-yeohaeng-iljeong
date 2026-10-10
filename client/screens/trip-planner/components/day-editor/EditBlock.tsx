import React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Brand } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { resultStyles } from "../../styles/result";
import SlotThumbnail from "../SlotThumbnail";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { PX_PER_MIN, STEP_MIN, type EditSlot } from "./edit-layout";
import { useDragHandle } from "./useDragHandle";
import { editStyles as es, LEFT_COL, RULER_W } from "./editor-styles";

const noTouchScroll: any =
  Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : null;

export default function EditBlock({
  index,
  slot,
  top,
  startText,
  dragging,
  theme,
  t,
  onRemove,
  onResize,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
  onGesture,
}: {
  index: number;
  slot: EditSlot;
  top: number;
  startText: string;
  dragging: boolean;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
  onRemove: (i: number) => void;
  onResize: (i: number, stay: number) => void;
  onReorderStart: (id: string) => void;
  onReorderMove: (id: string, dy: number) => void;
  onReorderEnd: () => void;
  onGesture: (active: boolean) => void;
}) {
  const place = slot.place;
  const isMealSlot = place.isMealSlot === true;
  const height = slot.stay * PX_PER_MIN;
  const baseStay = React.useRef(slot.stay);

  const resize = useDragHandle({
    onStart: () => {
      baseStay.current = slot.stay;
      onGesture(true);
    },
    onMove: (dy) =>
      onResize(
        index,
        baseStay.current + Math.round(dy / PX_PER_MIN / STEP_MIN) * STEP_MIN,
      ),
    onEnd: () => onGesture(false),
  });
  const reorder = useDragHandle({
    onStart: () => {
      onReorderStart(String(place.id));
      onGesture(true);
    },
    onMove: (dy) => onReorderMove(String(place.id), dy),
    onEnd: () => {
      onReorderEnd();
      onGesture(false);
    },
  });

  return (
    <View
      style={[
        es.block,
        { top, height, right: RULER_W },
        dragging && es.blockDragging,
      ]}
    >
      <View style={[es.numberCol, { width: LEFT_COL }]}>
        <View
          style={[
            resultStyles.placeNumber,
            { backgroundColor: isMealSlot ? "#FF6B35" : Brand.primary },
          ]}
        >
          <Text style={resultStyles.placeNumberText}>{index + 1}</Text>
        </View>
      </View>
      <View
        style={[
          es.card,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: theme.border,
            borderLeftWidth: isMealSlot ? 3 : 1,
            borderLeftColor: isMealSlot ? "#FF6B35" : theme.border,
          },
        ]}
      >
        <View style={[es.grip, noTouchScroll]} {...reorder}>
          <View style={[es.gripBar, { backgroundColor: theme.textTertiary }]} />
          <View style={[es.gripBar, { backgroundColor: theme.textTertiary }]} />
          <View style={[es.gripBar, { backgroundColor: theme.textTertiary }]} />
        </View>
        <View style={resultStyles.placeThumbnail}>
          <SlotThumbnail
            place={place}
            isMealSlot={isMealSlot}
            isMeal={!!place.isMeal}
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
            {startText} · {t("trip.durationM", { m: slot.stay })}
          </Text>
        </View>
        <Pressable
          style={es.removeBtn}
          onPress={() => onRemove(index)}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Icon name="x" size={14} color="#FFFFFF" />
        </Pressable>
        <View style={[es.resizeHit, noTouchScroll]} {...resize}>
          <View style={[es.resizeBar, { backgroundColor: Brand.primary }]} />
        </View>
      </View>
    </View>
  );
}
