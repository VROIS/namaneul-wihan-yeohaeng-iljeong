// 여정 플래너 핵심 훅 = 상태·효과·복원 + 서브훅 조립 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
// (옛 미사용 state activeDay = 사용처 0 = §19 완전삭제)
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ScrollView,
  useColorScheme,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "@/constants/theme";
import { TripFormData, Vibe, DayAccommodation, Itinerary } from "@/types/trip";
import { apiRequest } from "@/lib/query-client";
import { useMapToggle } from "@/contexts/MapToggleContext";
import { UserData } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { MainTabParamList } from "@/navigation/MainTabNavigator";
import { formatDate } from "../utils";
import { usePickers } from "./usePickers";
import { useAccommodations } from "./useAccommodations";
import { useAiOpinionOverlay } from "./useAiOpinionOverlay";
import { useSaveItinerary } from "./useSaveItinerary";
import { useShareCalendar } from "./useShareCalendar";
import { useGenerateItinerary } from "./useGenerateItinerary";

type ScreenState = "Input" | "Loading" | "Result";

// ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = initialRequest = BTS 가 조립한 폼(공연도시·핀·공연장 기점).
//   있으면 폼 초기값으로 쓰고 마운트 시 자동 생성 1회. 없으면 = 기존과 완전 동일(메인앱 영향 0).
export function useTripPlanner(initialRequest?: Partial<TripFormData>) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // 🗂️ 2026-07-03 = 저장여정 복원용 route param(itineraryId). 프로필 나의여정 카드 탭 시 전달됨.
  // ⚠️ 수정금지(승인필요) 2026-07-31 = **화면 밖에서 열려도 안 터지게** 한 것.
  //   사고: 이 화면을 BTS 위에 창(모달)으로 띄우면 "지금 어느 화면이냐"를 물어볼 곳이 없어
  //   `useRoute()` 가 그 자리에서 앱을 죽였다("Couldn't find a route object", 2026-07-30 실측).
  //   여기서 쓰는 값은 **저장여정 복원 번호 하나뿐**이고, 창으로 열 때는 그 번호가 애초에 없다.
  //   그래서 물어볼 곳이 없으면 조용히 **없음**으로 두고 화면은 정상 동작하게 한다.
  //   (탭에서 평소처럼 열 때는 옛날 그대로 번호를 받는다 = 저장여정 복원 기능 손상 0)
  let restoreItineraryId: number | undefined;
  try {
    const route = useRoute<RouteProp<MainTabParamList, "Home">>();
    restoreItineraryId = route.params?.itineraryId;
  } catch {
    restoreItineraryId = undefined; // 창으로 열린 경우 = 복원할 여정이 없음
  }
  const [screen, setScreen] = useState<ScreenState>("Input");
  const [loadingStep, setLoadingStep] = useState(0);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  // ✅ 수정: spinValue를 useRef로 관리 (렌더링마다 재생성 방지)
  const spinValue = React.useRef(new Animated.Value(0)).current;
  // ⚠️ 2026-07-03 = 지도는 항상 고정 표시(showMap 미사용). setCurrentItinerary만 사용 = 하단탭 "AI 의견" 버튼 활성화·검증대상 전달.
  const {
    setCurrentItinerary,
    // ⚠️ 2026-07-31 = FE-5 잠금용 = 전역 "현재 여정"(이 화면이 2벌 돌 때 신호 주인 판별).
    currentItinerary: globalCurrentItinerary,
    aiOpinionRequestedAt,
    clearAiOpinionRequest,
    requestAiOpinion,
    // ⚠️ 2026-07-25 = requestExpert만 사용(일별 바로예약 버튼=DailyTotal). expert 오버레이 열림/신호수신은 전역 ExpertOverlay(App)로 이관(§19).
    requestExpert,
    authUser,
    // ⚠️ 2026-07-31 = BTS 자동생성(FE-4)의 로그인 대기용(§22 검증 = 비로그인 잠금 소진 방지).
    isAuthed,
    // 🔒 2026-08-05 사장님 SSOT = 여정 슬롯 [해설 듣기] 관문용(PlaceSlotCard 로 내려보냄).
    requestLogin,
  } = useMapToggle();
  const { t, i18n } = useTranslation();

  const LOADING_MESSAGES = useMemo(
    () => [
      t("trip.loading1"),
      t("trip.loading2"),
      t("trip.loading3"),
      t("trip.loading4"),
    ],
    [t],
  );
  // ⚠️ 2026-07-03 사장님 SSOT = 재저장 판별용 여정 DB id. 복원(프로필 카드 탭)/저장 성공 시 세팅 = 이 화면 재저장 시 같은 행 덮어쓰기(PUT).
  //   null = 신규 여정 = 저장 시 새 행(POST). (버튼 잠금 아님 = justSaved 와 별개.)
  const [currentItineraryId, setCurrentItineraryId] = useState<number | null>(
    null,
  );
  // 🔗 2026-07-21 = 공유 링크(/shared/itinerary/:id)로 들어온 열람인지 표시. true면 restoreItineraryById가 currentItineraryId를 null로 유지(원본 보호).
  const [sharedEntry, setSharedEntry] = useState(false);
  // 🎬 2026-07-22 사장님 SSOT = 영상 버튼은 "프로필 카드로 복원한 저장 여정"에서만 저장버튼 자리에 노출.
  //   신규 생성 여정 = 저장버튼 원래 기능 유지(저장 후에도 안 바뀜). 복원 = "이 여정을 영상으로 봐야지" 내비게이션.
  const [restoredTrip, setRestoredTrip] = useState(false);
  // 🗺️ 2026-06-28 = 지도 마커 클릭 → 해당 슬롯 스크롤 (= ScrollView ref + 슬롯별 y좌표 기록)
  const resultScrollRef = useRef<ScrollView | null>(null);
  const slotLayoutsRef = useRef<Record<string, number>>({});
  // 🗺️ 2026-06-28 = 지도 = 스크롤 따라 보이는 Day 자동 전환 (= Day별 시작 y 기록 + onScroll 감지 → 그 Day 슬롯+숙소깃발)
  const dayLayoutsRef = useRef<Record<number, number>>({});
  const placesListOffsetRef = useRef<Record<number, number>>({});
  const [currentMapDay, setCurrentMapDay] = useState(1);
  // 🗺️ 2026-06-28 사용자 SSOT = 슬롯(이미지外) 터치 → 지도 그 마커 포커스 (= 양방향 연동, 썸네일터치=외부구글맵 분리)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  // 🎯 로그인된 사용자 정보 (birthDate 포함)
  // ⚠️ 2026-07-27 = 로그인 사용자 = 전역 1곳(authUser)만 읽음. 마운트 때 1회만 읽던 자기 사본 폐기 §19
  //   (인앱 로그인 후에도 옛 값이 남아 여정 요청의 사용자 id 가 갈리던 문제).
  const currentUser: UserData | null = authUser;

  const [formData, setFormData] = useState<TripFormData>({
    birthDate: "", // 🔧 필수 입력값으로 변경
    companionType: "Family",
    companionCount: 4,
    companionAges: "55, 59",
    curationFocus: "Everyone",
    destination: "Paris",
    startDate: formatDate(new Date()),
    startTime: "09:00",
    endDate: formatDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
    endTime: "21:00",
    // 🎯 2026-06-30 = 초기 기본값 Foodie→Shopping 대체(§19, 사장님 SSOT). Foodie=버튼 폐기됨→toggleVibe로 끌 방법 없음→유령값이 vibes배열에 영구잔존→헤더 "& 미식" 오염 버그. Healing은 원래값 유지, Foodie자리를 실재버튼 Shopping이 대체. (백엔드 폴백 5곳도 동일히 Foodie→Shopping, WORKLOG:96 정합)
    vibes: ["Healing", "Shopping"],
    travelStyle: "Reasonable", // 기본값
    travelPace: "Relaxed",
    mobilityStyle: "WalkMore",
    // ⚠️ 2026-07-31 = BTS 폼(initialRequest) 있으면 그 값이 기본값을 덮음(마운트 1회) = FE-4.
    ...(initialRequest ?? {}),
  });

  // ── 서브훅 조립(분리 전과 동일 상태·핸들러, 파일만 분리 §0) ──
  const {
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    setAiOpinionData,
    aiOpinionError,
  } = useAiOpinionOverlay({
    itinerary,
    currentItineraryId,
    aiOpinionRequestedAt,
    clearAiOpinionRequest,
    globalCurrentItinerary,
    t,
    i18n,
  });

  const {
    dayAccommodations,
    setDayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    isReoptimizing,
    handleSetDayAccommodation,
  } = useAccommodations({ itinerary, setItinerary, formData, t });

  const { isSaving, justSaved, handleSaveItinerary } = useSaveItinerary({
    itinerary,
    dayAccommodations,
    aiOpinionData,
    formData,
    currentItineraryId,
    setCurrentItineraryId,
    t,
    i18n,
  });

  // 🔗📅 2026-07-21 = 여정 공유(시스템 공유시트)·캘린더 저장(.ics) 서브훅 조립(§16 = useSaveItinerary 바로 다음).
  const { sharingAction, handleShareItinerary, handleSaveCalendar } =
    useShareCalendar({
      itinerary,
      currentItineraryId,
      handleSaveItinerary,
      t,
    });

  const { handleGenerate } = useGenerateItinerary({
    formData,
    currentUser,
    setScreen,
    setLoadingStep,
    setItinerary,
    setAiOpinionData,
    setDayAccommodations,
    setCurrentItineraryId,
    t,
    i18n,
  });

  const pickers = usePickers({ formData, setFormData });

  // ⚠️ 2026-07-31 사장님 지시(BTS 문제점1) = 결과화면 ← = BTS 로 열렸으면(폼 실림) **직전 카드 화면으로 복귀**.
  //   옛것(무조건 입력화면)은 BTS 안에서 메인 입력폼이 떠버려 카드 화면으로 돌아갈 길이 없었다(이탈 갇힘).
  //   카드 선택은 BTSContext 에 살아 있음 = 재조정 후 다시 "같이 떠나요" = 재생성(무료).
  const handleExitResult = useCallback(() => {
    if (initialRequest && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    setScreen("Input");
  }, [initialRequest, navigation]);

  // ⚠️ 2026-07-31 사장님 승인(BTS D단계 FE-4) = 폼을 실어 열렸으면(같이 떠나요) 입력화면 건너뛰고 즉시 생성 1회.
  //   ref 잠금 = 1회만. **로그인 확인 후에만 잠금**(§22 검증) — 비로그인 상태에서 잠가버리면
  //   로그인해도 재발사가 없어 사용자가 입력화면에 방치됐다. 로그인되면(isAuthed) 그때 1회 발사.
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    if (!initialRequest || autoGeneratedRef.current || !isAuthed) return;
    autoGeneratedRef.current = true;
    handleGenerate();
  }, [initialRequest, isAuthed, handleGenerate]);

  // ⚠️ 2026-07-03 사장님 SSOT = "이 화면에 지도 섹션(필수 요소)이 있는가"로 판단 = screen==="Result"일 때만 활성.
  //   지도(ItineraryMap)도 ResultStep 안에서 screen==="Result"일 때만 그려짐 = 동일 조건 재사용.
  //   itinerary 유무만으로는 안 됨(결과화면 뒤로가기 후 Input에서도 itinerary가 남아있어 오작동).
  // ⚠️ 2026-07-31 = **내가 올린 여정만 내린다**(BTS D단계 = 이 화면이 2벌 돌게 되며 §22 검증이 잡음).
  //   옛것(무조건 null 덮기)은 = BTS 결과가 떠 있는데 [일정] 창을 열면 새 벌이 마운트되자마자
  //   전역 여정을 null 로 밟아 [AI의견]·[전문가]가 회색으로 죽었다 → 남의 여정은 안 밟는다.
  //   전역값은 **ref 로만 읽음**(의존성 아님) = 두 벌이 동시에 결과화면이어도 서로의 도장에
  //   반응해 무한 교대 갱신(핑퐁)하는 경로 자체가 없음(§22 검증 지적) = 마지막에 결과 도달한 벌이 주인.
  const globalItineraryRef = useRef(globalCurrentItinerary);
  useEffect(() => {
    globalItineraryRef.current = globalCurrentItinerary;
  });
  useEffect(() => {
    if (screen === "Result") {
      setCurrentItinerary(itinerary, currentItineraryId);
    } else if (
      globalItineraryRef.current &&
      globalItineraryRef.current === itinerary
    ) {
      setCurrentItinerary(null, null);
    }
  }, [screen, itinerary, currentItineraryId, setCurrentItinerary]);

  // 언마운트 = 전역이 아직 내 여정을 가리키면 내림(창 닫힘 뒤 죽은 여정이 전역에 남아
  //   AI의견 버튼이 살아 보이는데 응답할 화면이 없는 먹통 방지 = §22 검증 시나리오 B).
  const unmountGuardRef = useRef({
    mine: null as Itinerary | null,
    global: null as Itinerary | null,
    clear: setCurrentItinerary,
  });
  useEffect(() => {
    unmountGuardRef.current.mine = screen === "Result" ? itinerary : null;
    unmountGuardRef.current.global = globalCurrentItinerary;
    unmountGuardRef.current.clear = setCurrentItinerary;
  });
  useEffect(() => {
    return () => {
      const g = unmountGuardRef.current;
      if (g.mine && g.mine === g.global) g.clear(null, null);
    };
  }, []);

  // 🎯 로그인 사용자의 생년월일을 입력폼에 반영. 전역 판정(authUser)이 바뀌면 따라감
  //   (마운트 때 저장소를 1회만 읽던 옛 방식 폐기 §19 = 인앱 로그인 후에도 옛 값이 남던 원인).
  useEffect(() => {
    if (!authUser) return;
    setFormData((prev) => ({
      ...prev,
      birthDate: authUser.birthDate || prev.birthDate,
    }));
  }, [authUser]);

  // 🗂️ 2026-07-03 사용자 SSOT = 저장여정 복원 = 단일 함수(§16). 프로필 "나의 여정" 카드 탭·전문가 답변함 문의 탭·공유링크 열람 공용.
  //   itineraryId → GET raw_data → 여정 결과화면(ResultStep) 재현. setItinerary + 숙소깃발 + 요약헤더 formData 스칼라 + Result 전환.
  //   ⚠️ 2026-07-21 = opts.shared=true(공유링크 열람) 시 setCurrentItineraryId를 null로 유지 = 열람자가 저장 눌러도
  //   PUT(원본 덮어쓰기)이 아니라 POST(내 여정 새 행)로 감 = 타인 원본 보호. 기본(opts 없음=프로필 카드 복원)은 종전과 동일하게 targetId 세팅.
  const restoreItineraryById = useCallback(
    async (targetId: number, opts?: { shared?: boolean }) => {
      try {
        const res = await apiRequest("GET", `/api/itineraries/${targetId}`);
        const data = await res.json();
        const raw = data?.rawData;
        if (!raw || !raw.days) {
          console.warn(
            "[TripPlanner] 저장여정 복원 실패: rawData 없음",
            targetId,
          );
          return;
        }
        setItinerary(raw as Itinerary);
        setAiOpinionData((raw as any).verification?.result ?? null);
        // ⚠️ 수정금지(승인필요) 2026-08-13 = 이름 없는 것(서버 깃발용 좌표)은 실제 숙소가 아니므로 제외.
        const accoms: DayAccommodation[] = (raw.days || [])
          .filter(
            (d: any) => d.accommodation?.coords?.lat && d.accommodation?.name,
          )
          .map((d: any) => ({
            day: d.day,
            name: d.accommodation.name,
            address: d.accommodation.address || "",
            coords: d.accommodation.coords,
            placeId: d.accommodation.placeId,
          }));
        setDayAccommodations(accoms);
        // ⚠️ 수정금지(승인필요) 2026-08-13 사장님 SSOT = 입력화면 = 앱의 홈 = 항상 디폴트 상태.
        //   travelStyle/travelPace/mobilityStyle 은 넣지 마라(DB값이 선택지 id 와 달라 버튼이 전부 풀림 → 생성 500).
        setFormData((prev) => ({
          ...prev,
          destination: raw.destination || prev.destination,
          companionType: data.companionType || prev.companionType,
          companionCount: data.companionCount ?? prev.companionCount,
          curationFocus: data.curationFocus || prev.curationFocus,
          vibes:
            Array.isArray(data.vibes) && data.vibes.length
              ? data.vibes
              : prev.vibes,
        }));
        setCurrentItineraryId(opts?.shared ? null : targetId);
        setSharedEntry(!!opts?.shared);
        setRestoredTrip(!opts?.shared); // 프로필 카드 복원 = 헤더 저장버튼 → 영상 버튼 전환(공유 열람 제외)
        setScreen("Result");
      } catch (e) {
        console.warn("[TripPlanner] 저장여정 복원 오류:", e);
      }
    },
    [],
  );

  // ⚠️ 2026-08-03 사장님 지적 실증 = **같은 여정을 다시 열면 먹통**(도시카드 [코스] 1회는 뜨고 2회째 무반응,
  //   파리·마드리드·뮌헨 동일). 레이턴시가 아니라 구조 문제였다: 이 복원은 **번호가 바뀔 때만** 돈다.
  //   같은 도시를 다시 누르면 번호가 그대로라 바뀐 것이 없어 아무 일도 안 일어났다
  //   (실증: 같은 도시 = 무반응 / 다른 도시로 바꾸면 = 정상 동작).
  //   → 복원한 뒤 번호를 **비운다**. 그러면 다음에 같은 번호가 와도 "없음 → 번호" 로 바뀌어 확실히 돈다.
  //   보내는 쪽 4곳(도시카드·프로필 여정카드·전문가 답변함·전문가 오버레이)은 손대지 않는다 = 받는 쪽 1벌만(§0).
  useEffect(() => {
    if (!restoreItineraryId) return;
    restoreItineraryById(restoreItineraryId);
    try {
      navigation.setParams({ itineraryId: undefined } as never);
    } catch {
      // 창(모달)으로 열린 경우 = 비울 route 자체가 없음 = 위 useRoute 와 같은 방어
    }
  }, [restoreItineraryId, restoreItineraryById, navigation]);

  // 새 여정 생성 시작(Loading) = 복원 상태 해제 = 신규 여정 화면은 저장버튼 원래 기능으로 복귀
  useEffect(() => {
    if (screen === "Loading") setRestoredTrip(false);
  }, [screen]);

  // 🔗 2026-07-21 = 웹 공유링크 진입(/shared/itinerary/:id) = 서버는 이미 SPA 폴백이 이 경로에 index.html 서빙(server/index.ts:223-232, 신규 라우트 0)
  //   + GET /api/itineraries/:id 인증 0(개발 전체공개 = 게이트 추가 금지). 마운트 시 pathname 1회 파싱(useLogin.ts:130-143 패턴 준용) → shared:true로 복원.
  //   1회 실행 가드(ref) = 로그인 왕복 후 pathname이 남아있어도(§ useLogin replaceState) 재실행돼 반복 재진입하는 것 방지.
  const sharedDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (sharedDeepLinkHandled.current) return;
    const m = window.location.pathname.match(/^\/shared\/itinerary\/(\d+)$/);
    if (!m) return;
    sharedDeepLinkHandled.current = true;
    restoreItineraryById(Number(m[1]), { shared: true });
  }, [restoreItineraryById]);

  useEffect(() => {
    if (screen === "Loading") {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        }),
      ).start();
    }
  }, [screen]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const toggleVibe = (vibe: Vibe) => {
    setFormData((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(vibe)
        ? prev.vibes.filter((v) => v !== vibe)
        : [...prev.vibes, vibe].slice(-3),
    }));
  };

  return {
    // 컨텍스트·테마
    theme,
    insets,
    navigation,
    t,
    i18n,
    // 🔒 2026-08-05 사장님 SSOT = 슬롯 [해설 듣기] 관문에 필요(판정은 전역 1곳 MapToggleContext, 여기선 전달만).
    isAuthed,
    requestLogin,
    // BTS 문제점1 = 결과화면 ← 의 단일 출구(카드 복귀 vs 입력화면)
    handleExitResult,
    // ⚠️ 2026-08-01 사장님 지시 = **마지막 슬롯이 고정된 여정**이면 [숙소 변경]을 숨긴다.
    //   사유(실측): 숙소를 바꾸면 그 날을 통째로 다시 짜는데(regenerate-day) 그 경로는
    //   **고정 슬롯(공연장)을 모른다** → 마지막에 있어야 할 공연장이 1번 자리에 20:00 으로 박혔다.
    //   BTS 는 출발지가 공연장으로 고정(사장님 결정3)이라 애초에 바꿀 이유도 없다.
    //   ⚠️ 판단 기준 = `finalPlaceId` **1벌**(§16). 옛 `!!initialRequest`(= 폼이 밖에서 왔나) 폐기 §19 —
    //     그건 "누가 만들었나"라 데이터 성질과 갈라졌다: 공연장 행이 없는 도시면 initialRequest 는 있는데
    //     finalPlaceId 는 없어 **버튼만 사라지고 차단은 안 걸리는** 상태가 됐다(§22 검증 2종이 잡음).
    hasFixedFinalPlace: !!formData.finalPlaceId,
    // 화면 상태
    screen,
    setScreen,
    loadingStep,
    LOADING_MESSAGES,
    spin,
    // 여정·폼
    itinerary,
    formData,
    setFormData,
    toggleVibe,
    restoreItineraryById,
    // 생성·저장
    handleGenerate,
    isSaving,
    justSaved,
    handleSaveItinerary,
    currentItineraryId, // 🎬 영상 슬롯이 쓰는 여정 id
    restoredTrip, // 🎬 프로필 카드 복원 여정 = 헤더 저장버튼 → 영상 버튼 전환(2026-07-22 사장님 SSOT, 신규 여정은 저장버튼 유지)
    // 🔗📅 공유·캘린더(2026-07-21 신규, ResultStep footer 버튼 2개가 이 이름 그대로 참조 = D와 인터페이스 계약)
    sharingAction, // "share" | "calendar" | null = 눌린 버튼만 선택색+스피너 (2026-07-22 사장님 실기기 피드백)
    handleShareItinerary,
    handleSaveCalendar,
    sharedEntry,
    // 숙소
    dayAccommodations,
    hotelModalDay,
    setHotelModalDay,
    isReoptimizing,
    handleSetDayAccommodation,
    // AI 의견·전문가 오버레이
    aiOpinionVisible,
    setAiOpinionVisible,
    aiOpinionLoading,
    aiOpinionData,
    aiOpinionError,
    requestAiOpinion,
    requestExpert,
    // 지도·스크롤 연동
    resultScrollRef,
    slotLayoutsRef,
    dayLayoutsRef,
    placesListOffsetRef,
    currentMapDay,
    setCurrentMapDay,
    selectedSlotId,
    setSelectedSlotId,
    // 픽커
    ...pickers,
  };
}

export type PlannerApi = ReturnType<typeof useTripPlanner>;
