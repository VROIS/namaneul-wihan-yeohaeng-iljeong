import { useState, useEffect, useRef } from "react";
import { Itinerary } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";
import { parseCreditShortfall, useCreditShortfall } from "@/lib/creditError";

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
  const showCreditShortfall = useCreditShortfall();
  // 🧠 2026-07-03 사장님 SSOT = "AI 의견" 결과 오버레이 상태(하단탭 버튼→여정 화면 위 오버레이, 새 화면 아님).
  const [aiOpinionVisible, setAiOpinionVisible] = useState(false);
  const [aiOpinionLoading, setAiOpinionLoading] = useState(false);
  const [aiOpinionData, setAiOpinionData] = useState<any>(null);
  const [aiOpinionError, setAiOpinionError] = useState<string | null>(null);

  // 🧠 2026-07-03 사장님 SSOT = 하단탭 "AI 의견" 버튼 신호 수신 → 오버레이 열고 Gemini 재평가 호출(캐시는 서버가 판정).
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (!aiOpinionRequestedAt || !itinerary) return;
    if (aiOpinionRequestedAt < mountedAtRef.current) return;
    // ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-5) = 내 여정이 "현재 여정"일 때만 응답.
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
        // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 실패 사유는 **언제나 화면에 남기고**,
        const shortfall = parseCreditShortfall(e?.message);
        if (shortfall) {
          setAiOpinionError(
            t("trip.creditShort", {
              balance: shortfall.balance,
              required: shortfall.required,
            }),
          );
          showCreditShortfall(shortfall);
        } else {
          setAiOpinionError(t("aiOpinion.error"));
        }
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
