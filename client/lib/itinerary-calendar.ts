// ⚠️ 수정금지(승인필요) — 여정 캘린더 저장 = iOS·Android·웹 전부 서버 .ics 통일 (2026-07-21 사장님 확정 = docs/2026-07-21 여정공유·캘린더저장 명세.md)
//   서버 https .ics(text/calendar, 장소마다 VEVENT 1개 = 시간대별 개별 일정)를 Linking.openURL 로 엶.
//   iOS = Safari 네이티브 "일정 추가" → 애플캘린더에 시간대별 개별 일정(실기기 확인됨).
//   Android(삼성 포함) = 같은 .ics 열기 → 캘린더 앱(가져오기). 삼성폰 실기기에서 전체 VEVENT 반영 확인 필요(§21).
//   웹 = 새 탭으로 .ics 열기(브라우저 다운로드/캘린더 연결).
//   옛 구글 render 링크(buildGoogleCalendarUrl = 1링크=1이벤트 제한 → 전체가 종일이벤트 1개로 뭉침) 완전삭제 = 2026-07-21 §19.
//   신규 패키지 0 = Expo Go OTA 안전. ICS 생성 = 서버 1벌만(server/itinerary-ics.ts §0).
import { Linking, Platform } from "react-native";

// 캘린더 열기 — 전 플랫폼 공통: 서버 .ics URL(icsUrl) 을 엶. icsUrl 은 호출부(useShareCalendar)가 저장된 여정 id 로 구성.
export async function openCalendar(icsUrl: string | null): Promise<void> {
  // 서버 .ics URL 필수(저장된 여정 id 필요). 없음 = 호출부 버그 = 명시 실패(§0 폴백 분기 금지) → 훅 try/catch 가 로그.
  if (!icsUrl) throw new Error("캘린더 = 서버 .ics URL 필수");

  if (Platform.OS === "web") {
    if (typeof window !== "undefined")
      window.open(icsUrl, "_blank", "noopener");
    return;
  }
  await Linking.openURL(icsUrl);
}
