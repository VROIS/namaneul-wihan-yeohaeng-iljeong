// ⚠️ 수정금지(승인필요) — 여정 캘린더 저장 = OS 분기 (2026-07-22 사장님 확정 = 딥리서치 후 expo-calendar 도입)
//   Android(삼성 포함) = expo-calendar 직접삽입 = 권한 1회 후 여정 슬롯 전부를 모달 없이 조용히 삽입(시간대별 정확). 옛 .ics 파일 다운로드(삼성폰 파일 의심·종일뭉침) 폐기 §19.
//   iOS = 기존 서버 .ics(Safari 네이티브 "일정 추가", 실기기 정상 확인됨) 유지. expo-calendar = Expo SDK 내장 = iOS Expo Go 안 깨짐(딥리서치 확정 = OS 분기 성립).
//   웹 = 새 탭으로 .ics.
//   iOS 네이티브 캘린더도 expo-calendar 통일 = 통합계획 4단계 EAS 전환 때(iOS Expo Go 벗어난 뒤).
import { Linking, Platform } from "react-native";
import type { Itinerary } from "@/types/trip";

// startDate("YYYY-MM-DD") 기준 day번째(1-base) 날짜에 "HH:MM" 시각을 붙인 Date (로컬 시간 = 여행지 현지시간 §0)
function slotDate(startDate: string, day: number, time: string): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  const [hh, mm] = (time || "09:00").split(":").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  base.setDate(base.getDate() + (day - 1));
  return base;
}

// 🤖 안드로이드 = expo-calendar 직접삽입. 쓰기 가능한 기본 캘린더에 여정 슬롯(장소)마다 이벤트 1개를 시간대별로 삽입.
//   권한 1회 → for 루프로 조용히 전부(모달 없음) = 사용자 클릭1+권한1로 완료. 삼성/구글 캘린더 자동 반영.
async function saveToAndroidCalendar(itinerary: Itinerary): Promise<void> {
  const Calendar = await import("expo-calendar");
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (perm.status !== "granted") {
    throw new Error("캘린더 쓰기 권한 거부");
  }
  // 쓰기 가능한 기본 캘린더 = getDefaultCalendarAsync 우선, 실패 시 allowsModifications 첫 캘린더.
  let calendarId: string | null = null;
  try {
    const def = await Calendar.getDefaultCalendarAsync();
    if (def?.allowsModifications) calendarId = def.id;
  } catch {
    // getDefaultCalendarAsync 미지원 기기 = 아래 폴백.
  }
  if (!calendarId) {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = cals.find((c) => c.allowsModifications);
    if (!writable) throw new Error("쓰기 가능한 캘린더 없음");
    calendarId = writable.id;
  }

  for (const dayPlan of itinerary.days) {
    for (const place of dayPlan.places) {
      const start = slotDate(itinerary.startDate, dayPlan.day, place.startTime);
      const end = slotDate(itinerary.startDate, dayPlan.day, place.endTime);
      const notes = [place.editorialSummary, place.googleMapsUrl]
        .filter(Boolean)
        .join("\n");
      await Calendar.createEventAsync(calendarId, {
        title: place.name,
        startDate: start,
        endDate: end.getTime() > start.getTime() ? end : start,
        notes: notes || undefined,
        location: itinerary.destination || undefined,
      });
    }
  }
}

// 캘린더 저장 — Android = expo-calendar 직접삽입 / iOS·웹 = 서버 .ics.
//   icsUrl = iOS·웹에서만 필수(저장된 여정 id 로 구성). Android 는 itinerary 로 직접 삽입(icsUrl 불필요).
export async function openCalendar(
  itinerary: Itinerary,
  icsUrl: string | null,
): Promise<void> {
  if (Platform.OS === "android") {
    await saveToAndroidCalendar(itinerary);
    return;
  }
  // iOS·웹 = 서버 .ics URL 필수.
  if (!icsUrl) throw new Error("캘린더 = 서버 .ics URL 필수");
  if (Platform.OS === "web") {
    if (typeof window !== "undefined")
      window.open(icsUrl, "_blank", "noopener");
    return;
  }
  await Linking.openURL(icsUrl); // iOS = Safari 네이티브 "일정 추가"
}
