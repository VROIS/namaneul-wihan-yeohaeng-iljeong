// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 웹 주소(`?city=도시번호`)로 들어오면 첫 화면에서 그 도시 칩을 누른 상태(도시 카드 열림) = 한 번 쓰면 비운다(openItineraryFromUrl 과 같은 1회 읽기) (정본 §큰 일 4)
import { Platform } from "react-native";

function readOnce(): number | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || !window.location) return null;
  const v = new URLSearchParams(window.location.search).get("city");
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : null;
}

let pending: number | null = readOnce();

export function takeCityFromUrl(): number | null {
  const v = pending;
  pending = null;
  return v;
}
