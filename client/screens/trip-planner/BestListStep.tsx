import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Brand, Fonts, Spacing, BorderRadius } from "@/constants/theme";
import { Icon } from "@/components/Icon";
import SlotThumbnail from "./components/SlotThumbnail";
import { displayCityName } from "@/lib/display-city-name";
import type { PlannerApi } from "./hooks/useTripPlanner";

const CARD_H = 56;
const THUMB = 48;

const dayLabel = (start: string, day: number, lang: string): string => {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + day - 1);
  const wd = d.toLocaleDateString(lang, { weekday: "short" });
  return `Day ${day} · ${d.getMonth() + 1}/${d.getDate()}(${wd})`;
};

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 베스트 목록 = 고르기만 하는 화면 · 제목 "인기 명소 - 도시" + 설명 한 줄 · 날마다 6곳(한 화면에 하루치 + 다음 날 첫 줄이 살짝) · 카드 = 썸네일 · 이름 · 순위 · 구글 리뷰 · 누르면 선택/해제 · 완료 = 고른 곳만 예상 여정(여정 수정 화면) (정본 §)
export default function BestListStep({ planner }: { planner: PlannerApi }) {
  const {
    theme,
    t,
    i18n,
    insets,
    bestList,
    formData,
    setScreen,
    handleGenerate,
    startDayEdit,
    tabBarHeight,
    bestPicked,
    setBestPicked,
  } = planner;
  const [busy, setBusy] = useState(false);
  if (!bestList) return null;

  const picked = new Set(bestPicked.ids);
  const toggle = (id: number) =>
    setBestPicked((prev) => ({
      ...prev,
      ids: prev.ids.includes(id)
        ? prev.ids.filter((x) => x !== id)
        : [...prev.ids, id],
    }));
  const pickedDays = bestList.days.map((d) =>
    d.places.filter((p) => picked.has(p.id)).map((p) => p.id),
  );
  const ready = pickedDays.every((d) => d.length > 0);

  const done = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await handleGenerate({ pickedDays });
    setBusy(false);
    if (ok) {
      setBestPicked((prev) => ({ ...prev, ids: [] }));
      startDayEdit(1);
    }
  };

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
            {t("trip.bestListTitle", { city: displayCityName(formData) })}
          </Text>
          <Text
            style={[s.hint, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {t("trip.bestListHint")}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      >
        {bestList.days.map((d) => (
          <View key={d.day} style={s.day}>
            <Text style={[s.dayLabel, { color: theme.text }]}>
              {dayLabel(formData.startDate, d.day, i18n.language || "ko")}
            </Text>
            {d.places.map((p) => {
              const on = picked.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  style={[
                    s.card,
                    {
                      backgroundColor: theme.backgroundDefault,
                      borderColor: on ? Brand.primary : theme.border,
                    },
                  ]}
                  onPress={() => toggle(p.id)}
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
                        <>
                          <Icon
                            name="star"
                            size={11}
                            color={theme.textSecondary}
                          />
                          <Text
                            style={[s.meta, { color: theme.textSecondary }]}
                          >
                            {p.userRatingCount.toLocaleString()}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                  <View
                    style={[
                      s.check,
                      on
                        ? {
                            backgroundColor: Brand.primary,
                            borderColor: Brand.primary,
                          }
                        : { borderColor: theme.border },
                    ]}
                  >
                    {on && <Icon name="check" size={14} color="#FFFFFF" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
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
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg },
  day: { gap: Spacing.xs, paddingTop: Spacing.sm },
  dayLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.bold,
    paddingHorizontal: 2,
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
  meta: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.medium },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  doneBtn: {
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
