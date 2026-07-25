// AI 의견 오버레이 상태/신호수신 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
//   ⚠️ 2026-07-25 = 전문가 오버레이는 전역 ExpertOverlay(App)로 이관(§19) = 여기선 AI 의견만.
import { useState, useEffect } from "react";
import { Itinerary } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";

export function useAiOpinionOverlay({
  itinerary,
  currentItineraryId,
  aiOpinionRequestedAt,
  clearAiOpinionRequest,
  t,
  i18n,
}: {
  itinerary: Itinerary | null;
  currentItineraryId: number | null;
  aiOpinionRequestedAt: number | null;
  clearAiOpinionRequest: () => void;
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  // 🧠 2026-07-03 사장님 SSOT = "AI 의견" 결과 오버레이 상태(하단탭 버튼→여정 화면 위 오버레이, 새 화면 아님).
  const [aiOpinionVisible, setAiOpinionVisible] = useState(false);
  const [aiOpinionLoading, setAiOpinionLoading] = useState(false);
  const [aiOpinionData, setAiOpinionData] = useState<any>(null);
  const [aiOpinionError, setAiOpinionError] = useState<string | null>(null);

  // 🧠 2026-07-03 사장님 SSOT = 하단탭 "AI 의견" 버튼 신호 수신 → 오버레이 열고 Gemini 재평가 호출(캐시는 서버가 판정).
  useEffect(() => {
    if (!aiOpinionRequestedAt || !itinerary) return;
    let cancelled = false;
    setAiOpinionVisible(true);
    setAiOpinionLoading(true);
    setAiOpinionError(null);
    (async () => {
      try {
        // ⚠️ 2026-07-03 사장님 SSOT = 현재 앱 언어를 함께 전달 = Gemini가 그 언어로 직접 작문(번역기 아님, pipeline-v3.ts langMap 패턴).
        const res = await apiRequest("POST", "/api/itineraries/ai-opinion", {
          itineraryId: currentItineraryId,
          itinerary,
          language: i18n.language,
        });
        const data = await res.json();
        if (cancelled) return;
        setAiOpinionData(data);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[TripPlanner] AI 의견 조회 실패:", e);
        setAiOpinionError(t("aiOpinion.error"));
      } finally {
        if (!cancelled) setAiOpinionLoading(false);
        clearAiOpinionRequest();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiOpinionRequestedAt]);

  return {
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    setAiOpinionData,
    aiOpinionError,
  };
}
