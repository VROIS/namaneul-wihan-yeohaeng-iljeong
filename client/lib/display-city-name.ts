// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 여정 화면에 도시명을 쓰는 규칙 1벌(§16 재발명 금지).
//   쓰는 곳 = 결과화면 헤더(ResultStep) · 출발바("OO 도심", DaySection) · 지도 출발 깃발 라벨.
//
// 왜 필요한가(실측): 여정의 `destination` 은 **생성 시점 입력값이 그대로 굳는다**("리마").
//   그래서 앱 언어를 영어로 바꿔도 결과화면 헤더·출발바만 한국어로 남았다(여정 307건 중 109건이 한국어).
//   서버가 `destinationEn`(cities.name_en, 121개 도시 전부 보유 = 결측 0)을 함께 실어주므로 그걸 먼저 쓴다.
//   옛 여정에는 그 칸이 없어 destination 으로 폴백한다 = 화면이 비는 일은 없다.
export function displayCityName(it: {
  destinationEn?: string | null;
  destination?: string | null;
}): string {
  return (it.destinationEn || "").trim() || (it.destination || "").trim();
}

// ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = 옛 여정에 저장된 "도심" 이름 판별 1벌(§16).
//   서버가 숙소 미입력 시 "{도시} 도심"·"도심 기준" 을 한국어로 만들어 저장하던 옛 동작(2026-08-21 §19 로
//   서버는 이름을 비우게 바뀜) 때문에, 이미 저장된 여정에는 그 한국어가 남아 있다. 그 값은 실제 숙소가
//   아니라 "도심 기준" 표식일 뿐이므로 화면에서 무시하고 뷰어 언어로 다시 조립한다.
export function isCityCenterName(name?: string | null): boolean {
  return /도심/.test((name || "").trim());
}
