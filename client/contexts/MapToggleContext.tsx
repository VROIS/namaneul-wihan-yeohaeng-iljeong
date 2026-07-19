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
  // ⚠️ 사장님 SSOT 2026-07-14 = 하단탭 "전문가" 버튼 → 여정화면 위 오버레이(AI의견과 동일 패턴). 별도 화면 아님(§16 재사용·§19 옛 탭화면 폐기).
  expertRequestedAt: number | null;
  requestExpert: () => void;
  clearExpertRequest: () => void;
  // ⚠️ 사장님 SSOT 2026-07-14 = 오버레이 안에서 문의접수·답변전송 직후 = 하단 탭 배지 즉시 갱신 신호(오버레이는 navigation state를 안 바꿔 폴링으로만 반영되던 지연 제거 §19). 실시간 피드백.
  expertDataChangedAt: number | null;
  bumpExpertData: () => void;
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
  expertRequestedAt: null,
  requestExpert: () => {},
  clearExpertRequest: () => {},
  expertDataChangedAt: null,
  bumpExpertData: () => {},
});

export function MapToggleProvider({ children }: { children: React.ReactNode }) {
  const [showMap, setShowMap] = useState(false);
  const [currentItinerary, setCurrentItineraryState] =
    useState<Itinerary | null>(null);
  const [currentItineraryId, setCurrentItineraryId] = useState<number | null>(
    null,
  );
  const [aiOpinionRequestedAt, setAiOpinionRequestedAt] = useState<
    number | null
  >(null);
  const [expertRequestedAt, setExpertRequestedAt] = useState<number | null>(
    null,
  );
  const [expertDataChangedAt, setExpertDataChangedAt] = useState<number | null>(
    null,
  );

  const toggleMap = useCallback(() => {
    setShowMap((prev) => !prev);
  }, []);

  const setCurrentItinerary = useCallback(
    (itinerary: Itinerary | null, id: number | null) => {
      setCurrentItineraryState(itinerary);
      setCurrentItineraryId(id);
    },
    [],
  );

  // 매 요청마다 새 타임스탬프 = 같은 화면에서 다시 눌러도 useEffect가 재실행되도록.
  const requestAiOpinion = useCallback(() => {
    setAiOpinionRequestedAt(Date.now());
  }, []);
  const clearAiOpinionRequest = useCallback(() => {
    setAiOpinionRequestedAt(null);
  }, []);
  // ⚠️ 사장님 SSOT 2026-07-14 = 전문가 오버레이 트리거(AI의견과 동일 트릭 = 매 요청 새 타임스탬프 → 같은 화면 재클릭도 useEffect 재실행).
  const requestExpert = useCallback(() => {
    setExpertRequestedAt(Date.now());
  }, []);
  const clearExpertRequest = useCallback(() => {
    setExpertRequestedAt(null);
  }, []);
  // 오버레이 안 문의접수·답변전송 직후 = 배지 즉시 재조회 트리거(타임스탬프 변화 = MainTabNavigator가 감지).
  const bumpExpertData = useCallback(() => {
    setExpertDataChangedAt(Date.now());
  }, []);

  return (
    <MapToggleContext.Provider
      value={{
        showMap,
        toggleMap,
        setShowMap,
        currentItinerary,
        currentItineraryId,
        setCurrentItinerary,
        aiOpinionRequestedAt,
        requestAiOpinion,
        clearAiOpinionRequest,
        expertRequestedAt,
        requestExpert,
        clearExpertRequest,
        expertDataChangedAt,
        bumpExpertData,
      }}
    >
      {children}
    </MapToggleContext.Provider>
  );
}

export function useMapToggle() {
  return useContext(MapToggleContext);
}
