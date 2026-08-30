// ⚠️ 수정금지(승인필요) 2026-08-05 사장님 SSOT = 크레딧부족(402) 공용 처리 1벌(§0·§16).
import { useCallback, useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { useMapToggle } from "@/contexts/MapToggleContext";

export type CreditShortfall = { balance: number; required: number };

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

/** ⚠️ 수정금지(승인필요) — "크레딧이 부족합니다" 안내 + [충전하기] → 프로필(충전소) 이동. **앱 전체 1벌.** */
/** ⚠️ 이동이 두 갈래인 이유(2026-08-05 사장님 실기기 실증): */
export function useCreditShortfall() {
  const navigation = useNavigation<{
    navigate: (name: string, params?: unknown) => void;
  }>();
  const { t } = useTranslation();
  const { mainAppOverlayOpen, requestMainApp } = useMapToggle();

  // ⚠️ 수정금지(승인필요) — 창이 열렸는지를 **부를 때 다시 본다**(값을 붙잡아 두지 않는다).
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

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.alert(`${title}\n\n${body}`);
        goCharge();
        return;
      }
      Alert.alert(title, body, [
        { text: t("credit.goCharge"), onPress: goCharge },
      ]);
    },
    [navigation, t, requestMainApp],
  );
}
