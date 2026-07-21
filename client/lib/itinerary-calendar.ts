// ⚠️ 수정금지(승인필요) — 여정 캘린더 저장 = 플랫폼별 원탭 진입 (2026-07-21 재구현 = docs/2026-07-21 여정공유·캘린더저장 명세.md)
//   iOS = 서버 .ics(https)를 Safari로 열기 → iOS 네이티브 "일정 추가" 미리보기(웹 표준 방식, 애플캘린더 직행).
//   Android(삼성 포함)·웹 = Google Calendar render 링크 → 구글캘린더 앱/웹 일정 편집화면 → 저장 = 원탭.
//   옛 .ics 파일 생성·공유시트(shareAsync) 방식 완전삭제 = 2026-07-21 §19 (캘린더 앱이 공유시트에 안 떠 실사용 불가 실증).
//   신규 패키지 0 = iOS Expo Go OTA 안전. ICS 생성 = 서버 1벌만(server/itinerary-ics.ts §0).
import { Linking, Platform } from "react-native";
import type { Itinerary } from "@/types/trip";

// startDate("YYYY-MM-DD") 기준 day번째(1-base) 날짜 (로컬 Date 연산)
function dayToDate(startDate: string, day: number): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  base.setDate(base.getDate() + (day - 1));
  return base;
}

function toYYYYMMDD(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${mm}${dd}`;
}

// Google Calendar render 링크 = 링크당 이벤트 1개 제한 → 여행 전체 기간 종일 이벤트 1개 + 설명에 일자별 전체 일정
function buildGoogleCalendarUrl(itinerary: Itinerary): string {
  const start = dayToDate(itinerary.startDate, 1);
  const lastDay = itinerary.days.length
    ? Math.max(...itinerary.days.map((d) => d.day))
    : 1;
  // 종일 이벤트 종료일 = 마지막 날 다음날 (구글 규격 = end exclusive)
  const endExclusive = dayToDate(itinerary.startDate, lastDay + 1);

  const detailLines: string[] = [];
  for (const dayPlan of itinerary.days) {
    const d = dayToDate(itinerary.startDate, dayPlan.day);
    detailLines.push(`Day ${dayPlan.day} (${d.getMonth() + 1}/${d.getDate()})`);
    for (const place of dayPlan.places) {
      detailLines.push(`${place.startTime} ${place.name}`);
    }
    detailLines.push("");
  }
  let details = detailLines.join("\n").trim();
  // URL 길이 안전 한도(브라우저·구글 처리 한계 대비) — 초과분만 말줄임
  if (details.length > 1800) details = details.slice(0, 1800) + "…";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: itinerary.title || itinerary.destination || "Trip",
    dates: `${toYYYYMMDD(start)}/${toYYYYMMDD(endExclusive)}`,
    details,
  });
  if (itinerary.destination) params.set("location", itinerary.destination);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// 캘린더 열기 — iOS만 서버 .ics URL 필수(icsUrl), Android·웹은 구글 링크(icsUrl 불필요 = null)
export async function openCalendar(
  itinerary: Itinerary,
  icsUrl: string | null,
): Promise<void> {
  if (Platform.OS === "ios") {
    // iOS 인데 icsUrl 없음 = 호출부 버그 = 조용한 폴백 대신 명시 실패(§0 폴백 분기 금지) → 훅 try/catch가 로그.
    if (!icsUrl) throw new Error("iOS 캘린더 = 서버 .ics URL 필수");
    await Linking.openURL(icsUrl);
    return;
  }
  const url = buildGoogleCalendarUrl(itinerary);
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    return;
  }
  await Linking.openURL(url);
}
