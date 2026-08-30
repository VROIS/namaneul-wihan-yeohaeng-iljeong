// ⚠️ 수정금지(승인필요) 2026-08-09 = 여정을 DB 행으로 만드는 **변환기 1벌**(순수 이동, 로직 변경 0).
import { createHash } from "node:crypto";
import { matchCityIdByName } from "./city-match";

// ⚠️ 2026-07-03 사장님 SSOT = "AI 의견" 캐싱용 여정 지문. 도시+일자+장소명 순서만 반영(이미지 등 무관 필드 제외)
export function computeItineraryFingerprint(itinerary: any): string {
  const material = {
    destination: itinerary.destination,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate,
    days: (itinerary.days || []).map((d: any) => ({
      day: d.day,
      places: (d.places || []).map((p: any) => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        startTime: p.startTime,
      })),
    })),
  };
  return createHash("sha1").update(JSON.stringify(material)).digest("hex");
}

//   ⚠️ 수정금지(승인필요) 2026-06-24 = travel_style 컬럼도 persona_type enum(luxury/comfort/economic) 강제
export async function buildItineraryData(body: any) {
  const styleToPersonaType: Record<string, string> = {
    Luxury: "luxury",
    Premium: "comfort",
    Reasonable: "comfort",
    Economic: "comfort", // 🩹 [2026-01-26] DB Enum 불일치 방지 (economic -> comfort)
    luxury: "luxury",
    comfort: "comfort",
    reasonable: "comfort",
    economic: "comfort", // 🩹 [2026-01-26] DB Enum 불일치 방지
  };
  // 🧠 2026-07-04 사장님 SSOT = AI 의견 결과 박제(구글이미지 스토리지 박제와 동일 원리). FE가 rawData.verificationResult(본문+언어)를 실으면
  const { verificationResult: vr, ...rawData } = (body.rawData || {}) as any; // 🩹 [2026-01-26] raw_data 저장 (없으면 빈 객체)
  if (vr?.result) {
    const fp = `${computeItineraryFingerprint(rawData)}:${vr.language || "ko"}`;
    (rawData as any).verification = {
      fp,
      result: vr.result,
      generatedAt: new Date().toISOString(),
    };
  }
  // 🏙️ 2026-08-02 사장님 지시 = 도시 id 는 **서버가** 목적지 문자열로 매칭해 채운다(§16 city-match.ts 1벌).
  const { cityId: _fromClient, ...bodyRest } = body || {};
  const matchedCityId = await matchCityIdByName(rawData?.destination);
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **total_cost 칸 = 1인 유로(€).**
  //     라이브 DB 구조 변경(€1000 창고)을 이름 하나 때문에 하지 않는다(2026-08-09 사장님 확정).
  const perPersonEur = (rawData as any)?.totalCost?.perPersonEur;
  const totalCostEur =
    typeof perPersonEur === "number" && isFinite(perPersonEur)
      ? perPersonEur
      : undefined;
  // ⚠️ 2026-08-22 사장님 승인(A+B+C) = 인원·바이브·밀도·초점 컬럼 = body 직접값 ?? rawData(생성 산출물=진실).
  const truthCols = Object.fromEntries(
    [
      "companionType",
      "companionCount",
      "companionAges",
      "curationFocus",
      "vibes",
      "travelPace",
    ]
      .map((k) => [k, (body as any)[k] ?? (rawData as any)[k]])
      .filter(([, v]) => v != null),
  );
  return {
    ...bodyRest,
    ...truthCols,
    ...(matchedCityId != null ? { cityId: matchedCityId } : {}),
    ...(totalCostEur != null ? { totalCost: totalCostEur } : {}),
    // ⚠️ 사장님 SSOT 2026-07-14 = 여정은 로그인 본인 ID(users.id)로 저장 = 전문가가 연락할 상대·푸시 대상 특정. 옛 'admin' 강제 폐기 §19(§9 로그인제거 잔재).
    userId: body.userId || "admin",
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    endDate: body.endDate ? new Date(body.endDate) : new Date(),
    personaType: styleToPersonaType[body.travelStyle] || "comfort",
    travelStyle: styleToPersonaType[body.travelStyle] || "comfort",
    rawData,
  };
}
