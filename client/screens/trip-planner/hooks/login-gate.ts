//   ⚠️ 2026-07-25 사장님 SSOT = 별도 Login 화면 이동 폐기 → requestLogin()(전역 LoginSheet 팝업). 인증분기: 로그인 인식되면 바로 통과 / 비로그인이면 팝업만.
import { Alert, Platform } from "react-native";

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
