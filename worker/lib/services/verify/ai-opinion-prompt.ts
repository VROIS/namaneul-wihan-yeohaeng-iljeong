// ⚠️ 2026-07-03 사장님 SSOT = "AI 의견" 기능 프롬프트 조립.
// = route-prompt.ts(#03 동선 최적화, 수정금지 원본)의 buildRouteInputJson() 패턴을 그대로 재현(원본 미수정).

import { getLanguageInstruction } from "../shared/language-instruction";

export interface AiOpinionPlace {
  name: string;
  startTime?: string;
  endTime?: string;
  priceEur?: number;
}

export interface AiOpinionDay {
  day: number;
  places: AiOpinionPlace[];
}

export interface AiOpinionVibeWeight {
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
  curationFocus?: string;
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
      focus: input.curationFocus,
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

export function generateAiOpinionPrompt(input: AiOpinionInput): string {
  const inputJson = buildAiOpinionInputJson(input);
  const langInstruction = getLanguageInstruction(input.language);

  return `# 역할
당신은 여행 전문가이자 냉정한 비평가입니다.

# 언어
${langInstruction}

# 목표
아래 확정된 여행 일정을 검토하고, 가장 비평적·적대적인 관점으로 평가하세요.
실현 불가능한 부분, 비효율적인 동선, 과잉 일정, 놓친 위험 요소를 냉정하게 지적하세요.
사용자가 실제로 갔을 때 실패할 지점을 앞서 경고해야 합니다.

# 검증 원칙
- 모든 사실(가격·영업시간·거리)은 반드시 구글 검색(Google Search grounding)으로 검증하세요.
- 확인 안 된 추측은 금지합니다.
- protagonist.vibes = 사용자가 선택한 여행 취향(vibe id + 가중치 + 우선순위). 이 취향에 실제로 맞는 일정인지도 평가하세요.
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

# 입력
${JSON.stringify(inputJson, null, 2)}

# 출력 형식 (반드시 이 JSON 구조만 반환, 마크다운/설명 텍스트 금지)
# ⚠️ verdict 값("ok"|"caution"|"risky")과 필드명은 그대로 영문 유지. 값 안의 문장/텍스트만 지정된 언어로 작성.
{
  "feasibility": { "verdict": "ok" | "caution" | "risky", "reason": "이유 설명 문장" },
  "route_review": { "issues": ["동선/일정 문제점 목록"], "optimization": ["최적화 제안 목록"] },
  "price_check": {
    "daily": [{ "day": 숫자, "transport_eur": 숫자, "meals_eur": 숫자, "entrance_eur": 숫자, "total_eur": 숫자 }],
    "total_est_eur": 숫자
  },
  "cautions": ["주의사항 목록"]
}`;
}
