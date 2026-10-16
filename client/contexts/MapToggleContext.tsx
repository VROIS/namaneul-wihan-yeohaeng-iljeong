import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { getUserData, subscribeAuthChanged, type UserData } from "@/lib/auth";
import type { Itinerary } from "@/types/trip";

interface MapToggleContextType {
  showMap: boolean;
  toggleMap: () => void;
  setShowMap: (show: boolean) => void;
  // ⚠️ 2026-07-03 = AI 의견 하단탭 버튼이 "현재 여정 있는지" 판정 + 검증 대상 전달용(사장님 SSOT = 새 Context 만들지 말 것).
  currentItinerary: Itinerary | null;
  currentItineraryId: number | null;
  setCurrentItinerary: (itinerary: Itinerary | null, id: number | null) => void;
  aiOpinionRequestedAt: number | null;
  requestAiOpinion: () => void;
  clearAiOpinionRequest: () => void;
  // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인 = 하단탭 "Plan" = 앱의 홈버튼 개념(어디서든 눌러도 여정플래너 홈으로).
  homeRequestedAt: number | null;
  requestHome: () => void;
  clearHomeRequest: () => void;
  //   2026-07-24 사장님 승인 = payload 옵션 추가: 일별 [바로 예약하기] = {mode:'booking', day:n} 로 열면 예약 작성뷰로 오픈(무인자 호출 = 기존 그대로).
  expertRequestedAt: number | null;
  expertOpenPayload: { mode: "booking"; day: number } | null;
  requestExpert: (payload?: { mode: "booking"; day: number }) => void;
  clearExpertRequest: () => void;
  clearExpertOpenPayload: () => void;
  // ⚠️ 사장님 SSOT 2026-07-14 = 오버레이 안에서 문의접수·답변전송 직후 = 하단 탭 배지 즉시 갱신 신호(오버레이는 navigation state를 안 바꿔 폴링으로만 반영되던 지연 제거 §19). 실시간 피드백.
  expertDataChangedAt: number | null;
  bumpExpertData: () => void;
  // 📥 2026-08-03 사장님 확정 = 완성 영상 뷰 1회 열람(★·뱃지 해제) 직후 = TRIPIS 탭 뱃지 즉시 갱신 신호(위 전문가 신호와 동일 패턴 §16).
  videoDataChangedAt: number | null;
  bumpVideoData: () => void;
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 = 별도 화면 아닌 인앱 팝업(센터/상단 모달). AI의견·전문가와 동일 신호 패턴(§16 재사용). 저장·공유·전문가·프로필·여정생성(비인증) 게이트가 이걸 불러 전역 LoginSheet를 엶.
  loginRequestedAt: number | null;
  requestLogin: () => void;
  clearLoginRequest: () => void;
  // ⚠️ 사장님 SSOT 2026-07-31 = BTS 미니앱에서 하단 5버튼을 누르면 **메인앱이 위로 스르륵 올라온다**(화면 절반).
  mainAppRequestedAt: number | null;
  mainAppOpenTab: "Home" | "Profile" | null;
  requestMainApp: (tab?: "Home" | "Profile") => void;
  clearMainAppRequest: () => void;
  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = **지금 그 창(메인앱 오버레이)이 열려 있는가.**
  mainAppOverlayOpen: boolean;
  setMainAppOverlayOpen: (open: boolean) => void;
  // ⚠️ 사장님 SSOT 2026-07-25(세션2) = 로그인 성공/로그아웃 등 인증상태 변경 신호(expertDataChangedAt 패턴 복제). 로그인 팝업은 navigation focus를 안 바꿔 프로필(useFocusEffect)이 재조회 안 함 → 이 신호로 useProfile 등이 재조회 = 로그인 후 즉시 인증반영.
  authChangedAt: number | null;
  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **로그인 여부 판정은 이 1곳만**(§0·§16).
  authUser: UserData | null;
  isAuthed: boolean;
  authReady: boolean; // 저장소 첫 조회가 끝났는지(끝나기 전 "비로그인"으로 착각하지 않게)
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
  homeRequestedAt: null,
  requestHome: () => {},
  clearHomeRequest: () => {},
  expertRequestedAt: null,
  expertOpenPayload: null,
  requestExpert: () => {},
  clearExpertRequest: () => {},
  clearExpertOpenPayload: () => {},
  expertDataChangedAt: null,
  bumpExpertData: () => {},
  videoDataChangedAt: null,
  bumpVideoData: () => {},
  loginRequestedAt: null,
  requestLogin: () => {},
  clearLoginRequest: () => {},
  mainAppRequestedAt: null,
  mainAppOpenTab: null,
  requestMainApp: () => {},
  clearMainAppRequest: () => {},
  mainAppOverlayOpen: false,
  setMainAppOverlayOpen: () => {},
  authChangedAt: null,
  authUser: null,
  isAuthed: false,
  authReady: false,
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
  const [homeRequestedAt, setHomeRequestedAt] = useState<number | null>(null);
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
  const [videoDataChangedAt, setVideoDataChangedAt] = useState<number | null>(
    null,
  );
  const [loginRequestedAt, setLoginRequestedAt] = useState<number | null>(null);
  const [mainAppRequestedAt, setMainAppRequestedAt] = useState<number | null>(
    null,
  );
  const [mainAppOpenTab, setMainAppOpenTab] = useState<
    "Home" | "Profile" | null
  >(null);
  const [mainAppOverlayOpen, setMainAppOverlayOpen] = useState(false);
  const [authChangedAt, setAuthChangedAt] = useState<number | null>(null);
  const [authUser, setAuthUser] = useState<UserData | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const reload = (notify: boolean) =>
      getUserData().then((u) => {
        if (!alive) return;
        setAuthUser(u);
        setAuthReady(true);
        if (notify) setAuthChangedAt(Date.now()); // 로그인/로그아웃 시에만 다른 구독자도 갱신
      });
    reload(false); // 앱 시작 1회
    const unsubscribe = subscribeAuthChanged(() => reload(true)); // 저장/로그아웃 시 자동
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

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

  const requestAiOpinion = useCallback(() => {
    setAiOpinionRequestedAt(Date.now());
  }, []);
  const clearAiOpinionRequest = useCallback(() => {
    setAiOpinionRequestedAt(null);
  }, []);
  const requestHome = useCallback(() => {
    setHomeRequestedAt(Date.now());
  }, []);
  const clearHomeRequest = useCallback(() => {
    setHomeRequestedAt(null);
  }, []);
  // ⚠️ 사장님 SSOT 2026-07-14 = 전문가 오버레이 트리거(AI의견과 동일 트릭 = 매 요청 새 타임스탬프 → 같은 화면 재클릭도 useEffect 재실행).
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
  const bumpExpertData = useCallback(() => {
    setExpertDataChangedAt(Date.now());
  }, []);
  const bumpVideoData = useCallback(() => {
    setVideoDataChangedAt(Date.now());
  }, []);
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 팝업 트리거(AI의견·전문가와 동일 = 매 요청 새 타임스탬프 → 같은 화면 재요청도 LoginSheet useEffect 재실행). 전역 LoginSheet가 소비 후 clearLoginRequest.
  const requestLogin = useCallback(() => {
    setLoginRequestedAt(Date.now());
  }, []);
  const clearLoginRequest = useCallback(() => {
    setLoginRequestedAt(null);
  }, []);
  const requestMainApp = useCallback((tab?: "Home" | "Profile") => {
    setMainAppOpenTab(tab ?? "Home");
    setMainAppRequestedAt(Date.now());
  }, []);
  const clearMainAppRequest = useCallback(() => {
    setMainAppRequestedAt(null);
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
        homeRequestedAt,
        requestHome,
        clearHomeRequest,
        expertRequestedAt,
        expertOpenPayload,
        requestExpert,
        clearExpertRequest,
        clearExpertOpenPayload,
        expertDataChangedAt,
        bumpExpertData,
        videoDataChangedAt,
        bumpVideoData,
        loginRequestedAt,
        requestLogin,
        clearLoginRequest,
        mainAppRequestedAt,
        mainAppOpenTab,
        requestMainApp,
        clearMainAppRequest,
        mainAppOverlayOpen,
        setMainAppOverlayOpen,
        authChangedAt,
        authUser,
        isAuthed: !!authUser,
        authReady,
      }}
    >
      {children}
    </MapToggleContext.Provider>
  );
}

export function useMapToggle() {
  return useContext(MapToggleContext);
}
