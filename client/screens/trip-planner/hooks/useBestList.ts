import { useState } from "react";
import { Alert } from "react-native";
import { apiRequest } from "@/lib/query-client";
import type { TripFormData } from "@/types/trip";
import type { ScreenState } from "./useTripPlanner";

export type BestListPlace = {
  id: number;
  nameEn: string;
  nameLocal?: string | null;
  image?: string | null;
  userRatingCount?: number;
  rank: number | null;
  lat: number;
  lng: number;
  seedCategory?: string | null;
  stayMin: number;
};
export type BestList = {
  cityId: number;
  center: { lat: number; lng: number } | null;
  mult: number;
  days: { day: number; startTime: string; endTime: string }[];
  places: BestListPlace[];
};

// ⚠️ 수정금지(승인필요) 2026-10-21 사장님 결정 = 인기 명소 여정 버튼 = 하나의 목록(순위순 · 좌표 · 체류분)과 날짜 창을 받아 목록 화면으로 간다 · 체크한 순서(ids)가 슬롯 순서 · 화면을 오가도 유지 · 도시·날짜·시각·숙소·예산·이동 수단이 바뀌면 비움(배정이 달라짐) · 생성 성공 시 비움 (정본 §)
export function useBestList({
  formData,
  isAuthed,
  requestLogin,
  setScreen,
  t,
  i18n,
}: {
  formData: TripFormData;
  isAuthed: boolean;
  requestLogin: () => void;
  setScreen: React.Dispatch<React.SetStateAction<ScreenState>>;
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  const [bestList, setBestList] = useState<BestList | null>(null);
  const [bestPicked, setBestPicked] = useState<{
    key: string;
    ids: number[];
  }>({ key: "", ids: [] });

  const openBestList = async () => {
    if (!isAuthed) {
      requestLogin();
      return;
    }
    setScreen("Loading");
    try {
      const res = await apiRequest("POST", "/api/best/list", {
        ...formData,
        language: i18n.language || "ko",
      });
      const key = JSON.stringify([
        formData.destination,
        formData.startDate,
        formData.endDate,
        formData.startTime,
        formData.endTime,
        formData.accommodationCoords,
        formData.travelStyle,
        formData.mobilityStyle,
      ]);
      setBestPicked((prev) => (prev.key === key ? prev : { key, ids: [] }));
      setBestList(await res.json());
      setScreen("BestList");
    } catch (e) {
      console.error("[TripPlanner] 인기 명소 목록 실패:", e);
      Alert.alert(t("trip.generateFailed"), t("trip.retryHint"));
      setScreen("Input");
    }
  };

  return { bestList, openBestList, bestPicked, setBestPicked };
}
