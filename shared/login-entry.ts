// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 인증창은 두 곳(메인 앱 / BTS 배너) = 어느 쪽으로 들어왔는지 users.referred_by 에 남긴다.
type LoginEntry = "main" | "bts";

export const LOGIN_ENTRY_MAIN: LoginEntry = "main";
export const LOGIN_ENTRY_BTS: LoginEntry = "bts";
