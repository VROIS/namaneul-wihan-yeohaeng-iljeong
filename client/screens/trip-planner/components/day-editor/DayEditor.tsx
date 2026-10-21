import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { DraxProvider, DraxScrollView, DraxView } from "react-native-drax";
import { Brand, Spacing } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { displayCityName } from "@/lib/display-city-name";
import { haptic } from "@/screens/bts/place-cart/utils";
import type { DayPlan } from "@/types/trip";
import { resultStyles } from "../../styles/result";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import EditBlock from "./EditBlock";
import FinalBlock from "./FinalBlock";
import { toHm } from "@shared/day-retime";
import {
  cardHeight,
  LONG_PRESS_MS,
  minutesAtPx,
  MOVE_MIN_H,
  PX_PER_MIN,
  STEP_MIN,
  timeAxis,
  type EditSlot,
} from "./edit-layout";
import {
  editStyles as es,
  RED,
  RULER_W,
  noSelect,
  noTouch,
  noTouchScroll,
} from "./editor-styles";
import { editStartLabel } from "./start-label";
import type { TripEditApi } from "./useTripEdit";
import { useDragHandle } from "./useDragHandle";
import { TrayStrip, TrayPlacard, type TrayDrag } from "./TrayStrip";

// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 여정 수정 화면 = 위 고정 영역(Day 줄 · 출발 줄 · 보관함 줄 = 후보 전체 + 뺀 것) + 시간표 · 슬롯은 길게 누르면 그 하나만 흔들림 → 끌어 옮기기(슬롯 사이 어디든 · 보관함에 놓으면 빠짐 · 삭제 없음) · 동작 뒤 한 번 더 누르거나 빈 곳을 누르면 흔들림 끝 · 끌기 1벌 = react-native-drax(시간표 = 받는 곳 · 가장자리 자동 스크롤) · 오른쪽 시간 눈금 = 룰렛 바퀴 (정본 §)
const WHEEL_ID = "__wheel__";
const PAD_TOP = Spacing.lg;

export default function DayEditor({
  planner,
  day,
  ed,
}: {
  planner: PlannerApi;
  day: DayPlan;
  ed: TripEditApi;
}) {
  const {
    theme,
    t,
    i18n,
    insets,
    itinerary,
    dayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    handleSetDayAccommodation,
    isReoptimizing,
    setEditingDay,
  } = planner;
  const [selId, setSelId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EditSlot | null>(null);
  const [trayAtLift, setTrayAtLift] = useState<EditSlot[] | null>(null);
  const selRef = useRef(selId);
  selRef.current = selId;
  const editMode = selId !== null;
  const wheelBase = useRef({
    start: 0,
    end: 0,
    shift: 0,
    yOf: (m: number) => m,
  });
  const exitEdit = () => {
    haptic("light");
    setSelId(null);
  };

  const { starts, moves, lastEnd } = ed.layout;
  const viewEnd = Math.max(ed.endMin + ed.finalLen, lastEnd) + 30;
  const yOf = timeAxis(ed.slots, starts, ed.startMin);
  const contentH = yOf(viewEnd);
  const idOf = (s: EditSlot) => String(s.place.id);

  // 놓일 자리 = 편집 순서에서 가운데가 기준보다 위인 칸 수 · 화면에 안 보이는 칸(4시간 이상 장소가 있어 빠진 점심)은 바로 앞 칸과 같은 자리로 센다
  const slotsAbove = (center: number, exceptId: string) => {
    const mid = new Map(
      ed.slots.map((s, i) => [
        idOf(s),
        yOf(starts[i]) + cardHeight(s.stay) / 2,
      ]),
    );
    let prev = -Infinity;
    let n = 0;
    for (const s of ed.actsRef.current) {
      if (idOf(s) === exceptId) continue;
      prev = mid.get(idOf(s)) ?? prev;
      if (prev < center) n++;
    }
    return n;
  };
  const onSelect = (id: string, drag: boolean) => {
    const was = selRef.current === id;
    setSelId(id);
    if (drag) setDragId(id);
    return was;
  };
  const onRelease = (id: string, wasSelected: boolean, moved: boolean) => {
    setDragId(null);
    if (wasSelected && !moved) exitEdit();
  };
  type Payload =
    | { kind: "slot"; id: string }
    | { kind: "tray"; slot: EditSlot };
  // y = 끌고 있는 카드의 가운데(받는 곳 기준 · drax 가 주는 값)
  const overTimeline = (p: Payload, y: number) => {
    const id = p.kind === "slot" ? p.id : idOf(p.slot);
    const cur = ed.actsRef.current.findIndex((s) => idOf(s) === id);
    const target = slotsAbove(y, id);
    if (p.kind === "slot") {
      if (cur >= 0 && target !== cur) ed.moveSlot(cur, target);
      return;
    }
    if (cur !== target) ed.placeAt(target, p.slot);
  };
  const trayDrag: TrayDrag = {
    onLift: (slot) => {
      haptic("medium");
      setTrayAtLift(ed.tray);
      setDragId(idOf(slot));
    },
    // 시간표에 놓으면 그 자리에 남고(보관함에서 빠짐) · 다른 곳에 놓으면 보관함 그대로
    onEnd: (slot, dropped) => {
      const id = idOf(slot);
      if (dropped && ed.actsRef.current.some((s) => idOf(s) === id))
        ed.dropIn(id);
      else ed.takeOut(id);
      setTrayAtLift(null);
      setPreview(null);
      setDragId(null);
      haptic("light");
    },
  };

  const wheel = useDragHandle({
    slop: 4,
    onStart: () => {
      wheelBase.current = {
        start: ed.startMin,
        end: ed.endMin,
        shift: 0,
        yOf,
      };
    },
    onMove: (dy) => {
      const base = wheelBase.current;
      const shift = ed.shiftWindow(
        base,
        -Math.round(minutesAtPx(base.yOf, base.start, dy) / STEP_MIN) *
          STEP_MIN,
      );
      if (shift !== base.shift) {
        base.shift = shift;
        haptic("light");
      }
    },
    onEnd: () => haptic("light"),
    onTap: exitEdit,
  });

  const firstHour = Math.ceil(ed.startMin / 60);
  const lastHour = Math.floor(viewEnd / 60);
  const hours: number[] = [];
  for (let h = firstHour; h <= lastHour; h++) hours.push(h);

  return (
    <DraxProvider style={es.root}>
      <View
        style={[
          es.root,
          { backgroundColor: theme.backgroundRoot, paddingTop: insets.top },
        ]}
      >
        <View style={es.fixedBar}>
          <View
            style={[
              resultStyles.dayHeaderBanner,
              { backgroundColor: `${Brand.primary}12`, marginTop: 0 },
            ]}
          >
            <ScrollView
              horizontal
              style={{ flex: 1 }}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: Spacing.xs }}
            >
              {(itinerary?.days || []).map((d) => {
                const on = d.day === day.day;
                return (
                  <Pressable
                    key={d.day}
                    style={[
                      resultStyles.dayHeaderBadge,
                      {
                        backgroundColor: on
                          ? Brand.primary
                          : theme.backgroundSecondary,
                      },
                    ]}
                    onPress={() => !on && !ed.saving && setEditingDay(d.day)}
                    accessibilityRole="tab"
                    aria-selected={on}
                  >
                    <Text
                      style={[
                        resultStyles.dayHeaderBadgeText,
                        !on && { color: theme.textSecondary },
                      ]}
                    >
                      Day {d.day}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[es.ghostBtn, { borderColor: theme.border }]}
              onPress={ed.cancel}
              disabled={ed.saving}
            >
              <Text style={[es.ghostBtnText, { color: theme.textSecondary }]}>
                {t("common.cancel")}
              </Text>
            </Pressable>
            <Pressable
              style={[es.primaryBtn, { opacity: ed.ready ? 1 : 0.4 }]}
              onPress={ed.commit}
              disabled={ed.saving || !ed.ready}
            >
              {ed.saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={es.primaryBtnText}>{t("trip.editDone")}</Text>
              )}
            </Pressable>
          </View>

          <View style={[es.startRow, { borderBottomColor: theme.border }]}>
            <Icon name="home" size={14} color={Brand.primary} />
            <Text
              style={[es.startName, { color: theme.text }]}
              numberOfLines={1}
            >
              {editStartLabel(
                day,
                dayAccommodations,
                displayCityName(itinerary!),
                t,
              )}
            </Text>
            <Text style={[es.startTime, { color: theme.textSecondary }]}>
              {toHm(ed.startMin)}
            </Text>
            <View style={{ flex: 1 }} />
            {!ed.final && (
              <Pressable
                style={[es.ghostBtn, { borderColor: Brand.primary }]}
                onPress={() => setHotelModalDay(day.day)}
              >
                <Text style={[es.ghostBtnText, { color: Brand.primary }]}>
                  {t("trip.accommodationSet")}
                </Text>
              </Pressable>
            )}
          </View>

          {Platform.OS === "web" && hotelModalDay === day.day && (
            <View style={{ marginHorizontal: 12, marginBottom: 8, zIndex: 50 }}>
              <PlaceAutocompleteWidget
                placeholder={t("trip.hotelSearchPlaceholder")}
                language={i18n.language || "ko"}
                cityPrefix={
                  itinerary?.destination
                    ? `${itinerary.destination} `
                    : undefined
                }
                onSelect={(place: PlaceSelection) => {
                  handleSetDayAccommodation(day.day, place);
                  setHotelModalDay(null);
                }}
              />
            </View>
          )}

          <TrayStrip
            tray={trayAtLift ?? ed.tray}
            preview={preview}
            setPreview={setPreview}
            drag={trayDrag}
            onDropSlot={(id) => {
              ed.removeById(id);
              setSelId(null);
            }}
            theme={theme}
            t={t}
          />
        </View>

        <DraxScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: PAD_TOP,
            paddingBottom: insets.bottom + 96,
          }}
        >
          {isReoptimizing && (
            <ActivityIndicator size="small" color={Brand.primary} />
          )}
          <DraxView
            style={{ height: contentH }}
            receptive
            onReceiveDragOver={({ dragged, receiver }) =>
              overTimeline(dragged.payload as Payload, receiver.receiveOffset.y)
            }
            onReceiveDragExit={({ dragged }) => {
              const p = dragged.payload as Payload;
              if (p.kind === "tray") ed.takeOut(idOf(p.slot));
            }}
          >
            {editMode && (
              <Pressable style={StyleSheet.absoluteFill} onPress={exitEdit} />
            )}
            {hours.map((h) => (
              <React.Fragment key={h}>
                <View
                  style={[
                    es.hourLine,
                    {
                      top: yOf(h * 60),
                      right: RULER_W,
                      backgroundColor: theme.border,
                    },
                  ]}
                />
                <Text
                  style={[
                    es.hourLabel,
                    { top: yOf(h * 60) - 7, color: theme.textTertiary },
                  ]}
                >
                  {toHm(h * 60)}
                </Text>
              </React.Fragment>
            ))}

            {ed.slots.map((s, i) => {
              const prevEnd =
                i === 0 ? ed.startMin : starts[i - 1] + ed.slots[i - 1].stay;
              const h = yOf(starts[i]) - yOf(prevEnd);
              return (
                <View
                  key={`mv-${idOf(s)}`}
                  style={[
                    es.move,
                    {
                      top: yOf(prevEnd),
                      height: Math.max(h, 4),
                      right: RULER_W,
                      backgroundColor: theme.backgroundSecondary,
                    },
                    noTouch,
                  ]}
                >
                  {h >= MOVE_MIN_H && (
                    <Text style={[es.moveText, { color: theme.textTertiary }]}>
                      {t("trip.durationM", { m: moves[i] })}
                    </Text>
                  )}
                </View>
              );
            })}

            {/* 그리는 순서는 고정(아이디 순) · 자리는 top 으로만 = 끄는 중 DOM 노드가 옮겨지면 포인터가 끊긴다 */}
            {ed.slots
              .map((s, i) => ({ s, i }))
              .sort((a, b) => (idOf(a.s) < idOf(b.s) ? -1 : 1))
              .map(({ s, i }) => {
                const id = idOf(s);
                const fixedMeal = s.place.isMealSlot === true && ed.autoMeals;
                return (
                  <EditBlock
                    key={id}
                    index={i}
                    slot={s}
                    top={yOf(starts[i])}
                    startText={toHm(starts[i])}
                    dragging={dragId === id}
                    editMode={selId === id}
                    draggable={!fixedMeal}
                    theme={theme}
                    t={t}
                    onResize={ed.setStay}
                    onSelect={onSelect}
                    onRelease={onRelease}
                  />
                );
              })}

            {ed.final && (
              <>
                <View
                  style={[
                    es.move,
                    {
                      top: yOf(ed.layout.lastEnd),
                      height: Math.max(ed.layout.finalMove * PX_PER_MIN, 4),
                      right: RULER_W,
                      backgroundColor: theme.backgroundSecondary,
                    },
                    noTouch,
                  ]}
                >
                  {ed.layout.finalMove * PX_PER_MIN >= MOVE_MIN_H && (
                    <Text style={[es.moveText, { color: theme.textTertiary }]}>
                      {t("trip.durationM", { m: ed.layout.finalMove })}
                    </Text>
                  )}
                </View>
                <FinalBlock
                  place={ed.final}
                  top={yOf(ed.endMin)}
                  height={ed.finalLen * PX_PER_MIN}
                  startText={toHm(ed.endMin)}
                  stay={ed.finalLen}
                  late={Math.max(0, ed.layout.arrival - ed.endMin)}
                  theme={theme}
                  t={t}
                  editMode={editMode}
                  onEnterEdit={() => {
                    haptic("medium");
                    setSelId(WHEEL_ID);
                  }}
                  onExitEdit={exitEdit}
                />
              </>
            )}

            <View
              style={[
                es.endLine,
                { top: yOf(ed.endMin), right: RULER_W, backgroundColor: RED },
              ]}
            />
            {!ed.final && (
              <Text
                style={[es.endText, { top: yOf(ed.endMin) - 15, color: RED }]}
              >
                {t("trip.editEnd", { time: toHm(ed.endMin) })}
              </Text>
            )}
            {selId === WHEEL_ID ? (
              <View
                style={[
                  es.wheel,
                  { backgroundColor: `${Brand.primary}14` },
                  noTouchScroll,
                ]}
                {...wheel}
              />
            ) : (
              <Pressable
                style={[es.wheel, noSelect]}
                onLongPress={() => {
                  haptic("medium");
                  setSelId(WHEEL_ID);
                }}
                onPress={() => editMode && exitEdit()}
                delayLongPress={LONG_PRESS_MS}
              />
            )}
          </DraxView>
        </DraxScrollView>

        {preview && (
          <TrayPlacard
            slot={preview}
            onClose={() => setPreview(null)}
            drag={trayDrag}
            theme={theme}
            t={t}
          />
        )}
      </View>
      {/* 들어올 때마다 = 이 화면에서 할 수 있는 일 한눈에 · 아무 곳이나 누르면 사라짐 */}
      {ed.hint && (
        <Pressable
          style={es.hintWrap}
          onPress={ed.hideHint}
          accessibilityRole="button"
          accessibilityLabel={t("trip.editHowTo")}
        >
          <Text style={es.hintText}>{t("trip.editHowTo")}</Text>
        </Pressable>
      )}
    </DraxProvider>
  );
}
