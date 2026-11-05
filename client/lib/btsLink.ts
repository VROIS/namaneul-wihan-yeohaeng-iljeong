// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 웹 주소 `?bts` 로 들어오면 메인 첫 화면 뒤 곧바로 BTS 랜딩 = 한 번 쓰면 비운다(cityLink 와 같은 1회 읽기) (정본 2026-11-05)
import { Platform } from "react-native";

function readOnce(): boolean {
  if (Platform.OS !== "web") return false;
  if (typeof window === "undefined" || !window.location) return false;
  return new URLSearchParams(window.location.search).has("bts");
}

let pending = readOnce();

export function takeBtsFromUrl(): boolean {
  const v = pending;
  pending = false;
  return v;
}
