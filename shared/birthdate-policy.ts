// ⚠️ 수정금지(승인필요) 2026-08-24 사장님 승인 = 생년월일 수집 정책 **토글 1벌**(화면·서버 공용 SSOT).
export type BirthDatePolicy = "required" | "optional";

export const BIRTHDATE_POLICY: BirthDatePolicy = "optional";

export const BIRTHDATE_REQUIRED = BIRTHDATE_POLICY === "required";
