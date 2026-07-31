// ⚠️ 수정금지(승인필요) — 애플 로그인 "웹" 전용 경로 (2026-07-31 사장님 지시)
// 앱(iOS)은 같은 폴더의 auth-apple.ts 가 Metro 플랫폼 확장자로 자동 선택됨
// = 한 플랫폼에 경로 1벌만 존재(§0). 구조는 auth-google.web.ts 와 똑같이 맞췄다(§16).
//
// 웹에는 애플 로그인을 두지 않는다. 사장님 SSOT = 애플은 **아이폰에서만** 노출.
// 그래서 이 파일은 "여기엔 없다"고 분명히 답하는 역할만 한다.

/** 웹에는 애플 버튼을 만들지 않는다 = 항상 false */
export function isAppleAuthAvailable(): boolean {
  return false;
}

/** 웹에서는 절대 불리지 않는다(위 판단이 false 라 버튼 자체가 안 그려짐). */
export async function signInWithApple(): Promise<{
  identityToken: string;
  fullName?: string;
} | null> {
  throw new Error("애플 로그인은 아이폰에서만 사용할 수 있습니다.");
}
