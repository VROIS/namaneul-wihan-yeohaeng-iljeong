// ⚠️ 수정금지(승인필요) — 여정 캘린더 저장(.ics) 신규 컴포넌트 (2026-07-21 사장님 승인 = 명세 docs/2026-07-21 여정공유·캘린더저장 명세.md)
// 기능: 여정(Itinerary)을 iCalendar(RFC 5545) 표준 .ics 문자열로 변환 + 플랫폼별 전달(웹=다운로드, 네이티브=공유시트→캘린더 앱 등록)
// 신규 네이티브 패키지 추가 없음 = expo-file-system(^19.0.21 신 File API)·expo-sharing(^14.0.8) 기설치분만 사용 (iOS Expo Go OTA 안전)
import { Platform } from "react-native";
import type { Itinerary } from "@/types/trip";

// iCalendar 텍스트 필드 이스케이프 (RFC 5545 §3.3.11) — 순서 중요: 백슬래시 먼저
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// 75옥텟 초과 줄 폴딩 (RFC 5545 §3.1) — UTF-8 옥텟(바이트) 기준 폴딩
// ⚠️ 수정금지(승인필요) — 문자 수(line.length) 기준이던 옛 구현은 한글(3바이트)·이모지(서로게이트) 줄에서
// 75옥텟 요건 미달 + 서로게이트 페어 분할 손상 위험이 있어 코드포인트 단위 누적으로 교체 (2026-07-21)
function foldICSLine(line: string): string {
  const enc = new TextEncoder();
  let out = "";
  let cur = "";
  let curOct = 0;
  let limit = 75;
  for (const ch of line) {
    const o = enc.encode(ch).length;
    if (curOct + o > limit) {
      out += (out ? "\r\n " : "") + cur;
      cur = ch;
      curOct = o;
      limit = 74; // 이어붙는 줄은 선행 공백 1옥텟 포함해 74옥텟 한도
    } else {
      cur += ch;
      curOct += o;
    }
  }
  return out ? out + "\r\n " + cur : cur;
}

// startDate("YYYY-MM-DD") 기준 day번째(1-base) 날짜를 "YYYYMMDD"로 반환 (로컬 Date 연산)
function dayToYYYYMMDD(startDate: string, day: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  base.setDate(base.getDate() + (day - 1));
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

// "HH:MM" → "HHMM00" (floating 로컬시간 = 타임존 미부착, 여행지 현지시간 그대로 §0)
function timeToHHMMSS(time: string): string {
  const [hh, mm] = time.split(":");
  return `${(hh || "00").padStart(2, "0")}${(mm || "00").padStart(2, "0")}00`;
}

// 현재 UTC → "YYYYMMDDTHHMMSSZ" (DTSTAMP 용)
function nowUTCStamp(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

// 여정(Itinerary) → iCalendar(.ics) 문자열 생성 (RFC 5545, 장소 1개 = VEVENT 1개)
export function generateICS(itinerary: Itinerary): string {
  const dtstamp = nowUTCStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NUBI//Trip Itinerary//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const dayPlan of itinerary.days) {
    const dateStr = dayToYYYYMMDD(itinerary.startDate, dayPlan.day);
    for (const place of dayPlan.places) {
      const dtstart = `${dateStr}T${timeToHHMMSS(place.startTime)}`;
      const dtend = `${dateStr}T${timeToHHMMSS(place.endTime)}`;
      const uid = `${dayPlan.day}-${place.id}-${Date.now()}@my-guide`;

      const descriptionParts: string[] = [];
      if (place.editorialSummary) descriptionParts.push(place.editorialSummary);
      if (place.googleMapsUrl) descriptionParts.push(place.googleMapsUrl);
      // ⚠️ 수정금지(승인필요) — ICS DESCRIPTION 개행 = 실제 개행 문자 1개로 join. escapeICSText 가 \n → \\n 으로 1회만 이스케이프함(RFC 5545 표준). 리터럴 "\\n" 으로 join 하면 이중 이스케이프되어 캘린더에 "\n" 글자가 그대로 보임 = 2026-07-21 검수 수정.
      const description = descriptionParts.join("\n");

      lines.push("BEGIN:VEVENT");
      lines.push(foldICSLine(`UID:${uid}`));
      lines.push(foldICSLine(`DTSTAMP:${dtstamp}`));
      lines.push(foldICSLine(`DTSTART:${dtstart}`));
      lines.push(foldICSLine(`DTEND:${dtend}`));
      lines.push(foldICSLine(`SUMMARY:${escapeICSText(place.name)}`));
      if (description) {
        lines.push(foldICSLine(`DESCRIPTION:${escapeICSText(description)}`));
      }
      lines.push(foldICSLine(`GEO:${place.lat};${place.lng}`));
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// 여정을 .ics 파일로 전달 — 웹: Blob 다운로드 / 네이티브: 캐시 파일 생성 후 공유시트(캘린더 앱 등록)
export async function deliverICS(itinerary: Itinerary): Promise<void> {
  const ics = generateICS(itinerary);
  const filename = `trip-${itinerary.destination || "itinerary"}.ics`;

  if (Platform.OS === "web") {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // 네이티브(iOS/Android) = expo-file-system v19 신 File API + expo-sharing (기설치, 신규 패키지 0)
  const { File, Paths } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");

  const file = new File(Paths.cache, `trip-${Date.now()}.ics`);
  file.write(ics);

  await Sharing.shareAsync(file.uri, {
    mimeType: "text/calendar",
    UTI: "com.apple.ical.ics",
  });
}
