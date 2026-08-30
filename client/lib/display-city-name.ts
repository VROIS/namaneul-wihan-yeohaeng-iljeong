// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 여정 화면에 도시명을 쓰는 규칙 1벌(§16 재발명 금지).
export function displayCityName(it: {
  destinationEn?: string | null;
  destination?: string | null;
}): string {
  return (it.destinationEn || "").trim() || (it.destination || "").trim();
}

// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 옛 여정에 저장된 "도심" 이름 판별 1벌(§16).
export function isCityCenterName(name?: string | null): boolean {
  return /도심/.test((name || "").trim());
}
