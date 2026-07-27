// 로그인 게이트 = 비로그인/게스트면 로그인 인앱 팝업(LoginSheet) 열기, 이미 로그인이면 통과 (2026-07-25 §0.3 1벌화)
//   ⚠️ 2026-07-25 사장님 SSOT = 별도 Login 화면 이동 폐기 → requestLogin()(전역 LoginSheet 팝업). 인증분기: 로그인 인식되면 바로 통과 / 비로그인이면 팝업만.
//   TripPlanner 의 저장(useSaveItinerary)·공유/캘린더(useShareCalendar)·여정생성(useGenerateItinerary) 가 쓰는 단일 게이트.
//   ⚠️ 파일명 = use* 아님(login-gate.ts) = 이건 React 훅이 아니라 순수 함수(2026-07-27 동기 전환) = rules-of-hooks 오탐·후임 오해 방지(2026-07-21 simplify 게이트 권고 반영).
//   ⚠️ ExpertSheet.goLoginPrompt 는 인터페이스가 다름(부모콜백 onRequestLogin, expert.* i18n 키, 토큰형식검사) = 통합 대상 아님(억지 통합 시 오히려 복잡 = §0).
//   ⚠️ 2026-07-27 = 로그인 여부를 여기서 직접 읽지 않는다. 전역 1곳(MapToggleContext.isAuthed)이 판정한 값을
//   호출자가 넘겨준다(§0 판정 1벌). 저장소 직접 조회 방식 완전삭제 §19 = 화면마다 제각각 판정하던 원인.
import { Alert, Platform } from "react-native";

// 로그인 확인 → 통과 true / 미로그인(팝업 연 뒤) false. 웹 = 버튼 있는 Alert 미표시라 window.confirm 사용(§16 종전 패턴).
export function ensureLoggedIn(
  isAuthed: boolean,
  t: (key: string, opts?: any) => string,
  requestLogin: () => void,
): boolean {
  if (isAuthed) return true;

  if (Platform.OS === "web") {
    if (
      typeof window !== "undefined" &&
      window.confirm(`${t("trip.loginRequired")}\n\n${t("trip.saveLoginHint")}`)
    ) {
      requestLogin();
    }
  } else {
    Alert.alert(t("trip.loginRequired"), t("trip.saveLoginHint"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("trip.loginBtn"), onPress: () => requestLogin() },
    ]);
  }
  return false;
}
