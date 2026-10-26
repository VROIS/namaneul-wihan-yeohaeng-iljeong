import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Brand, Fonts, Spacing, BorderRadius } from "@/constants/theme";
import { dayColor } from "@/constants/day-colors";
import { Icon } from "@/components/Icon";
import ItineraryMap from "@/components/ItineraryMap";
import SlotThumbnail from "./components/SlotThumbnail";
import { displayCityName } from "@/lib/display-city-name";
import { haptic } from "@/screens/bts/place-cart/utils";
import { assignPickedDays, PICKED_DAY_BREAK } from "@shared/day-fill";
import type { PlannerApi } from "./hooks/useTripPlanner";
import type { BestListPlace } from "./hooks/useBestList";
import { addDays, shortDate } from "./utils";

const CARD_H = 56;
const THUMB = 48;

// ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 인기 명소 목록 = 위 지도(출발 깃발 항상 + 고른 곳만 날짜색 번호 마커 · 마커가 깃발 위) + 아래 하나의 목록 · 머리글 = 도시 + 여행 날짜(여는 날부터 담은 날까지) · 처음엔 체크 0 · 누른 카드가 위로 올라가 고른 순서대로 쌓임(블록 쌓기 · Reanimated LinearTransition) · 날 나누기 = 하루 1~6곳(shared/day-fill) · 7번째부터 또는 "다음 날"을 누른 자리에서 구분선(실제 날짜) 뒤 다음 날 · 날 수 제한 없음 · 번호 배지 = 지도 마커와 같은 번호·날짜색(3색 순환) · 한 번 더 누르면 풀림(뒤 카드가 당겨짐) · 안 고른 카드 = 아래 순위순 · 완료 = 1곳 이상 = 담은 날만큼 여정 (정본 §2026-10-26)
export default function BestListStep({ planner }: { planner: PlannerApi }) {
  const {
    theme,
    t,
    i18n,
    insets,
    bestList,
    bestForm,
    setScreen,
    handleGenerate,
    startDayEdit,
    tabBarHeight,
    bestPicked,
    setBestPicked,
  } = planner;
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef<Record<number, number>>({});

  const center =
    bestForm?.accommodationCoords ??
    bestList?.center ??
    bestForm?.destinationCoords ??
    null;
  const byId = useMemo(
    () => new Map((bestList?.places ?? []).map((p) => [p.id, p])),
    [bestList?.places],
  );
  const days = useMemo(
    () =>
      assignPickedDays(bestPicked.ids).map((d) =>
        d.map((id) => byId.get(id)).filter((p): p is BestListPlace => !!p),
      ),
    [bestPicked.ids, byId],
  );
  const slotOf = useMemo(() => {
    const m = new Map<number, { day: number; n: number }>();
    days.forEach((d, di) =>
      d.forEach((p, i) => m.set(p.id, { day: di + 1, n: i + 1 })),
    );
    return m;
  }, [days]);
  const mapPlaces = useMemo(
    () =>
      days.flatMap((d, di) =>
        d.map((p, i) => ({
          id: String(p.id),
          name: p.nameEn || p.nameLocal || "",
          seedCategory: p.seedCategory ?? null,
          lat: p.lat,
          lng: p.lng,
          slot: i + 1,
          color: dayColor(di + 1),
        })),
      ),
    [days],
  );

  if (!bestList || !bestForm) return null;

  const pick = (id: number) => {
    haptic("light");
    setBestPicked((prev) => ({
      ...prev,
      ids: slotOf.has(id)
        ? prev.ids.filter((x) => x !== id)
        : [...prev.ids, id],
    }));
  };
  const filled = days.filter((d) => d.length > 0);
  const ready = filled.length > 0;
  const canNext = days[days.length - 1].length > 0;
  const nextDay = () => {
    if (!canNext) return;
    haptic("light");
    setBestPicked((prev) => ({
      ...prev,
      ids: [...prev.ids, PICKED_DAY_BREAK],
    }));
  };
  const dateOf = (di: number) => addDays(bestForm.startDate, di);

  // ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 목록 화면은 인기 명소 고정값(bestForm)으로 보이고 완료 요청에도 그대로 싣는다 · 끝 날짜만 담은 날 수로(여는 날 + 날 수 − 1) · 입력 화면 값은 안 씀 (정본 §2026-10-26)
  const done = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await handleGenerate({
      ...bestForm,
      endDate: dateOf(filled.length - 1),
      pickedDays: filled.map((d) => d.map((p) => p.id)),
    });
    setBusy(false);
    if (ok) {
      setBestPicked((prev) => ({ ...prev, ids: [] }));
      startDayEdit(1);
    }
  };

  // 한 줄로 그린다(카드 key 가 그대로라 위로 올라가는 움직임이 보인다)
  type Row =
    | { kind: "card"; p: BestListPlace; day: number | null; n: number }
    | { kind: "line"; day: number };
  const rows: Row[] = [
    ...days.flatMap((d, di): Row[] =>
      d.length || di > 0
        ? [
            { kind: "line" as const, day: di + 1 },
            ...d.map((p, i) => ({
              kind: "card" as const,
              p,
              day: di + 1,
              n: i + 1,
            })),
          ]
        : [],
    ),
    ...bestList.places
      .filter((p) => !slotOf.has(p.id))
      .map((p) => ({ kind: "card" as const, p, day: null, n: 0 })),
  ];
  const start = center
    ? {
        lat: center.lat,
        lng: center.lng,
        label: `${t("trip.departure")}: ${
          bestForm.accommodationName ||
          t("trip.departureCityCenter", {
            destination: displayCityName(bestForm),
          })
        }`,
      }
    : null;

  return (
    <View
      style={[
        s.root,
        { backgroundColor: theme.backgroundRoot, paddingTop: insets.top },
      ]}
    >
      <View
        style={[
          s.header,
          {
            backgroundColor: theme.backgroundDefault,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Pressable
          style={s.back}
          onPress={() => setScreen("Input")}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Icon name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>
            {t("trip.bestListTitle", { city: displayCityName(bestForm) })}
            <Text style={[s.date, { color: theme.textSecondary }]}>
              {"  "}
              {shortDate(bestForm.startDate)} ~{" "}
              {shortDate(dateOf(Math.max(filled.length, 1) - 1))}
            </Text>
          </Text>
          <Text
            style={[s.hint, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {t("trip.bestListHint")}
          </Text>
        </View>
      </View>

      <View style={s.map}>
        <ItineraryMap
          places={mapPlaces}
          start={start}
          onMarkerPress={(id) => {
            setSelectedId(id);
            const y = cardY.current[Number(id)];
            if (y != null)
              scrollRef.current?.scrollTo({
                y: Math.max(0, y - 8),
                animated: true,
              });
          }}
          selectedSlotId={selectedId}
          height={Math.min(220, Dimensions.get("window").height * 0.28)}
          language={i18n.language || "ko"}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((r) => {
          if (r.kind === "line") {
            const color = dayColor(r.day);
            return (
              <Animated.View
                key={`line-${r.day}`}
                layout={LinearTransition}
                style={s.line}
              >
                <View style={[s.lineBar, { backgroundColor: color }]} />
                <Text style={[s.lineText, { color }]}>
                  {shortDate(dateOf(r.day - 1))}
                </Text>
                <View style={[s.lineBar, { backgroundColor: color }]} />
              </Animated.View>
            );
          }
          const { p } = r;
          const on = r.day != null;
          const color = on ? dayColor(r.day!) : Brand.primary;
          return (
            <Animated.View
              key={p.id}
              layout={LinearTransition}
              onLayout={(e) => {
                cardY.current[p.id] = e.nativeEvent.layout.y;
              }}
            >
              <Pressable
                style={[
                  s.card,
                  {
                    backgroundColor: theme.backgroundDefault,
                    borderColor: on
                      ? color
                      : selectedId === String(p.id)
                        ? Brand.primary
                        : theme.border,
                  },
                ]}
                onPress={() => pick(p.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <SlotThumbnail
                  place={p}
                  isMealSlot={false}
                  isMeal={false}
                  theme={theme}
                  t={t}
                />
                <View style={s.textCol}>
                  <Text
                    style={[s.name, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {p.nameEn || p.nameLocal}
                  </Text>
                  <View style={s.metaRow}>
                    {p.rank != null && (
                      <Text style={[s.rank, { color: Brand.primary }]}>
                        {t("trip.bestRank", { n: p.rank })}
                      </Text>
                    )}
                    {!!p.userRatingCount && (
                      <Text
                        style={[s.meta, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {t("trip.googleReviews")}{" "}
                        {p.userRatingCount.toLocaleString()}
                      </Text>
                    )}
                  </View>
                </View>
                {on ? (
                  <View style={[s.num, { backgroundColor: color }]}>
                    <Text style={s.numText}>{r.n}</Text>
                  </View>
                ) : (
                  <View style={[s.check, { borderColor: theme.border }]} />
                )}
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>

      <View
        style={[
          s.footer,
          {
            backgroundColor: theme.backgroundDefault,
            borderTopColor: theme.border,
            marginBottom: tabBarHeight,
          },
        ]}
      >
        <Pressable
          style={[
            s.nextBtn,
            { borderColor: Brand.primary, opacity: canNext && !busy ? 1 : 0.4 },
          ]}
          onPress={nextDay}
          disabled={!canNext || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canNext || busy }}
        >
          <Icon name="calendar" size={18} color={Brand.primary} />
          <Text style={[s.nextText, { color: Brand.primary }]}>
            {t("trip.nextDay")}
          </Text>
        </Pressable>
        <Pressable
          style={[s.doneBtn, { opacity: ready && !busy ? 1 : 0.4 }]}
          onPress={done}
          disabled={!ready || busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Icon name="check" size={18} color="#FFFFFF" />
              <Text style={s.doneText}>{t("trip.editDone")}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    borderBottomWidth: 1,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.bold },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.medium },
  map: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  list: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  card: {
    height: CARD_H,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: (CARD_H - THUMB) / 2,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  textCol: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 18, fontFamily: Fonts.bold },
  metaRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  rank: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.bold },
  meta: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: Fonts.medium,
    flexShrink: 1,
  },
  date: { fontSize: 13, fontFamily: Fonts.medium },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  lineBar: { flex: 1, height: 2, borderRadius: 1 },
  lineText: { fontSize: 12, fontFamily: Fonts.bold },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#FFFFFF", fontSize: 13, fontFamily: Fonts.bold },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  nextBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  nextText: { fontSize: 16, fontFamily: Fonts.bold },
  doneBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Brand.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  doneText: { color: "#FFFFFF", fontSize: 16, fontFamily: Fonts.bold },
});
