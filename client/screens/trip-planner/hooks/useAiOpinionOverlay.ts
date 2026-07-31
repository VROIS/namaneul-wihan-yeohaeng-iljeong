// AI 의견 오버레이 상태/신호수신 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
//   ⚠️ 2026-07-25 = 전문가 오버레이는 전역 ExpertOverlay(App)로 이관(§19) = 여기선 AI 의견만.
import { useState, useEffect, useRef } from "react";
import { Itinerary } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";

export function useAiOpinionOverlay({
  itinerary,
  currentItineraryId,
  aiOpinionRequestedAt,
  clearAiOpinionRequest,
  globalCurrentItinerary,
  t,
  i18n,
}: {
  itinerary: Itinerary | null;
  currentItineraryId: number | null;
  aiOpinionRequestedAt: number | null;
  clearAiOpinionRequest: () => void;
  // ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-5) = 전역 "현재 여정". 내 여정이 현재 여정일 때만 신호에 응답.
  globalCurrentItinerary: Itinerary | null;
  t: (key: string, opts?: any) => string;
  i18n: { language: string };
}) {
  // 🧠 2026-07-03 사장님 SSOT = "AI 의견" 결과 오버레이 상태(하단탭 버튼→여정 화면 위 오버레이, 새 화면 아님).
  const [aiOpinionVisible, setAiOpinionVisible] = useState(false);
  const [aiOpinionLoading, setAiOpinionLoading] = useState(false);
  const [aiOpinionData, setAiOpinionData] = useState<any>(null);
  const [aiOpinionError, setAiOpinionError] = useState<string | null>(null);

  // 🧠 2026-07-03 사장님 SSOT = 하단탭 "AI 의견" 버튼 신호 수신 → 오버레이 열고 Gemini 재평가 호출(캐시는 서버가 판정).
  // ⚠️ 2026-07-31 = 내가 태어나기 전 신호는 무시(§22 검증) — 응답자 없이 남은 옛 타임스탬프가
  //   나중에 마운트되는 화면에서 **누르지도 않은 AI의견을 자동 발사**(= Gemini 돈)하는 것 차단.
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (!aiOpinionRequestedAt || !itinerary) return;
    if (aiOpinionRequestedAt < mountedAtRef.current) return;
    // ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-5) = 내 여정이 "현재 여정"일 때만 응답.
    //   BTS 여정화면이 생기며 이 화면이 2벌 돌 수 있게 됨 — 잠금 없으면 안 보이는 옛 벌도
    //   같은 신호를 받아 **같은 Gemini 외부호출을 한 번 더** 내보냄(외부호출 = 돈, D10 메모리 경고).
    if (globalCurrentItinerary !== itinerary) return;
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
