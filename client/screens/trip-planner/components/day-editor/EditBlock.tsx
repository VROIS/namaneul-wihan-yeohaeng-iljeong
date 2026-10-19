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
import { isMealPlace, slotPriceLabel } from "../slot-price";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { cardHeight, PX_PER_MIN, STEP_MIN, type EditSlot } from "./edit-layout";
import { useDragHandle } from "./useDragHandle";
import {
  editStyles as es,
  CARD_PAD_V,
  LEFT_COL,
  META_H,
  NAME_H,
  SUMMARY_LINE,
  SUMMARY_MAX_LINES,
  RULER_W,
  noSelect,
  noTouch,
  noTouchScroll,
} from "./editor-styles";

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 슬롯 = 길게 누른 카드 하나만 편집(그 카드만 흔들림 + ✕ · 이동 · 늘리기 · 톡 누르면 끝) · 식사 칸 = ✕ 대신 체크 아이콘 = 편집 해제만(보관함 안 감 · 그 날 안에서만 이동) · 카드 = 요약 슬롯 = 장소 이름 → 시각·체류 · 가격 → 한줄요약 최대 2줄을 시간 비례 높이 안에 위부터(잘려도 됨) (정본 §)
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
  const height = cardHeight(slot.stay);
  const mainName = place.nameEn || place.nameLocal || place.name;
  const priceLabel = slotPriceLabel(place, isMealPlace(place), t);
  const inner = height - CARD_PAD_V;
  const summaryLines = place.editorialSummary
    ? Math.min(
        SUMMARY_MAX_LINES,
        Math.max(0, Math.floor((inner - NAME_H - META_H) / SUMMARY_LINE)),
      )
    : 0;
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
              {mainName}
            </Text>
            <View style={es.metaRow}>
              <Text
                style={[es.metaTime, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {startText} · {t("trip.durationM", { m: slot.stay })}
              </Text>
              {priceLabel != null && (
                <Text
                  style={[es.meta, { color: Brand.primary }]}
                  numberOfLines={1}
                >
                  {priceLabel}
                </Text>
              )}
            </View>
            {summaryLines > 0 && (
              <Text
                style={[es.summary, { color: theme.textSecondary }]}
                numberOfLines={summaryLines}
              >
                {place.editorialSummary}
              </Text>
            )}
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
                  if (isMealSlot) onExitEdit();
                  else onRemove(index);
                }}
                accessibilityRole="button"
                accessibilityLabel={t(
                  isMealSlot ? "trip.editDone" : "trip.editRemoved",
                )}
              >
                <View
                  style={[
                    es.removeDot,
                    isMealSlot && { backgroundColor: Brand.primary },
                  ]}
                >
                  <Icon
                    name={isMealSlot ? "check" : "x"}
                    size={14}
                    color="#FFFFFF"
                  />
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
