/**
 * ⚠️ 수정금지(승인필요) 2026-07-31 사장님 승인(BTS D단계 FE-3)
 * BTS 여정 화면 = **메인앱 여정화면 그대로** (재발명 0 = §16).
 *
 * "같이 떠나요" → 이 화면이 옛 BTSLoading·BTSDashboard 자리를 대체한다(§19 완전삭제).
 * 하는 일 = BTSContext 재료(도시·캐릭터·고른 카드·공연장)로 메인 폼을 조립해
 * TripPlannerScreen 에 실어 열기만 한다 — 로딩·오류안내·결과·저장·AI의견 전부 메인 것.
 *
 * - 공연장 = 숙소 칸(결정3) = 동선 출발·도착 기점 + 지도 깃발
 * - 종료시각 = 공연 시작 3시간 전(결정4) = 저녁 먹고 입장
 * - 고른 카드 = pinnedPlaceIds(공연장 제외) = 서버 db-only 직행 + 무료(결정5·7)
 * - ⚠️ 2026-08-15 사장님 승인 = 점심 카드 = 공연장처럼 항상 포함(선택 무관) + 밀도 = 가용시간÷활동카드수 역산(근사).
 *   옛 "캐릭터 고정 pace" 폐기 §19 = 카드를 다 골라도 밀도가 낮으면 일부가 잘리던 결함.
 */
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBTS } from "@/contexts/BTSContext";
import TripPlannerScreen from "@/screens/trip-planner/TripPlannerScreen";
import MainAppBottomTabBar from "@/components/MainAppBottomTabBar";
import type { TripFormData, Vibe, CompanionType } from "@/types/trip";
import { characterIdToVibes } from "../../../shared/vibe-category";
import { PACE_SLOT_MINUTES } from "../../../shared/pace-duration";

// 종료시각 = 공연 3시간 전(결정4). "19:00" → "16:00". 시각 미확정 도시 = 16:00(19시 관례 기준).
function endTimeBeforeShow(showTime?: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(showTime || "");
  if (!m) return "16:00";
  const h = Math.max(0, parseInt(m[1], 10) - 3);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// ⚠️ 2026-08-15 사장님 승인 = 밀도 역산(근사치) = 가용시간(점심 제외) ÷ 사용자가 고른 활동카드 수
//   → 메인엔진의 3단계 밀도(PACE_SLOT_MINUTES, server/services/agents/types.ts PACE_CONFIG 와 공유 1벌) 중
//   가장 가까운 것으로 스냅. 서버는 그대로(§ FE-only 승인).
//   옛 "캐릭터 고정 pace" 폐기 = 2026-08-15 §19 — 카드 8장을 다 골라도 밀도가 낮으면 일부가 잘리던 결함.
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
    // 도시 목록은 "남은 공연"만 오므로(서버 필터) 정상 플로우에선 날짜가 항상 있다 = 같은 관문 1개.
    if (!selectedCity?.nextConcertDate || !selectedCharacter) return undefined;
    const venue = topPlaces.find((p) => p.seedCategory === "bts_venue");
    // ⚠️ 2026-08-15 사장님 승인 = 점심 카드 = 공연장처럼 사용자 선택과 무관하게 항상 포함(§0 새 원칙).
    //   1개만 존재(8번=저녁 식당 폐기, bts-routes.ts §BE 정합) = seedCategory 로 유일 식별 가능.
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
      destination: selectedCity.nameKo,
      // 좌표 = 불변키 = 이름 오매칭(니스→베니스) 방지. 서버 도시해석이 좌표 우선.
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
      // 캐릭터 → 엔진 입력 = 정본 1:1 매핑(카드를 고른 기준과 같은 소스 1벌)
      vibes: characterIdToVibes(selectedCharacter.id) as Vibe[],
      travelPace: derivedPace,
      companionType: "Single" as CompanionType, // BTS = 1인·1일(사장님 결정)
      companionCount: 1,
      companionAges: "",
      // 공연장 = 숙소 칸 = 출발·도착 기점(결정3). 이름은 결과화면 깃발·숙소바에 그대로 표시.
      ...(venue && venue.latitude != null && venue.longitude != null
        ? {
            accommodationName: venue.nameKo || venue.nameEn,
            accommodationCoords: {
              lat: Number(venue.latitude),
              lng: Number(venue.longitude),
            },
          }
        : {}),
      // 고른 카드(선택 순서 유지) = 반드시 포함 + 점심은 선택 여부 무관 항상 포함. 공연장은 기점이므로 활동 핀에서 제외.
      pinnedPlaceIds: Array.from(
        new Set([
          ...selectedPlaceIds.filter((id) => id !== venue?.id),
          ...(lunch ? [lunch.id] : []),
        ]),
      ),
      // 마지막 슬롯 = 공연장 카드 + 공연 시작 시각(사장님 지시 문제점4). 시각 미확정 도시 = 19시 관례.
      ...(venue
        ? {
            finalPlaceId: venue.id,
            finalPlaceTime: selectedCity.showTime || "19:00",
          }
        : {}),
    };
  }, [selectedCity, selectedCharacter, selectedPlaceIds, topPlaces]);

  // 재료 없이 직접 진입(정상 플로우에선 불가) = 빈 화면 대신 메인 입력화면이라도 그대로.
  // 안쪽 여백 = 하단 고정바 높이(52 + max(insets,6)) — 없으면 스크롤 끝(공유·캘린더)이 바에 덮임
  // (§22 검증 지적 = 카트 [같이 떠나요]가 덮이던 것과 같은 유형).
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
