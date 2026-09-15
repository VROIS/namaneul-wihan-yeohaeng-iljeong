// ⚠️ 수정금지(승인필요) 2026-09-07 사장님 결정 = 생년월일은 우리 것 = 외부 인증과 완전 분리(정본 §0)
// 외부 창을 열기 전에 우리가 넣어두고, 돌아오면 우리가 꺼내 쓴다. 외부는 신원만 확인한다.
import { Platform } from "react-native";

const KEY = "@nubi_birthDate";

let memory: string | null = null;

export function stashBirthDate(birthDate: string | null): void {
  memory = birthDate;
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  try {
    if (birthDate) sessionStorage.setItem(KEY, birthDate);
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장칸을 막아둔 브라우저 = memory 로 이어간다
  }
}

export function readBirthDate(): string | undefined {
  if (memory) return memory;
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined")
    return undefined;
  try {
    return sessionStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function clearBirthDate(): void {
  memory = null;
  if (Platform.OS !== "web" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 지울 수 없으면 memory 만 비운다
  }
}
