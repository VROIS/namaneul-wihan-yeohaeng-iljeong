// ⚠️ 수정금지(승인필요) — 여정 → iCalendar(.ics) 생성기 (RFC 5545) = 프로젝트 유일 1벌 (2026-07-21 §0)

export type ItineraryForICS = {
  title?: string;
  destination?: string;
  startDate: string;
  days: {
    day: number;
    places: {
      id?: string | number;
      name: string;
      startTime: string;
      endTime: string;
      lat?: number;
      lng?: number;
      editorialSummary?: string;
      googleMapsUrl?: string;
    }[];
  }[];
};

// iCalendar 텍스트 필드 이스케이프 (RFC 5545 §3.3.11) — 순서 중요: 백슬래시 먼저
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// 75옥텟 초과 줄 폴딩 (RFC 5545 §3.1) — UTF-8 옥텟 기준, 코드포인트 단위 누적(한글 3바이트·서로게이트 분할 손상 방지)
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

function dayToYYYYMMDD(startDate: string, day: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  base.setDate(base.getDate() + (day - 1));
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function timeToHHMMSS(time: string): string {
  const [hh, mm] = time.split(":");
  return `${(hh || "00").padStart(2, "0")}${(mm || "00").padStart(2, "0")}00`;
}

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

export function generateItineraryICS(itinerary: ItineraryForICS): string {
  const dtstamp = nowUTCStamp();
  const stamp = Date.now();
  let seq = 0; // UID 유일성 보장(place.id 결손·중복이어도 충돌 0)
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
      const uid = `${dayPlan.day}-${place.id ?? "p"}-${seq++}-${stamp}@my-guide`;

      const descriptionParts: string[] = [];
      if (place.editorialSummary) descriptionParts.push(place.editorialSummary);
      if (place.googleMapsUrl) descriptionParts.push(place.googleMapsUrl);
      // ⚠️ 수정금지(승인필요) — DESCRIPTION 개행 = 실제 개행 문자로 join. escapeICSText 가 \n → \\n 1회만 이스케이프(RFC 5545 표준). 리터럴 "\\n" join = 이중 이스케이프로 캘린더에 "\n" 글자 노출 = 금지.
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
      if (typeof place.lat === "number" && typeof place.lng === "number") {
        lines.push(foldICSLine(`GEO:${place.lat};${place.lng}`));
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
