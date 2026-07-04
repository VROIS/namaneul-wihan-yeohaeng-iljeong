import React, { createContext, useContext, useState, useCallback } from "react";
import type { Itinerary } from "@/types/trip";

interface MapToggleContextType {
  showMap: boolean;
  toggleMap: () => void;
  setShowMap: (show: boolean) => void;
  // ⚠️ 2026-07-03 = AI 의견 하단탭 버튼이 "현재 여정 있는지" 판정 + 검증 대상 전달용(사장님 SSOT = 새 Context 만들지 말 것).
  //   결과화면 진입 시 채워지고 Input 복귀 시 null = 버튼 자동 비활성.
  currentItinerary: Itinerary | null;
  currentItineraryId: number | null;
  setCurrentItinerary: (itinerary: Itinerary | null, id: number | null) => void;
  // ⚠️ 2026-07-03 = 하단탭 "AI 의견" 버튼 → 결과화면 오버레이 열기 신호(새 화면 대신 기존 화면 내 오버레이 트리거만 배관).
  aiOpinionRequestedAt: number | null;
  requestAiOpinion: () => void;
  clearAiOpinionRequest: () => void;
}

const MapToggleContext = createContext<MapToggleContextType>({
  showMap: false,
  toggleMap: () => {},
  setShowMap: () => {},
  currentItinerary: null,
  currentItineraryId: null,
  setCurrentItinerary: () => {},
  aiOpinionRequestedAt: null,
  requestAiOpinion: () => {},
  clearAiOpinionRequest: () => {},
});

export function MapToggleProvider({ children }: { children: React.ReactNode }) {
  const [showMap, setShowMap] = useState(false);
  const [currentItinerary, setCurrentItineraryState] = useState<Itinerary | null>(null);
  const [currentItineraryId, setCurrentItineraryId] = useState<number | null>(null);
  const [aiOpinionRequestedAt, setAiOpinionRequestedAt] = useState<number | null>(null);

  const toggleMap = useCallback(() => {
    setShowMap((prev) => !prev);
  }, []);

  const setCurrentItinerary = useCallback((itinerary: Itinerary | null, id: number | null) => {
    setCurrentItineraryState(itinerary);
    setCurrentItineraryId(id);
  }, []);

  // 매 요청마다 새 타임스탬프 = 같은 화면에서 다시 눌러도 useEffect가 재실행되도록.
  const requestAiOpinion = useCallback(() => {
    setAiOpinionRequestedAt(Date.now());
  }, []);
  const clearAiOpinionRequest = useCallback(() => {
    setAiOpinionRequestedAt(null);
  }, []);

  return (
    <MapToggleContext.Provider
      value={{
        showMap, toggleMap, setShowMap,
        currentItinerary, currentItineraryId, setCurrentItinerary,
        aiOpinionRequestedAt, requestAiOpinion, clearAiOpinionRequest,
      }}
    >
      {children}
    </MapToggleContext.Provider>
  );
}

export function useMapToggle() {
  return useContext(MapToggleContext);
}
