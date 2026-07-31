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
 */
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBTS } from "@/contexts/BTSContext";
import TripPlannerScreen from "@/screens/trip-planner/TripPlannerScreen";
import MainAppBottomTabBar from "@/components/MainAppBottomTabBar";
import type { TripFormData, Vibe, CompanionType } from "@/types/trip";
import {
  characterIdToVibes,
  clampTravelPace,
} from "../../../shared/vibe-category";

// 종료시각 = 공연 3시간 전(결정4). "19:00" → "16:00". 시각 미확정 도시 = 16:00(19시 관례 기준).
function endTimeBeforeShow(showTime?: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(showTime || "");
  if (!m) return "16:00";
  const h = Math.max(0, parseInt(m[1], 10) - 3);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export default function BTSTripScreen() {
  const { selectedCity, selectedCharacter, selectedPlaceIds, topPlaces } =
    useBTS();
  const insets = useSafeAreaInsets();

  const form = useMemo<Partial<TripFormData> | undefined>(() => {
    // 도시 목록은 "남은 공연"만 오므로(서버 필터) 정상 플로우에선 날짜가 항상 있다 = 같은 관문 1개.
    if (!selectedCity?.nextConcertDate || !selectedCharacter) return undefined;
    const venue = topPlaces.find((p) => p.seedCategory === "bts_venue");
    const date = selectedCity.nextConcertDate;
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
      startTime: "09:00",
      endTime: endTimeBeforeShow(selectedCity.showTime),
      // 캐릭터 → 엔진 입력 = 정본 1:1 매핑(카드를 고른 기준과 같은 소스 1벌)
      vibes: characterIdToVibes(selectedCharacter.id) as Vibe[],
      travelPace: clampTravelPace(selectedCharacter.pace),
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
      // 고른 카드(선택 순서 유지) = 반드시 포함. 공연장 카드는 기점이므로 활동 핀에서 제외.
      pinnedPlaceIds: selectedPlaceIds.filter((id) => id !== venue?.id),
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
