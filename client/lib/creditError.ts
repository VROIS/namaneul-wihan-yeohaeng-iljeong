// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족(402) 공용 처리 1벌(§0·§16).
//   여정생성·AI의견·전문가검증·일별영상·Tripis해설 5곳이 전부 이것만 쓴다(새로 재발명 금지).
//   서버 402 응답 = {error:"insufficient_credits", message, balance, required}(server/credit-charge.ts).
import { Alert, Platform } from "react-native";

export type CreditShortfall = { balance: number; required: number };

// 입력 두 가지 = 앱 전체가 402 를 받는 방식이 두 가지뿐이라 그렇다(그 외는 없음).
//   ① raw fetch 로 받은 JSON 객체(GuideStackNavigator·expertApi) → 칸을 그대로 읽는다.
//   ② apiRequest 가 던진 Error.message(문자열 "402: {json}") → 숫자만 뽑는다.
export function parseCreditShortfall(source: unknown): CreditShortfall | null {
  if (source && typeof source === "object") {
    const o = source as Record<string, unknown>;
    if (o.error !== "insufficient_credits") return null;
    if (typeof o.balance !== "number" || typeof o.required !== "number")
      return null;
    return { balance: o.balance, required: o.required };
  }
  if (typeof source !== "string" || !source.includes("insufficient_credits"))
    return null;
  const m = source.match(/"balance":\s*(-?\d+)[\s\S]*?"required":\s*(\d+)/);
  if (!m) return null;
  return { balance: Number(m[1]), required: Number(m[2]) };
}

// "크레딧이 부족합니다" 안내 + 확인 누르면 프로필(충전 화면)으로 이동(§16 = TripisModal 의 기존 이동 패턴 재사용).
//   beforeNavigate = 이동 전에 자기 창을 닫아야 하는 호출자(모달·시트 안에서 부르는 곳)가 넘긴다.
//   안 닫으면 프로필로 이동해도 그 창이 화면을 계속 덮어 "충전하기가 먹통"으로 보인다(2026-08-05 적대검증 확정).
export function showCreditShortfallAlert(
  navigation: { navigate: (name: string, params?: unknown) => void },
  shortfall: CreditShortfall,
  t: (key: string, opts?: Record<string, unknown>) => string,
  beforeNavigate?: () => void,
): void {
  const title = t("credit.shortTitle");
  const body = t("trip.creditShort", {
    balance: shortfall.balance,
    required: shortfall.required,
  });
  const goCharge = () => {
    beforeNavigate?.();
    navigation.navigate("Main", { screen: "Profile" } as never);
  };

  // ⚠️ 웹(react-native-web)의 Alert.alert 은 **본문이 빈 함수** = 안내도 이동도 아무것도 안 일어난다
  //   (node_modules/react-native-web/dist/exports/Alert/index.js = `static alert() {}` 실측 2026-08-05).
  //   = 같은 저장소의 웹세이프 관례(ExpertSheet 의 notify/goLoginPrompt)와 동일하게 window 로 띄운다.
  //   버튼이 1개(충전하기)뿐이라 웹은 alert 확인 = 곧 이동 = 앱과 같은 동작.
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${body}`);
    goCharge();
    return;
  }
  Alert.alert(title, body, [{ text: t("credit.goCharge"), onPress: goCharge }]);
}
