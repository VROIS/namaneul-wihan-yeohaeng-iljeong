// = route-prompt.ts(#03 동선 최적화, 수정금지 원본)의 buildRouteInputJson() 패턴을 그대로 재현(원본 미수정).

import { getLanguageInstruction } from "../shared/language-instruction";

interface AiOpinionPlace {
  name: string;
  startTime?: string;
  endTime?: string;
  priceEur?: number;
}

interface AiOpinionDay {
  day: number;
  places: AiOpinionPlace[];
}

interface AiOpinionVibeWeight {
  vibe: string;
  weight: number;
  percentage?: number;
}

export interface AiOpinionInput {
  destination: string;
  startDate: string;
  endDate: string;
  companionType?: string;
  companionCount?: number;
  // 여정 metadata = curationFocus(누구 중심) · _sourceMode(들어온 길 = "best" 인기 명소 | 그 밖 내 취향)
  meta?: Record<string, unknown>;
  vibeWeights?: AiOpinionVibeWeight[];
  travelStyle?: string;
  mobilityStyle?: string;
  travelPace?: string;
  // ⚠️ 2026-07-09 사장님 SSOT = 교통 카테고리 = shouldApplyGuidePrice(mobility·travel) 매트릭스 매칭 결과 = 'guide'(드라이빙가이드 전용차) | 'transit'(대중교통).
  transportCategory?: "guide" | "transit";
  days: AiOpinionDay[];
  // ⚠️ 2026-07-03 사장님 SSOT = 동적 콘텐츠(AI 의견 본문) 다국어 대응. pipeline-v3.ts:382-392 langMap 패턴 재사용.
  language?: string;
}

function buildAiOpinionInputJson(input: AiOpinionInput) {
  return {
    trip: {
      destination: input.destination,
      start_date: input.startDate,
      end_date: input.endDate,
    },
    protagonist: {
      companion_type: input.companionType,
      headcount: input.companionCount,
      focus: input.meta?.curationFocus,
      vibes: (input.vibeWeights || []).map((v, i) => ({
        vibe: v.vibe,
        weight: v.weight,
        priority: i + 1,
      })),
      travel_style: input.travelStyle,
      mobility_style: input.mobilityStyle,
      travel_pace: input.travelPace,
      transport_category: input.transportCategory || "transit",
    },
    days: input.days.map((d) => ({
      day: d.day,
      places: d.places.map((p) => ({
        name: p.name,
        start_time: p.startTime,
        end_time: p.endTime,
        price_eur: p.priceEur,
      })),
    })),
  };
}

// ⚠️ 수정금지(승인필요) 2026-10-28 사장님 결정 = 말투 = 두 길 모두 일정을 해내도록 돕는 조언 · 사용자가 고른 장소·취향·시간 배분은 평가·지적하지 않음 · 머리 2벌(인기 명소 = 일행·취향·예산은 앱 기본값) · 예약 = 두 길 모두 bookings 칸(예약 필수·예약 권장·현장 예약 3값, 링크 없음, 다른 칸에 되풀이 금지) (정본 §2026-10-27)
const TONE = `# 말투
- 사용자가 고른 장소·취향(vibes)·시간 배분은 사용자의 선택입니다. 장소를 빼거나 다른 곳으로 바꾸라고 하지 말고, "짧다·많다·취향과 맞지 않는다"처럼 평가하지 마세요. 그 일정 그대로 다니는 방법만 쓰세요.
- 문제를 지적하는 데서 끝내지 말고, 그 일정을 해내는 방법으로 쓰세요. 예: "루브르 시간이 짧습니다"가 아니라 "루브르는 9시 입장으로 예매하고 대표작 위주로 보면 2시간 30분 안에 볼 수 있습니다".
- issues·optimization·cautions 의 모든 항목은 "~하세요 / ~하면 좋습니다" 같은 실행 방법으로 끝내세요.
- "불가능하다·비현실적이다·탁상공론·무리하다·실패한다·충돌한다·삭제하라" 같은 단정·비난하는 말은 쓰지 마세요.
- 휴관일·운영 시간이 일정과 실제로 겹칠 때만 알려 주고, 그때도 다른 날·다른 시각으로 옮기는 방법을 함께 쓰세요.`;
const HEAD_MINE = `# 역할
당신은 사용자가 이 일정을 그대로 즐겁게 다닐 수 있게 돕는 여행 전문가입니다.

# 목표
아래 확정된 여행 일정을 검토하고, 실제로 다닐 때 막힐 수 있는 지점(동선·시간·비용·운영 정보)을 미리 찾아 해결 방법과 함께 알려 주세요.`;
const HEAD_BEST = `# 역할
당신은 사용자가 이 일정을 그대로 즐겁게 다닐 수 있게 돕는 현지 여행 전문가입니다.

# 목표
아래 일정은 사용자가 이 도시의 인기 명소 목록에서 가고 싶은 곳을 직접 골라 만든 예상 일정입니다.
- 사용자는 이미 이곳들에 가기로 정했습니다. 그대로 다니려면 무엇을 알아야 하는지 알려 주세요.
- 일행 구성(companion)·취향(vibes)·예산 수준(travel_style)·이동 방식(mobility_style)은 사용자가 고른 것이 아니라 앱의 기본값입니다. 이 값을 근거로 평가하지 마세요.
- 짚을 것 = 실제 운영 정보(휴관일·운영 시간)와 이 일정 시각이 맞는지, 장소 사이 이동이 시간표에 들어가는지, 예약이 필요한 곳(아래 예약 항목).`;
const BOOKING_RULES = `# 예약 (일정의 각 날짜 기준)
- bookings = 이 일정에서 방문 날짜에 예약을 챙겨야 하는 장소만 담습니다. need = "required"(예약 필수 = 미리 예약하지 않으면 들어갈 수 없음) · "recommended"(예약 권장 = 미리 예약하지 않으면 오래 기다리거나 매진 위험) · "walk_in"(현장 예약 = 미리 예약은 안 되고 현장에서 번호표·대기 줄·현장 구매로만 받음). 이 세 값만 씁니다. 아무 준비 없이 바로 들어갈 수 있는 곳은 넣지 마세요.
- open_rule = 예매가 언제 열리는지(예: "방문 90일 전 오픈") · 휴관일 · 실명·신분증 같은 조건을 구글 검색으로 확인한 것만 짧게. 모르면 빈 문자열.
- 남은 표 수·예약 가능 시각은 실시간 정보라 알 수 없으니 절대 쓰지 마세요.
- 예약·예매 이야기는 bookings 에만 씁니다. feasibility·issues·optimization·cautions 어디에도 되풀이하지 마세요.`;

export function generateAiOpinionPrompt(input: AiOpinionInput): string {
  const inputJson = buildAiOpinionInputJson(input);
  const langInstruction = getLanguageInstruction(input.language);
  const best = input.meta?._sourceMode === "best";

  return `${best ? HEAD_BEST : HEAD_MINE}

${TONE}

# 언어
${langInstruction}

# 검증 원칙
- 모든 사실(가격·영업시간·거리)은 반드시 구글 검색(Google Search grounding)으로 검증하세요.
- 확인 안 된 추측은 금지합니다.
- ⚠️ 이동수단 = protagonist.transport_category 로 확정됨. 이 수단을 전제로만 동선·거리·비용을 평가하세요.
  - transport_category="guide" = 전용차 드라이빙 가이드(기사 동반 전용차량). 서로 먼 와이너리·근교도 차량으로 이동하므로 "대중교통으로 불가능"·"차량 없이 불가능" 같은 지적은 금지(이미 차량 있음). 대신 이동 시간·동선 효율만 지적.
  - transport_category="transit" = 대중교통(지하철/버스/도보). 이때만 대중교통 배차·소요시간·도보거리를 지적.

# 가격 검증 (가장 중요 = 사용자가 가장 민감하게 보는 항목)
일자(day)별로 "1인당 하루 총비용"을 계산하세요. 하루 총비용 = 교통비 + 식비 + 입장료 의 합산입니다.
- 교통비(transport_eur):
  - transport_category="guide" 면 = 전용차 드라이빙 가이드 요금(1인/일 기준). 대중교통 요금이 아님. 구글 검색으로 현지 전용차량/가이드 일일 시세를 확인해 1인분으로 반영하세요.
  - transport_category="transit" 면 = 그 날 장소 간 이동 횟수만큼 현지 대중교통(지하철/버스) 실제 요금을 구글 검색으로 확인해 합산하세요.
- 식비: 입력에 price_eur가 있는 장소(식당)는 그 값을 우선 쓰되, 실제 시세와 차이가 크면 구글 검색으로 보정하세요.
- 입장료: 입력에 price_eur가 없는 장소는 실제 입장료를 구글 검색으로 확인하세요(무료면 0).

${BOOKING_RULES}

# 입력
${JSON.stringify(inputJson, null, 2)}

# 출력 형식 (반드시 이 JSON 구조만 반환, 마크다운/설명 텍스트 금지 · 배열은 ] 로, 객체는 } 로 정확히 닫은 완전한 JSON)
# ⚠️ verdict 값("ok"|"caution"|"risky")과 필드명은 그대로 영문 유지. 값 안의 문장/텍스트만 지정된 언어로 작성.
{
  "feasibility": { "verdict": "ok" | "caution" | "risky", "reason": "이유 설명 문장" },
  "route_review": { "issues": ["이 일정 그대로 다니기 위해 확인할 점과 해결 방법을 한 문장으로(예약·예매 제외)"], "optimization": ["이 일정을 더 편하고 즐겁게 다니는 방법(예약·예매 제외)"] },
  "price_check": {
    "daily": [{ "day": 숫자, "transport_eur": 숫자, "meals_eur": 숫자, "entrance_eur": 숫자, "total_eur": 숫자 }],
    "total_est_eur": 숫자
  },
  "cautions": ["예약·예매를 뺀 주의사항(예약 내용은 bookings 에만)"],
  "bookings": [{ "day": 숫자, "place": "장소 이름(입력 그대로)", "need": "required" | "recommended" | "walk_in", "open_rule": "예매 오픈·조건 또는 빈 문자열" }]
}`;
}
