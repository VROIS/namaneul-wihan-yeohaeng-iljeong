// ⚠️ 수정금지(승인필요) 2026-08-09 = 여정을 DB 행으로 만드는 **변환기 1벌**(순수 이동, 로직 변경 0).
//   왜 옮겼나 = 저장(POST)·재저장(PUT) 두 곳만 쓰던 것을 **생성 라우트도** 쓰게 됐다(생성 즉시 DB 저장).
//   itinerary-routes.ts 안에 갇혀 있으면 생성 쪽이 같은 변환을 새로 짜게 되고 그 순간 두 벌이 된다(§16).
import { createHash } from "node:crypto";
// 🏙️ 목적지 문자열 → 도시 id 단일 관문(2026-08-02 §16) = 저장·재저장·생성이 같은 1벌을 쓴다.
import { matchCityIdByName } from "./city-match";

// ⚠️ 2026-07-03 사장님 SSOT = "AI 의견" 캐싱용 여정 지문. 도시+일자+장소명 순서만 반영(이미지 등 무관 필드 제외)
//   = 숙소변경→동선변경 시에만 달라져 재호출.
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

// ⚠️ 2026-07-03 = 여정 저장(POST)·재저장(PUT)·생성 공통 데이터 변환 = 재발명 금지(§16).
//   userId + 날짜변환 + travelStyle→persona_type enum + rawData + 도시 매칭.
//   ⚠️ 수정금지(승인필요) 2026-06-24 = travel_style 컬럼도 persona_type enum(luxury/comfort/economic) 강제
//     = FE "reasonable" 전송 시 enum 위반 500 방지.
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
  //   여기서 fp를 서버 단일 SSOT로 계산해 rawData.verification으로 봉인. POST·PUT 공통 1벌(§16 재발명금지·§20 통일).
  //   → 저장 후 복원 → 첫 AI 의견 클릭도 fp 일치 = Gemini 재호출 $0(cached:true). fp는 저장될 rawData 그대로 계산 = 복원 시 fp와 정의상 동일.
  //   verificationResult(임시 전달키)는 구조분해로 애초에 rawData에서 분리 = DB에 절대 안 새어나감(delete 방어 불필요 = §0 가벼움).
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
  //   화면이 보내오던 도시 id 는 완전삭제(§19) = 화면은 도시 번호를 모르고, 서버가 유일한 근거다.
  //   → 옛 화면 번들이 아직 보내오더라도 여기서 떼어내(bodyRest) 무시한다.
  //   매칭 실패하면 키 자체를 안 넣는다 = 새 여정은 비워두고(모르면 비움), 재저장은 이미 맞게 들어간 값을 지우지 않음.
  const { cityId: _fromClient, ...bodyRest } = body || {};
  const matchedCityId = await matchCityIdByName(rawData?.destination);
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **total_cost 칸 = 1인 유로(€).**
  //   화면의 "1인 €232" 와 **같은 값**이다. 단체 총액·원화·환율은 raw_data.totalCost 에 그대로 있다
  //   (groupEur / perPersonKrw / groupKrw / eurToKrwRate) = 여기 칸은 **찾기 위한 대표 숫자 1개**다.
  //   ⚠️ 칸 이름이 total_cost 라 "전체 비용"으로 읽기 쉽다 = **1인 값이다.** 이름을 바꾸지 않은 이유 =
  //     라이브 DB 구조 변경(€1000 창고)을 이름 하나 때문에 하지 않는다(2026-08-09 사장님 확정).
  //   왜 채우는가 = 값은 이미 raw_data 안에 있는데 칸이 비어 있어, 여정이 수만 건이 되면
  //     "€500 넘는 여정"·"이번 달 평균 얼마" 같은 것을 **JSON 을 전부 열어보지 않고는** 알 수 없다.
  //   값이 없으면(옛 여정·계산 실패) 키를 넣지 않는다 = 이미 들어간 값을 null 로 지우지 않는다(도시 id 와 같은 규칙).
  const perPersonEur = (rawData as any)?.totalCost?.perPersonEur;
  const totalCostEur =
    typeof perPersonEur === "number" && isFinite(perPersonEur)
      ? perPersonEur
      : undefined;
  // ⚠️ 2026-08-22 사장님 승인(A+B+C) = 인원·바이브·밀도·초점 컬럼 = body 직접값 ?? rawData(생성 산출물=진실).
  //   8/9 '만드는 중 행' 개편 이후 이 필드들이 조립에서 빠져 컬럼이 DB 디폴트(Couple/2)로 굳던 근본 원인.
  //   값 없으면 키를 넣지 않는다(도시 id 와 같은 규칙 = 이미 든 값을 지우지 않음).
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
    //   FE(handleSaveItinerary)가 userData.id 를 실어 보냄. 없으면(비로그인 경로) 'admin' 폴백 = 둘러보기 안전. 다른 컬럼 = body 그대로.
    userId: body.userId || "admin",
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    endDate: body.endDate ? new Date(body.endDate) : new Date(),
    personaType: styleToPersonaType[body.travelStyle] || "comfort",
    travelStyle: styleToPersonaType[body.travelStyle] || "comfort",
    rawData,
  };
}
