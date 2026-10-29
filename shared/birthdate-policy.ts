// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 생년월일 필수 · 정책 토글 1벌 = 이 값만 바꾸면 화면 표시·입력 요구가 함께 바뀐다. 외부 인증(구글·카카오·애플)은 이 값과 무관하게 항상 그대로 돈다.
type BirthDatePolicy = "required" | "optional";

const BIRTHDATE_POLICY = "required" as BirthDatePolicy;

export const BIRTHDATE_REQUIRED = BIRTHDATE_POLICY === "required";
