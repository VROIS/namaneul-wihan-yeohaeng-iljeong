// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "그 매트릭스대로 들어가야지. 옛 것을 왜 살려" = 지금 코드: 나이 = 생년월일 실계산 + 가족 나이 추정(자녀 = 본인−30 · 부모 = 본인+25) 2개만 · 동반자 나이 문자열을 읽던 옛 주인공 문장 생성기 삭제 (정본 2026-11-01)
export function calculateAge(birthDate?: string): number | null {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

interface FamilyAgeEstimate {
  userAge: number;
  userAgeGroup: string; // "30대", "40대" 등
  estimatedChildAge: number; // 추정 자녀 나이
  estimatedParentAge: number; // 추정 부모님 나이
  childAgeGroup: string; // "영유아", "초등학생", "청소년", "성인 자녀"
  parentAgeGroup: string; // "60대", "70대", "80대"
}

export function estimateFamilyAges(userAge: number): FamilyAgeEstimate {
  const estimatedChildAge = Math.max(0, userAge - 30);

  const estimatedParentAge = userAge + 25;

  const userAgeGroup = `${Math.floor(userAge / 10) * 10}대`;

  let childAgeGroup: string;
  if (estimatedChildAge < 1) {
    childAgeGroup = "아직 미출생 (또는 영아)";
  } else if (estimatedChildAge < 6) {
    childAgeGroup = "영유아";
  } else if (estimatedChildAge < 13) {
    childAgeGroup = "초등학생";
  } else if (estimatedChildAge < 20) {
    childAgeGroup = "청소년";
  } else {
    childAgeGroup = "성인 자녀";
  }

  const parentAgeGroup = `${Math.floor(estimatedParentAge / 10) * 10}대`;

  return {
    userAge,
    userAgeGroup,
    estimatedChildAge,
    estimatedParentAge,
    childAgeGroup,
    parentAgeGroup,
  };
}
