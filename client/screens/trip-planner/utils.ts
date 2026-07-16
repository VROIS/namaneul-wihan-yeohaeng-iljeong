// 날짜·시간 포맷 유틸 = TripPlannerScreen 분리(2026-07-15 §0 슬림화, 순수 이동)
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 🗓️ 2026-07-03 = 요약헤더 날짜 축약 "2026-07-03"→"26년 07-03" (연도 2자리+년, 390px 가격잘림 방지). 형식 다르면 원본 그대로.
export function shortDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!m) return isoDate || "";
  return `${m[1].slice(2)}년 ${m[2]}-${m[3]}`;
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
