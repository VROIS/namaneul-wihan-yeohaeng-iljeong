// ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계 FE-3) = BTS 여정화면은 메인앱 여정화면 그대로(재발명 금지 §16) — 로딩·오류안내·결과·저장·AI의견 전부 메인 로직 재사용
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBTS } from "@/contexts/BTSContext";
import TripPlannerScreen from "@/screens/trip-planner/TripPlannerScreen";
import MainAppBottomTabBar from "@/components/MainAppBottomTabBar";
import type { TripFormData, Vibe, CompanionType } from "@/types/trip";
import { characterIdToVibes } from "../../../shared/vibe-category";
import { PACE_SLOT_MINUTES } from "../../../shared/pace-duration";

function endTimeBeforeShow(showTime?: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(showTime || "");
  if (!m) return "16:00";
  const h = Math.max(0, parseInt(m[1], 10) - 3);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// ⚠️ 2026-08-15 사장님 승인 = 밀도 역산(근사치) = 가용시간(점심 제외) ÷ 사용자가 고른 활동카드 수
function deriveTravelPace(
  startTime: string,
  endTime: string,
  hasLunch: boolean,
  activityCount: number,
): "Packed" | "Normal" | "Relaxed" {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const availableMin = eh * 60 + em - (sh * 60 + sm) - (hasLunch ? 40 : 0);
  const perSlot = availableMin / Math.max(1, activityCount);
  const candidates = (
    Object.entries(PACE_SLOT_MINUTES) as [
      "Packed" | "Normal" | "Relaxed",
      number,
    ][]
  ).map(([pace, min]) => ({ pace, min }));
  return candidates.reduce((best, c) =>
    Math.abs(c.min - perSlot) < Math.abs(best.min - perSlot) ? c : best,
  ).pace;
}

export default function BTSTripScreen() {
  const { selectedCity, selectedCharacter, selectedPlaceIds, topPlaces } =
    useBTS();
  const insets = useSafeAreaInsets();

  const form = useMemo<Partial<TripFormData> | undefined>(() => {
    if (!selectedCity?.nextConcertDate || !selectedCharacter) return undefined;
    const venue = topPlaces.find((p) => p.seedCategory === "bts_venue");
    // ⚠️ 2026-08-15 사장님 승인 = 점심 카드 = 공연장처럼 사용자 선택과 무관하게 항상 포함(§0 새 원칙).
    const lunch = topPlaces.find((p) => p.seedCategory === "restaurant");
    const date = selectedCity.nextConcertDate;
    // ⚠️ 2026-08-15 사장님 시뮬 지시 = 09시로 재변경(옛 08시 시험분 폐기 §19).
    const startTime = "09:00";
    const endTime = endTimeBeforeShow(selectedCity.showTime);
    const activityCount = selectedPlaceIds.filter(
      (id) => id !== venue?.id && id !== lunch?.id,
    ).length;
    const derivedPace = deriveTravelPace(
      startTime,
      endTime,
      !!lunch,
      activityCount,
    );
    return {
      // ⚠️ 2026-08-22 사장님 원칙 = 도시명 노출 nameEn 1순위(한국어 배제) — 도시해석은 아래 좌표가 우선이라 안전
      destination: selectedCity.nameEn || selectedCity.nameKo,
      ...(selectedCity.latitude != null && selectedCity.longitude != null
        ? {
            destinationCoords: {
              lat: Number(selectedCity.latitude),
              lng: Number(selectedCity.longitude),
            },
          }
        : {}),
      startDate: date,
      endDate: date,
      startTime,
      endTime,
      vibes: characterIdToVibes(selectedCharacter.id) as Vibe[],
      travelPace: derivedPace,
      companionType: "Single" as CompanionType, // BTS = 1인·1일(사장님 결정)
      companionCount: 1,
      companionAges: "",
      ...(venue && venue.latitude != null && venue.longitude != null
        ? {
            accommodationName: venue.nameEn || venue.nameKo || undefined, // ⚠️ 2026-08-22 사장님 원칙 = nameEn 1순위(null→undefined = 타입 정합)
            accommodationCoords: {
              lat: Number(venue.latitude),
              lng: Number(venue.longitude),
            },
          }
        : {}),
      pinnedPlaceIds: Array.from(
        new Set([
          ...selectedPlaceIds.filter((id) => id !== venue?.id),
          ...(lunch ? [lunch.id] : []),
        ]),
      ),
      ...(venue
        ? {
            finalPlaceId: venue.id,
            finalPlaceTime: selectedCity.showTime || "19:00",
          }
        : {}),
    };
  }, [selectedCity, selectedCharacter, selectedPlaceIds, topPlaces]);

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: 52 + Math.max(insets.bottom, 6) },
      ]}
    >
      <TripPlannerScreen initialRequest={form} />
      <MainAppBottomTabBar activeTab="BTS" aiOpensInPlace />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
