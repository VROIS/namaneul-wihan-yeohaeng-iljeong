import React from "react";
import { Animated, View, Text, Platform, Pressable } from "react-native";
import { Brand } from "@/constants/theme";
import { haptic } from "@/screens/bts/place-cart/utils";
import { resultStyles } from "../../styles/result";
import SlotThumbnail from "../SlotThumbnail";
import { isMealPlace, slotPriceLabel } from "../slot-price";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import {
  cardHeight,
  LONG_PRESS_MS,
  PX_PER_MIN,
  STEP_MIN,
  type EditSlot,
} from "./edit-layout";
import { useDragHandle } from "./useDragHandle";
import DragSource from "./DragSource";
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

// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 슬롯 = 길게(0.5초) 누르면 그 카드 하나만 흔들림 = 옮기기·늘리기 가능 상태 → 흔들리는 카드는 바로 끌림 · 동작이 끝난 뒤 한 번 더 누르면 흔들림 끝 · 끌기 = react-native-drax(보관함에 놓으면 빠짐 · ✕ 없음) · 늘리기(아래 바) = 30분 단위 · 인기 명소 여정의 식사 칸 = 자리 고정(끌기 없음) · 길이만 조절 · "점심/저녁" 글자 + 안내 한 줄 · 카드 = 이름 → 시각·체류 · 가격 → 한줄요약 최대 2줄 (정본 §)
export default function EditBlock({
  index,
  slot,
  top,
  startText,
  dragging,
  editMode,
  draggable,
  theme,
  t,
  onResize,
  onSelect,
  onRelease,
}: {
  index: number;
  slot: EditSlot;
  top: number;
  startText: string;
  dragging: boolean;
  editMode: boolean;
  draggable: boolean;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
  onResize: (id: string, stay: number) => void;
  onSelect: (id: string, drag: boolean) => boolean;
  onRelease: (id: string, wasSelected: boolean, moved: boolean) => void;
}) {
  const place = slot.place;
  const isMealSlot = place.isMealSlot === true;
  const estimateMeal = isMealSlot && !(place.nameEn || place.name);
  const height = cardHeight(slot.stay);
  const mainName = estimateMeal
    ? t(place.mealType === "dinner" ? "trip.mealDinner" : "trip.mealLunch")
    : place.nameEn || place.nameLocal || place.name;
  const priceLabel = estimateMeal
    ? t("trip.mealEstimateNote")
    : slotPriceLabel(place, isMealPlace(place), t);
  const summary = estimateMeal ? null : place.editorialSummary;
  const inner = height - CARD_PAD_V;
  const summaryLines = summary
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
    slop: 4,
    onStart: () => {
      baseStay.current = slot.stay;
    },
    onMove: (dy) =>
      onResize(
        String(place.id),
        baseStay.current + Math.round(dy / PX_PER_MIN / STEP_MIN) * STEP_MIN,
      ),
    onEnd: () => haptic("light"),
    onTap: () => tapOff(),
  });

  const card = (
    <View
      style={[
        es.card,
        noSelect,
        {
          backgroundColor: theme.backgroundDefault,
          borderColor: editMode ? Brand.primary : theme.border,
          borderLeftWidth: isMealSlot ? 3 : 1,
          borderLeftColor: isMealSlot ? "#FF6B35" : theme.border,
        },
      ]}
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
            <Text style={[es.meta, { color: Brand.primary }]} numberOfLines={1}>
              {priceLabel}
            </Text>
          )}
        </View>
        {summaryLines > 0 && (
          <Text
            style={[es.summary, { color: theme.textSecondary }]}
            numberOfLines={summaryLines}
          >
            {summary}
          </Text>
        )}
      </View>
    </View>
  );
  const id = String(place.id);
  const wasSel = React.useRef(false);
  const lastDrag = React.useRef(0);
  const payload = React.useMemo(() => ({ kind: "slot", id }), [id]);
  // 끄는 동안에는 누름 시간을 바꾸지 않는다(바꾸면 제스처가 새로 만들어져 끌기가 끊긴다)
  const [delay, setDelay] = React.useState(LONG_PRESS_MS);
  React.useEffect(() => {
    if (!dragging) setDelay(editMode ? 0 : LONG_PRESS_MS);
  }, [editMode, dragging]);
  // 흔들리는 카드를 한 번 더 톡 = 흔들림 끝(끌고 놓은 직후의 톡은 무시)
  const tapOff = () =>
    editMode &&
    Date.now() - lastDrag.current > 400 &&
    onRelease(id, true, false);

  return (
    <View style={[es.block, { top, height, right: RULER_W }]}>
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
        <View
          style={[es.cardWrap, dragging && es.cardLifted]}
          pointerEvents={draggable ? "none" : "auto"}
        >
          {draggable ? (
            card
          ) : (
            <Pressable
              style={es.cardWrap}
              delayLongPress={LONG_PRESS_MS}
              onLongPress={() => {
                onSelect(id, false);
                haptic("medium");
              }}
              onPress={tapOff}
            >
              {card}
            </Pressable>
          )}
        </View>
        {draggable && (
          <DragSource
            style={es.dragHandle}
            payload={payload}
            delay={delay}
            onStart={() => {
              wasSel.current = onSelect(id, true);
              haptic("medium");
            }}
            onEnd={(moved) => {
              lastDrag.current = Date.now();
              onRelease(id, wasSel.current, moved);
            }}
            onTap={tapOff}
            hover={() => <View style={{ flex: 1 }}>{card}</View>}
          />
        )}
        {editMode && (
          <View
            style={[es.resizeHit, { left: LEFT_COL }, noTouchScroll]}
            {...resize}
          >
            <View style={[es.resizeBar, { backgroundColor: Brand.primary }]} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}
