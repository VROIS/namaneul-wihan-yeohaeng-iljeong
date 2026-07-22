// 저장된 여정 상세 = 일정 로드 + 일별 지브리영상 요약 (2026-07-22 video_by_day 일별 구조 재작성)
// = 생성·진행률·재생·기기저장 = VideoPreviewScreen 1벌 담당(§16). 이 훅 = 상세화면 표시용 데이터만.
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/query-client";

export interface DayVideo {
  status: "processing" | "succeeded" | "failed";
  url: string | null;
  taskId: string;
  scenesDone: number;
  totalScenes: number;
}

export function useVideoGeneration({ itineraryId }: { itineraryId: number }) {
  const [itinerary, setItinerary] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [videoByDay, setVideoByDay] = useState<Record<string, DayVideo>>({});

  useEffect(() => {
    (async () => {
      try {
        const [ir, vr] = await Promise.all([
          apiRequest("GET", `/api/itineraries/${itineraryId}`),
          apiRequest("GET", `/api/itineraries/${itineraryId}/video`),
        ]);
        setItinerary(await ir.json());
        setVideoByDay((await vr.json()).videoByDay || {});
      } catch (e) {
        console.error("[SavedTripDetail] 로드 오류:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [itineraryId]);

  const totalDays: number = itinerary?.rawData?.days?.length || 0;
  const doneDays = Object.values(videoByDay).filter(
    (v) => v.status === "succeeded",
  ).length;

  return { itinerary, isLoading, videoByDay, totalDays, doneDays };
}
