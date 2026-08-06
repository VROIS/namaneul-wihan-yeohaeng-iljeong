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
  // 📥 2026-08-03 사장님 확정 = 완성 영상 뷰 1회 열람(★·뱃지 해제) 직후 = TRIPIS 탭 뱃지 즉시 갱신 신호(위 전문가 신호와 동일 패턴 §16).
  videoDataChangedAt: number | null;
  bumpVideoData: () => void;
  // ⚠️ 사장님 SSOT 2026-07-25 = 로그인 = 별도 화면 아닌 인앱 팝업(센터/상단 모달). AI의견·전문가와 동일 신호 패턴(§16 재사용). 저장·공유·전문가·프로필·여정생성(비인증) 게이트가 이걸 불러 전역 LoginSheet를 엶.
  loginRequestedAt: number | null;
  requestLogin: () => void;
  clearLoginRequest: () => void;
  // ⚠️ 사장님 SSOT 2026-07-31 = BTS 미니앱에서 하단 5버튼을 누르면 **메인앱이 위로 스르륵 올라온다**(화면 절반).
  //   왜 이 방식인가: 옛것(화면 자체를 모달로 바꿔 띄우기)은 **안드로이드에서 BTS 가 완전히 사라졌다**
  //   (아이폰만 정상이라 두 OS 가 달랐다) = 삭제 §19.
  //   지금은 전문가·AI의견 오버레이와 **똑같은 방식**(SnapSheet) = 화면을 바꾸지 않고 그 위에 얹기만 한다
  //   → 뒤의 BTS 가 그대로 살아 있고, 손가락(마우스)으로 내리거나 닫을 수 있다. 두 OS 가 같게 동작(§16 재사용).
  mainAppRequestedAt: number | null;
  mainAppOpenTab: "Home" | "Profile" | null;
  requestMainApp: (tab?: "Home" | "Profile") => void;
  clearMainAppRequest: () => void;
  // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = **지금 그 창(메인앱 오버레이)이 열려 있는가.**
  //   왜 필요한가(사장님 실기기 실증): BTS 안에서 [충전하기] 를 누르면 메인앱이 **한 벌 더** 떠서
  //   화면이 3개(BTS·오버레이·새 메인앱)가 됐다. BTS 를 옆으로 밀면 뒤에서 또 다른 메인앱이 나왔다.
  //   원인 = 그 상황에서 화면 이동을 시키면 새 화면이 **쌓인다**(현재 뿌리 화면 이름이 BTS 라서).
  //   해법 = 창이 열려 있으면 이동시키지 않고 **그 창의 탭만 프로필로 바꾼다** = BTS 를 떠나지 않는다.
  mainAppOverlayOpen: boolean;
  setMainAppOverlayOpen: (open: boolean) => void;
  // ⚠️ 사장님 SSOT 2026-07-25(세션2) = 로그인 성공/로그아웃 등 인증상태 변경 신호(expertDataChangedAt 패턴 복제). 로그인 팝업은 navigation focus를 안 바꿔 프로필(useFocusEffect)이 재조회 안 함 → 이 신호로 useProfile 등이 재조회 = 로그인 후 즉시 인증반영.
  authChangedAt: number | null;
  // ⚠️ 수정금지(승인필요) — 사장님 SSOT 2026-07-27 = **로그인 여부 판정은 이 1곳만**(§0·§16).
  //   (전문가 시트·가이드 등은 판정이 아니라 서버 요청용 토큰을 저장소에서 읽음 = 같은 저장소 = 판정 갈림 없음)
  //   화면마다 각자 저장소를 읽던 옛 방식 폐기 §19 = 한 곳이라도 네트워크 결과에 로그인 상태를 묶으면
  //   로그인돼 있는데 "로그인이 필요합니다"가 떠서 매번 다시 로그인하게 됨(실기기 실증).
  //   규칙: **기기에 저장된 값만으로 판정. 서버 응답은 로그인 상태를 절대 바꾸지 않는다.**
  //   강제 로그아웃(프로필 로그아웃) 전까지 유지.
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
  // 📥 완성 영상 열람 신호(2026-08-03) = 전문가 신호 복제(§16)
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
  // 인증 상태 1벌 = 앱 시작 시 1회 + 인증변경 신호마다 저장소에서 다시 읽음(네트워크 없음).
  const [authUser, setAuthUser] = useState<UserData | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let alive = true;
    // 첫 로드는 신호를 안 찍는다(구독자들이 마운트 때 이미 1회 조회 = 중복 호출 방지).
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
  // ⚠️ 2026-07-31 = BTS 미니앱에서 메인앱을 **위로 스르륵 올리는** 신호(로그인 팝업과 같은 형식 §16).
  const requestMainApp = useCallback((tab?: "Home" | "Profile") => {
    setMainAppOpenTab(tab ?? "Home");
    setMainAppRequestedAt(Date.now());
  }, []);
  const clearMainAppRequest = useCallback(() => {
    setMainAppRequestedAt(null);
  }, []);
  // ⚠️ 2026-07-25(세션2) = 로그인 성공/로그아웃 시 호출 → 구독자(useProfile 등)가 인증 재조회(navigation focus 안 바뀌어도 즉시 반영).

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
