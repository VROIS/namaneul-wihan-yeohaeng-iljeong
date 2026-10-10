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
import { PX_PER_MIN, STEP_MIN, toHm } from "./edit-layout";
import { editStyles as es, RULER_W, TRAY_THUMB } from "./editor-styles";
import { startLabel } from "./start-label";
import { useDayEdit } from "./useDayEdit";
import { useDragHandle } from "./useDragHandle";

const RED = "#EF4444";
const noTouchScroll: any =
  Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : null;
const noSelect: any = Platform.OS === "web" ? { userSelect: "none" } : null;

// ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 여정 수정 화면 = 위 고정 영역(Day 줄 · 출발 줄 · 삭제한 장소 줄) + 시간표 · 폰 앱 아이콘 방식(길게 누르면 전체 편집 모드 · 스크롤 고정 · 톡 누르면 끝) · 오른쪽 시간 눈금 = 룰렛 바퀴(돌리면 하루 시간대 통째 이동) (정본 §)
export default function DayEditor({
  planner,
  day,
}: {
  planner: PlannerApi;
  day: DayPlan;
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
  } = planner;
  const ed = useDayEdit(planner, day);
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<{ id: string; top: number } | null>(null);
  const dragStart = useRef<{ id: string; top: number } | null>(null);
  const wheelBase = useRef({ start: 0, end: 0, shift: 0 });
  const enterEdit = () => {
    if (editMode) return;
    haptic("medium");
    setEditMode(true);
  };
  const exitEdit = () => {
    haptic("light");
    setEditMode(false);
  };

  const { starts, moves, lastEnd } = ed.layout;
  const viewEnd = Math.max(ed.endMin + ed.finalLen, lastEnd) + 30;
  const yOf = (m: number) => (m - ed.startMin) * PX_PER_MIN;
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
    const center = top + (ed.slotsRef.current[cur].stay * PX_PER_MIN) / 2;
    let target = 0;
    ed.slotsRef.current.forEach((s, k) => {
      if (k === cur) return;
      if (yOf(starts[k]) + (s.stay * PX_PER_MIN) / 2 < center) target++;
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
      wheelBase.current = { start: ed.startMin, end: ed.endMin, shift: 0 };
    },
    onMove: (dy) => {
      const base = wheelBase.current;
      const shift = ed.shiftWindow(
        base,
        -Math.round(dy / PX_PER_MIN / STEP_MIN) * STEP_MIN,
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
          <View
            style={[
              resultStyles.dayHeaderBadge,
              { backgroundColor: Brand.primary },
            ]}
          >
            <Text style={resultStyles.dayHeaderBadgeText}>Day {day.day}</Text>
          </View>
          <Text
            style={[resultStyles.dayHeaderCity, { color: theme.textSecondary }]}
          >
            {displayCityName(itinerary!)}
          </Text>
          <View style={{ flex: 1 }} />
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
            style={es.primaryBtn}
            onPress={ed.commit}
            disabled={ed.saving}
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
            {startLabel(day, dayAccommodations, t)}
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
            <Text
              style={[es.trayLabelText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {t("trip.editRemoved")}
            </Text>
            <Text style={[es.trayCount, { color: theme.text }]}>
              {ed.removed.length}
            </Text>
          </View>
          {ed.removed.length === 0 ? (
            // ⚠️ 수정금지(승인필요) 2026-10-10 사장님 결정 = 지운 장소가 없을 때 띠 = 굵은 사용법 + 짧은 안내(안 들어가면 자동 줄바꿈) (정본 §)
            <Text style={{ flex: 1, fontSize: 11, color: theme.textTertiary }}>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: Fonts.bold,
                  color: Brand.primary,
                }}
              >
                {t("trip.editHowTo")}
              </Text>
              {"  "}
              {t("trip.editTrayEmpty")}
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
        scrollEnabled={!editMode}
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
            const h = moves[i] * PX_PER_MIN;
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
                ]}
              >
                {h >= 16 && (
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
              editMode={editMode}
              theme={theme}
              t={t}
              onRemove={ed.removeAt}
              onResize={ed.setStay}
              onReorderStart={onReorderStart}
              onReorderMove={onReorderMove}
              onReorderEnd={onReorderEnd}
              onEnterEdit={enterEdit}
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
                ]}
              >
                {ed.layout.finalMove * PX_PER_MIN >= 16 && (
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
                onEnterEdit={enterEdit}
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
          {editMode ? (
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
              onLongPress={enterEdit}
              delayLongPress={500}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
