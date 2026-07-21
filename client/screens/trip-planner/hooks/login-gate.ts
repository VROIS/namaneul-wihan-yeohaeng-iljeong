// 로그인 게이트 = 비로그인/게스트면 로그인 안내 후 Login 화면 이동, 이미 로그인이면 통과 (2026-07-21 §0.3 1벌화)
//   TripPlanner 의 저장(useSaveItinerary)·공유/캘린더(useShareCalendar) 가 쓰던 동일 로직을 단일 함수로 통합.
//   ⚠️ 파일명 = use* 아님(login-gate.ts) = 이건 React 훅이 아니라 순수 async 함수 = rules-of-hooks 오탐·후임 오해 방지(2026-07-21 simplify 게이트 권고 반영).
//   ⚠️ ExpertSheet.goLoginPrompt 는 인터페이스가 다름(navigation 없이 부모콜백 onRequestLogin, expert.* i18n 키, 토큰형식검사) = 통합 대상 아님(억지 통합 시 오히려 복잡 = §0).
//   getUserData() null = 게스트(둘러보기 토큰만)·비로그인 모두 포함 = 조용한 먹통 방지.
import { Alert, Platform } from "react-native";
import { getUserData } from "@/lib/auth";

// 로그인 확인 → 통과 true / 미로그인(안내 표시 후) false. 웹 = 버튼 있는 Alert 미표시라 window.confirm 사용(§16 종전 패턴).
export async function ensureLoggedIn(
  t: (key: string, opts?: any) => string,
  navigation: { navigate: (screen: any) => void },
): Promise<boolean> {
  const userData = await getUserData();
  if (userData) return true;

  if (Platform.OS === "web") {
    if (
      typeof window !== "undefined" &&
      window.confirm(`${t("trip.loginRequired")}\n\n${t("trip.saveLoginHint")}`)
    ) {
      navigation.navigate("Login");
    }
  } else {
    Alert.alert(t("trip.loginRequired"), t("trip.saveLoginHint"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("trip.loginBtn"), onPress: () => navigation.navigate("Login") },
    ]);
  }
  return false;
}
