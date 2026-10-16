// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = AI 의견 캐싱용 여정 지문 = 이 함수 1벌(여정 저장·AI 의견이 같이 쓴다, 같은 SHA-1) (정본 9-27)
import { createHash } from "node:crypto";

type FpDay = { day?: unknown; places?: unknown };
type FpPlace = {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
  startTime?: unknown;
};

export function computeItineraryFingerprint(itinerary: {
  destination?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  days?: unknown;
}): string {
  const material = {
    destination: itinerary.destination,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate,
    days: ((itinerary.days || []) as FpDay[]).map((d) => ({
      day: d.day,
      places: ((d.places || []) as FpPlace[]).map((p) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        startTime: p.startTime,
      })),
    })),
  };
  return createHash("sha1").update(JSON.stringify(material)).digest("hex");
}
