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
  //   2026-07-24 사장님 승인 = payload 옵션 추가: 일별 [바로 예약하기] = {mode:'booking', day:n} 로 열면 예약 작성뷰로 오픈(무인자 호출 = 기존 그대로).
  expertRequestedAt: number | null;
  expertOpenPayload: { mode: "booking"; day: number } | null;
  requestExpert: (payload?: { mode: "booking"; day: number }) => void;
  clearExpertRequest: () => void;
  clearExpertOpenPayload: () => void;
  // ⚠️ 사장님 SSOT 2026-07-14 = 오버레이 안에서 문의접수·답변전송 직후 = 하단 탭 배지 즉시 갱신 신호(오버레이는 navigation state를 안 바꿔 폴링으로만 반영되던 지연 제거 §19). 실시간 피드백.
  expertDataChangedAt: number | null;
  bumpExpertData: () => void;
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 = 별도 화면 아닌 인앱 팝업(센터/상단 모달). AI의견·전문가와 동일 신호 패턴(§16 재사용). 저장·공유·전문가·프로필·여정생성(비인증) 게이트가 이걸 불러 전역 LoginSheet를 엶.
  loginRequestedAt: number | null;
  requestLogin: () => void;
  clearLoginRequest: () => void;
  // ⚠️ 사장님 SSOT 2026-07-25(세션2) = 로그인 성공/로그아웃 등 인증상태 변경 신호(expertDataChangedAt 패턴 복제). 로그인 팝업은 navigation focus를 안 바꿔 프로필(useFocusEffect)이 재조회 안 함 → 이 신호로 useProfile 등이 재조회 = 로그인 후 즉시 인증반영.
  authChangedAt: number | null;
  bumpAuthChanged: () => void;
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
  expertOpenPayload: null,
  requestExpert: () => {},
  clearExpertRequest: () => {},
  clearExpertOpenPayload: () => {},
  expertDataChangedAt: null,
  bumpExpertData: () => {},
  loginRequestedAt: null,
  requestLogin: () => {},
  clearLoginRequest: () => {},
  authChangedAt: null,
  bumpAuthChanged: () => {},
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
  const [expertOpenPayload, setExpertOpenPayload] = useState<{
    mode: "booking";
    day: number;
  } | null>(null);
  const [expertDataChangedAt, setExpertDataChangedAt] = useState<number | null>(
    null,
  );
  const [loginRequestedAt, setLoginRequestedAt] = useState<number | null>(null);
  const [authChangedAt, setAuthChangedAt] = useState<number | null>(null);

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
  //   2026-07-24 = payload(예약 모드) 동반 가능. ExpertSheet가 마운트 시 1회 소비 후 clearExpertOpenPayload(미클리어 = 다음 일반 열기 오염).
  const requestExpert = useCallback(
    (payload?: { mode: "booking"; day: number }) => {
      setExpertOpenPayload(payload ?? null);
      setExpertRequestedAt(Date.now());
    },
    [],
  );
  const clearExpertRequest = useCallback(() => {
    setExpertRequestedAt(null);
  }, []);
  const clearExpertOpenPayload = useCallback(() => {
    setExpertOpenPayload(null);
  }, []);
  // 오버레이 안 문의접수·답변전송 직후 = 배지 즉시 재조회 트리거(타임스탬프 변화 = MainTabNavigator가 감지).
  const bumpExpertData = useCallback(() => {
    setExpertDataChangedAt(Date.now());
  }, []);
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 팝업 트리거(AI의견·전문가와 동일 = 매 요청 새 타임스탬프 → 같은 화면 재요청도 LoginSheet useEffect 재실행). 전역 LoginSheet가 소비 후 clearLoginRequest.
  const requestLogin = useCallback(() => {
    setLoginRequestedAt(Date.now());
  }, []);
  const clearLoginRequest = useCallback(() => {
    setLoginRequestedAt(null);
  }, []);
  // ⚠️ 2026-07-25(세션2) = 로그인 성공/로그아웃 시 호출 → 구독자(useProfile 등)가 인증 재조회(navigation focus 안 바뀌어도 즉시 반영).
  const bumpAuthChanged = useCallback(() => {
    setAuthChangedAt(Date.now());
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
        expertOpenPayload,
        requestExpert,
        clearExpertRequest,
        clearExpertOpenPayload,
        expertDataChangedAt,
        bumpExpertData,
        loginRequestedAt,
        requestLogin,
        clearLoginRequest,
        authChangedAt,
        bumpAuthChanged,
      }}
    >
      {children}
    </MapToggleContext.Provider>
  );
}

export function useMapToggle() {
  return useContext(MapToggleContext);
}
