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
};
export type BestList = {
  cityId: number;
  days: { day: number; places: BestListPlace[] }[];
};

// ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 인기 명소 고르기 버튼 = 목록(날마다 6곳)을 받아 목록 화면으로 간다 (정본 §)
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
  // ⚠️ 수정금지(승인필요) 2026-10-19 사장님 결정 = 목록에서 고른 곳은 화면을 오가도 유지(생성 실패·뒤로 가기 뒤에도) · 도시·날짜가 바뀌면 비움 · 생성에 성공하면 비움 (정본 §)
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
      const key = `${formData.destination}|${formData.startDate}|${formData.endDate}`;
      setBestPicked((prev) => (prev.key === key ? prev : { key, ids: [] }));
      setBestList(await res.json());
      setScreen("BestList");
    } catch (e) {
      console.error("[TripPlanner] 베스트 목록 실패:", e);
      Alert.alert(t("trip.generateFailed"), t("trip.retryHint"));
      setScreen("Input");
    }
  };

  return { bestList, openBestList, bestPicked, setBestPicked };
}
