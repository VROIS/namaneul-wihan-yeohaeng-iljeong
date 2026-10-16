import React from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import { Brand } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import { haptic } from "@/screens/bts/place-cart/utils";
import { resultStyles } from "../../styles/result";
import SlotThumbnail from "../SlotThumbnail";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { PX_PER_MIN, STEP_MIN, type EditSlot } from "./edit-layout";
import { useDragHandle } from "./useDragHandle";
import {
  editStyles as es,
  LEFT_COL,
  RULER_W,
  noSelect,
  noTouch,
  noTouchScroll,
} from "./editor-styles";

// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 슬롯 = 폰 앱 아이콘 방식(평소 건드려도 안 바뀜 · 카드 어디나 길게 누르면 전체 편집 모드 · 흔들림 + ✕ · 이동 · 늘리기 · 톡 누르면 끝) (정본 §)
export default function EditBlock({
  index,
  slot,
  top,
  startText,
  dragging,
  editMode,
  theme,
  t,
  onRemove,
  onResize,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
  onEnterEdit,
  onExitEdit,
}: {
  index: number;
  slot: EditSlot;
  top: number;
  startText: string;
  dragging: boolean;
  editMode: boolean;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
  onRemove: (i: number) => void;
  onResize: (i: number, stay: number) => void;
  onReorderStart: (id: string) => void;
  onReorderMove: (id: string, dy: number) => void;
  onReorderEnd: () => void;
  onEnterEdit: () => void;
  onExitEdit: () => void;
}) {
  const place = slot.place;
  const isMealSlot = place.isMealSlot === true;
  const height = slot.stay * PX_PER_MIN;
  const baseStay = React.useRef(slot.stay);

  const wiggle = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!editMode || dragging) {
      wiggle.stopAnimation();
      wiggle.setValue(0);
      return;
    }
    const half = 110 + (index % 3) * 25;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, {
          toValue: 1,
          duration: half,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(wiggle, {
          toValue: -1,
          duration: half,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [editMode, dragging, index, wiggle]);
  const rotate = wiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-0.8deg", "0.8deg"],
  });

  const resize = useDragHandle({
    onStart: () => {
      baseStay.current = slot.stay;
    },
    onMove: (dy) =>
      onResize(
        index,
        baseStay.current + Math.round(dy / PX_PER_MIN / STEP_MIN) * STEP_MIN,
      ),
    onEnd: () => haptic("light"),
  });
  const reorder = useDragHandle({
    slop: 4,
    onStart: () => onReorderStart(String(place.id)),
    onMove: (dy) => onReorderMove(String(place.id), dy),
    onEnd: () => {
      onReorderEnd();
      haptic("light");
    },
    onTap: onExitEdit,
  });

  return (
    <View
      style={[
        es.block,
        { top, height, right: RULER_W },
        dragging && es.blockDragging,
      ]}
    >
      <Animated.View style={[es.blockInner, { transform: [{ rotate }] }]}>
        <View style={[es.numberCol, { width: LEFT_COL }, noTouch]}>
          <View
            style={[
              resultStyles.placeNumber,
              { backgroundColor: isMealSlot ? "#FF6B35" : Brand.primary },
            ]}
          >
            <Text style={resultStyles.placeNumberText}>{index + 1}</Text>
          </View>
        </View>
        <Pressable
          style={[
            es.card,
            noSelect,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
              borderLeftWidth: isMealSlot ? 3 : 1,
              borderLeftColor: isMealSlot ? "#FF6B35" : theme.border,
            },
          ]}
          onLongPress={onEnterEdit}
          delayLongPress={500}
          disabled={editMode}
        >
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
          {editMode && (
            <>
              <View
                style={[StyleSheet.absoluteFill, noTouchScroll]}
                {...reorder}
              />
              <Pressable
                style={es.removeBtn}
                onPress={() => {
                  haptic("light");
                  onRemove(index);
                }}
                accessibilityRole="button"
                accessibilityLabel={t("trip.editRemoved")}
              >
                <View style={es.removeDot}>
                  <Icon name="x" size={14} color="#FFFFFF" />
                </View>
              </Pressable>
              <View style={[es.resizeHit, noTouchScroll]} {...resize}>
                <View
                  style={[es.resizeBar, { backgroundColor: Brand.primary }]}
                />
              </View>
            </>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
