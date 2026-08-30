// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **결제하고 돌아왔을 때의 뒷정리 1벌.**
//   사장님 지적(2026-08-06): "결제의 출발이 프로필인데 돌아오는 곳을 프로필로 설정하지 않고
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useMapToggle } from "@/contexts/MapToggleContext";
import { readPaymentReturn } from "@/lib/paymentReturn";

export default function PaymentReturnHandler() {
  const { isAuthed, authReady } = useMapToggle();
  const { t } = useTranslation();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current || !authReady) return;
    const payment = readPaymentReturn();
    if (!payment) return; // 폰·비결제 진입은 여기서 끝(그 판별 1벌이 막는다)
    handledRef.current = true;

    window.history.replaceState({}, "", window.location.pathname);

    if (payment === "success" && !isAuthed) {
      window.alert(t("credit.returnSuccessMsg"));
    }
  }, [isAuthed, authReady, t]);

  return null;
}
