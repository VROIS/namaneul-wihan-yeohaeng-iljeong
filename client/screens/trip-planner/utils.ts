// 날짜·시간 포맷 유틸 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)

// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = 텍스트 줄바꿈 방지 공용 1벌(독일어 실기기 실증).
//   §22 판단검증 적발 = ResultStep.tsx·DailyTotal.tsx 가 같은 3종 prop 을 리터럴로 재복사했던 것을
//   이 1벌 재사용으로 교체(§0). 칩(2줄 허용)과 버튼(1줄 고정)이 numberOfLines 만 달라 2벌로 분리.
export const fitTextProps = {
  numberOfLines: 2 as const,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.75,
};
export const fitTextPropsSingleLine = {
  numberOfLines: 1 as const,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.75,
};
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ⚠️ 수정금지(승인필요) 2026-08-13 사장님 승인 = 요약헤더 날짜 축약 "2026-07-03"→"26.07-03"
//   (연도 2자리+"." , 390px 가격잘림 방지). "년"(한국어 전용) 삭제 = 숫자+기호만 써서 다국어 공통 표기.
//   형식 다르면 원본 그대로.
export function shortDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!m) return isoDate || "";
  return `${m[1].slice(2)}.${m[2]}-${m[3]}`;
}

export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function parseTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}
