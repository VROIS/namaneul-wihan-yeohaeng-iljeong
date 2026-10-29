// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 유입 링크 기록 = 웹 주소 `?ref=값` 을 처음 들어온 것 1개만 이 브라우저에 남겨 가입 때 서버로 보낸다 (정본 §큰 일 4)
import { Platform } from "react-native";

const KEY = "@tripis_signup_ref";
const VALID = /^[A-Za-z0-9_-]{1,64}$/;

function storage(): Storage | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

(() => {
  try {
    const s = storage();
    if (!s || s.getItem(KEY)) return;
    const v = new URLSearchParams(window.location.search).get("ref");
    if (v && VALID.test(v)) s.setItem(KEY, v);
  } catch {}
})();

export function signupRef(): string | undefined {
  try {
    return storage()?.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}
