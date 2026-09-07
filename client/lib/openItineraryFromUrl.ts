// ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 주소(`?itineraryId=`)로 여정 열기 = 복원한 뒤 비운다(기존 route params 경로와 같은 1회성).
import { Platform } from "react-native";

function readOnce(): number | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || !window.location) return null;
  const v = new URLSearchParams(window.location.search).get("itineraryId");
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : null;
}

let pending: number | null = readOnce();

/** 렌더 중에 읽기만 한다(지우지 않는다). 지우는 것은 복원이 끝난 뒤 clearItineraryFromUrl() 이 한다. */
export function peekItineraryFromUrl(): number | null {
  return pending;
}

/** 복원을 마쳤을 때 비운다 = 화면을 다시 열어도 그 여정으로 되돌아가지 않는다. */
export function clearItineraryFromUrl(): void {
  pending = null;
}
