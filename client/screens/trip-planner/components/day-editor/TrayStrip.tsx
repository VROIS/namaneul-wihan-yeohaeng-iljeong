import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { DraxScrollView, DraxView } from "react-native-drax";
import { Brand, Fonts, Spacing } from "@/constants/theme";
import SlotThumbnail from "../SlotThumbnail";
import type { PlannerApi } from "../../hooks/useTripPlanner";
import { LONG_PRESS_MS, type EditSlot } from "./edit-layout";
import { editStyles as es, TRAY_THUMB, noSelect } from "./editor-styles";
import DragSource from "./DragSource";

const nameOf = (s: EditSlot) =>
  s.place.nameEn || s.place.nameLocal || s.place.name || "";

export type TrayDrag = {
  onLift: (slot: EditSlot) => void;
  onEnd: (slot: EditSlot, dropped: boolean) => void;
};

function TrayThumb({
  slot,
  onTap,
  drag,
  theme,
  t,
}: {
  slot: EditSlot;
  onTap: () => void;
  drag: TrayDrag;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
}) {
  const payload = useMemo(() => ({ kind: "tray", slot }), [slot]);
  const thumb = (
    <SlotThumbnail
      place={slot.place}
      isMealSlot={false}
      isMeal={!!slot.place.isMeal}
      theme={theme}
      t={t}
      size={TRAY_THUMB}
    />
  );
  return (
    <View
      style={[es.trayItem, noSelect]}
      accessibilityRole="button"
      accessibilityLabel={nameOf(slot)}
    >
      {thumb}
      <DragSource
        payload={payload}
        delay={LONG_PRESS_MS}
        horizontal
        onStart={() => drag.onLift(slot)}
        onEnd={(_moved, dropped) => drag.onEnd(slot, dropped)}
        onTap={onTap}
        hover={() => thumb}
      />
    </View>
  );
}

// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 보관함 = 화면 위 고정 예비군 줄(가로 무한 스크롤 · 썸네일만 · 버튼 없음) · 살짝 터치 = 구글맵 마커 팻말처럼 크게(사진 + 아래 장소 이름 · 가독성) · 꾹 누르기 = 집어서 옮김(커진 상태에서든 바로든) · 다른 곳 터치 = 닫힘 · 슬롯을 여기에 놓으면 빠짐 · 끌기 = react-native-drax (정본 §)
export function TrayStrip({
  tray,
  preview,
  setPreview,
  drag,
  onDropSlot,
  theme,
  t,
}: {
  tray: EditSlot[];
  preview: EditSlot | null;
  setPreview: (s: EditSlot | null) => void;
  drag: TrayDrag;
  onDropSlot: (id: string) => void;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
}) {
  return (
    <DraxView
      style={[es.tray, { borderBottomColor: theme.border }]}
      receivingStyle={{ backgroundColor: `${Brand.primary}22` }}
      acceptsDrag={(p: any) => p?.kind === "slot"}
      onReceiveDragDrop={({ dragged }) =>
        onDropSlot((dragged.payload as { id: string }).id)
      }
    >
      <View style={es.trayLabel}>
        <Text style={[es.trayLabelText, { color: theme.textSecondary }]}>
          {t("trip.editBucket")}
        </Text>
      </View>
      {tray.length > 0 && (
        <DraxScrollView
          horizontal
          style={{ flex: 1 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.sm }}
        >
          {tray.map((s) => (
            <TrayThumb
              key={String(s.place.id)}
              slot={s}
              onTap={() =>
                setPreview(
                  preview && preview.place.id === s.place.id ? null : s,
                )
              }
              drag={drag}
              theme={theme}
              t={t}
            />
          ))}
        </DraxScrollView>
      )}
    </DraxView>
  );
}

export function TrayPlacard({
  slot,
  onClose,
  drag,
  theme,
  t,
}: {
  slot: EditSlot;
  onClose: () => void;
  drag: TrayDrag;
  theme: PlannerApi["theme"];
  t: PlannerApi["t"];
}) {
  const payload = useMemo(() => ({ kind: "tray", slot }), [slot]);
  const body = (
    <>
      <View style={st.placardImage}>
        <SlotThumbnail
          place={slot.place}
          isMealSlot={false}
          isMeal={!!slot.place.isMeal}
          theme={theme}
          t={t}
          size={240}
        />
      </View>
      <Text style={[st.placardName, { color: theme.text }]} numberOfLines={2}>
        {nameOf(slot)}
      </Text>
    </>
  );
  return (
    <>
      <Pressable
        style={st.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
      />
      <View
        style={[
          st.placard,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: theme.border,
          },
        ]}
      >
        {body}
        <DragSource
          payload={payload}
          delay={LONG_PRESS_MS}
          onStart={() => drag.onLift(slot)}
          onEnd={(_moved, dropped) => drag.onEnd(slot, dropped)}
          hover={() => (
            <View
              style={[
                st.placardHover,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              {body}
            </View>
          )}
        />
      </View>
    </>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  placard: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 256,
    padding: 8,
    borderWidth: 1,
    borderRadius: 14,
    zIndex: 41,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  placardHover: { flex: 1, padding: 8, borderRadius: 14 },
  placardImage: {
    width: 240,
    height: 240,
    borderRadius: 10,
    overflow: "hidden",
  },
  placardName: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Fonts.bold,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 2,
  },
});
