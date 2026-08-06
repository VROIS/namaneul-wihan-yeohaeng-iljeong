// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족(402) 공용 처리 1벌(§0·§16).
//   여정생성·AI의견·전문가검증·일별영상·Tripis해설 5곳이 전부 이것만 쓴다(새로 재발명 금지).
//   서버 402 응답 = {error:"insufficient_credits", message, balance, required}(server/credit-charge.ts).
import { useCallback, useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { useMapToggle } from "@/contexts/MapToggleContext";

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

/**
 * ⚠️ 수정금지(승인필요) — "크레딧이 부족합니다" 안내 + [충전하기] → 프로필(충전소) 이동. **앱 전체 1벌.**
 *
 * 쓰는 법 = `const showCreditShortfall = useCreditShortfall();` 후
 *          `showCreditShortfall(shortfall, 내창닫기?)`.
 *
 * beforeNavigate(= 내창닫기) = 이동 전에 자기 창을 닫아야 하는 호출자(모달·시트 안에서 부르는 곳)가 넘긴다.
 *   안 닫으면 프로필로 가도 그 창이 화면을 계속 덮어 "충전하기가 먹통"으로 보인다(2026-08-05 적대검증 확정).
 *
 * ⚠️ 이동이 두 갈래인 이유(2026-08-05 사장님 실기기 실증):
 *   BTS 미니앱 위에 메인앱 창이 떠 있는 상태에서 화면 이동을 시키면 메인앱이 **한 벌 더** 만들어졌다
 *   (화면 3개: BTS·그 창·새 메인앱). 여정 화면이 두 벌이면 서로의 여정칸을 지워
 *   하단 [AI의견]·[전문가] 가 갑자기 회색이 되는 사고로 이어진다(RootStackNavigator 주석에 기록된 사고).
 *   그래서 그 창이 열려 있으면 이동시키지 않고 **그 창의 탭만 프로필로 바꾼다**(BTS 를 떠나지 않는다).
 */
export function useCreditShortfall() {
  const navigation = useNavigation<{
    navigate: (name: string, params?: unknown) => void;
  }>();
  const { t } = useTranslation();
  const { mainAppOverlayOpen, requestMainApp } = useMapToggle();

  // ⚠️ 수정금지(승인필요) — 창이 열렸는지를 **부를 때 다시 본다**(값을 붙잡아 두지 않는다).
  //   가이드 미니앱의 해설 스트리밍처럼 **화면이 뜰 때 한 번만** 만들어지는 흐름이 있어서,
  //   그때 붙잡힌 옛 값(닫힘)으로 판단하면 그 사이에 창이 열려도 못 알아채고 메인앱을 또 만든다.
  const overlayOpenRef = useRef(mainAppOverlayOpen);
  useEffect(() => {
    overlayOpenRef.current = mainAppOverlayOpen;
  }, [mainAppOverlayOpen]);

  return useCallback(
    (shortfall: CreditShortfall, beforeNavigate?: () => void) => {
      const title = t("credit.shortTitle");
      const body = t("trip.creditShort", {
        balance: shortfall.balance,
        required: shortfall.required,
      });
      const goCharge = () => {
        beforeNavigate?.();
        if (overlayOpenRef.current) {
          requestMainApp("Profile");
          return;
        }
        navigation.navigate("Main", { screen: "Profile" });
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
      Alert.alert(title, body, [
        { text: t("credit.goCharge"), onPress: goCharge },
      ]);
    },
    // 창 열림 여부는 ref 로 읽으므로 여기 넣지 않는다 = 창을 여닫을 때마다 이 함수가 새로 만들어지지 않는다.
    [navigation, t, requestMainApp],
  );
}
