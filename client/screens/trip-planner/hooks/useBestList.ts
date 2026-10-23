import { useState } from "react";
import { Alert } from "react-native";
import { apiRequest } from "@/lib/query-client";
import type { TripFormData } from "@/types/trip";
import type { ScreenState } from "./useTripPlanner";
import { formatDate } from "../utils";

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

// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 도시 카드 "인기 명소 여정" = 입력 화면 값은 그대로 두고 이 길에만 고정값(가족 4명 · 모두를 위한 · 합리적 · 드라이빙 가이드 · 오늘부터 3일 · 09:00~21:00)을 실어 목록·생성 요청을 보낸다 (정본 §)
const popularForm = (f: TripFormData): TripFormData => {
  const now = Date.now();
  return {
    ...f,
    companionType: "Family",
    companionCount: 4,
    curationFocus: "Everyone",
    travelStyle: "Reasonable",
    mobilityStyle: "Minimal",
    startDate: formatDate(new Date(now)),
    endDate: formatDate(new Date(now + 2 * 24 * 60 * 60 * 1000)),
    startTime: "09:00",
    endTime: "21:00",
  };
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
  const [bestForm, setBestForm] = useState<TripFormData | null>(null);
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
    const form = popularForm(formData);
    try {
      const res = await apiRequest("POST", "/api/best/list", {
        ...form,
        language: i18n.language || "ko",
      });
      const key = JSON.stringify([
        form.destination,
        form.startDate,
        form.endDate,
        form.startTime,
        form.endTime,
        form.accommodationCoords,
        form.travelStyle,
        form.mobilityStyle,
      ]);
      setBestPicked((prev) => (prev.key === key ? prev : { key, ids: [] }));
      setBestForm(form);
      setBestList(await res.json());
      setScreen("BestList");
    } catch (e) {
      console.error("[TripPlanner] 인기 명소 목록 실패:", e);
      Alert.alert(t("trip.generateFailed"), t("trip.retryHint"));
      setScreen("Input");
    }
  };

  return { bestList, bestForm, openBestList, bestPicked, setBestPicked };
}
