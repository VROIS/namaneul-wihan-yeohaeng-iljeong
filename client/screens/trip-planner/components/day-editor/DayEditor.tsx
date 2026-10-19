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
import { Brand, Fonts, Spacing } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import PlaceAutocompleteWidget, {
  type PlaceAutoSelection as PlaceSelection,
} from "@/components/PlaceAutocompleteWidget";
import { displayCityName } from "@/lib/display-city-name";
import { haptic } from "@/screens/bts/place-cart/utils";
import type { DayPlan } from "@/types/trip";
import { resultStyles } from "../../styles/result";
import SlotThumbnail from "../SlotThumbnail";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import EditBlock from "./EditBlock";
import FinalBlock from "./FinalBlock";
import { toHm } from "@shared/day-retime";
import {
  cardHeight,
  minutesAtPx,
  MOVE_MIN_H,
  PX_PER_MIN,
  STEP_MIN,
  timeAxis,
} from "./edit-layout";
import {
  editStyles as es,
  RED,
  RULER_W,
  TRAY_THUMB,
  noSelect,
  noTouch,
  noTouchScroll,
} from "./editor-styles";
import { editStartLabel } from "./start-label";
import type { TripEditApi } from "./useTripEdit";
import { useDragHandle } from "./useDragHandle";

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 여정 수정 화면 = 위 고정 영역(Day 1·2·3 줄 · 도시 이름 + 출발 줄 · 임시 보관함 줄(모든 날 공용 · 숫자 없음)) + 시간표 · 길게 누른 슬롯 하나만 편집(그 슬롯만 흔들림 + ✕ · 이동 · 늘리기 · 나머지는 그대로 · 스크롤 됨 · 톡 누르면 끝) · 오른쪽 시간 눈금 = 룰렛 바퀴(돌리면 하루 시간대 통째 이동) (정본 §)
const WHEEL_ID = "__wheel__";

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
  const editMode = selId !== null;
  const [drag, setDrag] = useState<{ id: string; top: number } | null>(null);
  const dragStart = useRef<{ id: string; top: number } | null>(null);
  const wheelBase = useRef({
    start: 0,
    end: 0,
    shift: 0,
    yOf: (m: number) => m,
  });
  const enterEdit = (id: string) => {
    if (selId === id) return;
    haptic("medium");
    setSelId(id);
  };
  const exitEdit = () => {
    haptic("light");
    setSelId(null);
  };

  const { starts, moves, lastEnd } = ed.layout;
  const viewEnd = Math.max(ed.endMin + ed.finalLen, lastEnd) + 30;
  const yOf = timeAxis(ed.slots, starts, ed.startMin);
  const contentH = yOf(viewEnd);

  const idxOf = (id: string) =>
    ed.slotsRef.current.findIndex((s) => String(s.place.id) === id);
  const onReorderStart = (id: string) => {
    const top = yOf(starts[idxOf(id)]);
    dragStart.current = { id, top };
    setDrag({ id, top });
  };
  const onReorderMove = (id: string, dy: number) => {
    const st = dragStart.current;
    const cur = idxOf(id);
    if (!st || cur < 0) return;
    const top = st.top + dy;
    const center = top + cardHeight(ed.slotsRef.current[cur].stay) / 2;
    let target = 0;
    ed.slotsRef.current.forEach((s, k) => {
      if (k === cur) return;
      if (yOf(starts[k]) + cardHeight(s.stay) / 2 < center) target++;
    });
    if (target !== cur) ed.moveSlot(cur, target);
    setDrag({ id, top });
  };
  const onReorderEnd = () => {
    dragStart.current = null;
    setDrag(null);
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
          <Text style={[es.startName, { color: theme.text }]} numberOfLines={1}>
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
                itinerary?.destination ? `${itinerary.destination} ` : undefined
              }
              onSelect={(place: PlaceSelection) => {
                handleSetDayAccommodation(day.day, place);
                setHotelModalDay(null);
              }}
            />
          </View>
        )}

        <View style={[es.tray, { borderBottomColor: theme.border }]}>
          <View style={es.trayLabel}>
            <Text style={[es.trayLabelText, { color: theme.textSecondary }]}>
              {t("trip.editBucket")}
            </Text>
          </View>
          {ed.removed.length === 0 ? (
            // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 지운 장소가 없을 때 띠 = 굵은 사용법 한 줄(길게 눌러 이동·삭제·시간 조절) (정본 §)
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: Fonts.bold,
                color: Brand.primary,
              }}
              numberOfLines={1}
            >
              {t("trip.editHowTo")}
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: Spacing.sm }}
            >
              {ed.removed.map((s, j) => (
                <Pressable
                  key={String(s.place.id)}
                  style={es.trayItem}
                  onPress={() => ed.restoreAt(j)}
                >
                  <SlotThumbnail
                    place={s.place}
                    isMealSlot={s.place.isMealSlot === true}
                    isMeal={!!s.place.isMeal}
                    theme={theme}
                    t={t}
                    size={TRAY_THUMB}
                  />
                  <View style={es.trayPlus}>
                    <Icon name="plus" size={12} color="#FFFFFF" />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!drag}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Spacing.lg,
          paddingBottom: insets.bottom + 96,
        }}
      >
        {isReoptimizing && (
          <ActivityIndicator size="small" color={Brand.primary} />
        )}
        <View style={{ height: contentH }}>
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
                key={`mv-${String(s.place.id)}`}
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

          {ed.slots.map((s, i) => (
            <EditBlock
              key={String(s.place.id)}
              index={i}
              slot={s}
              top={
                drag && drag.id === String(s.place.id)
                  ? drag.top
                  : yOf(starts[i])
              }
              startText={toHm(starts[i])}
              dragging={!!drag && drag.id === String(s.place.id)}
              editMode={selId === String(s.place.id)}
              theme={theme}
              t={t}
              onRemove={(k) => {
                ed.removeAt(k);
                setSelId(null);
              }}
              onResize={ed.setStay}
              onReorderStart={onReorderStart}
              onReorderMove={onReorderMove}
              onReorderEnd={onReorderEnd}
              onEnterEdit={() => enterEdit(String(s.place.id))}
              onExitEdit={exitEdit}
            />
          ))}

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
                onEnterEdit={() => enterEdit(WHEEL_ID)}
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
              onLongPress={() => enterEdit(WHEEL_ID)}
              delayLongPress={500}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
