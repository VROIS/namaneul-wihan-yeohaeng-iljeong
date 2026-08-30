// ⚠️ 수정금지(승인필요) — 애플 로그인 "웹" 전용 경로 (2026-07-31 사장님 지시)

export function isAppleAuthAvailable(): boolean {
  return false;
}

export async function signInWithApple(): Promise<{
  identityToken: string;
  fullName?: string;
} | null> {
  throw new Error("애플 로그인은 아이폰에서만 사용할 수 있습니다.");
}
