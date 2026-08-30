// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **결제하고 돌아왔는지**를 판별하는 곳 1벌(§0·§16).
// 사장님 지적(2026-08-06):
import { Platform } from "react-native";

export type PaymentReturn = "success" | "cancel" | null;

function readOnce(): PaymentReturn {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || !window.location) return null;
  const v = new URLSearchParams(window.location.search).get("payment");
  return v === "success" || v === "cancel" ? v : null;
}

const snapshot: PaymentReturn = readOnce();

export function readPaymentReturn(): PaymentReturn {
  return snapshot;
}
