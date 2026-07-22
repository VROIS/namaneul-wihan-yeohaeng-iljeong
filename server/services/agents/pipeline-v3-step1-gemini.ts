// Step1 Gemini 완전 일정 생성 + JSON 잘림 복구 헬퍼 = pipeline-v3 분리(2026-07-15 §0 슬림화, 순수 이동)
import type { TripFormData, DaySlotConfig, VibeWeight } from "./types";
import { MEAL_BUDGET } from "./types"; // SEED_CATEGORIES 삭제 §19 = 미사용(호출 0)
import { computeCatSlots } from "./ag2-gemini-recommender";
import {
  getAI,
  normalizeTravelStyle,
  type GeminiPlace,
  type GeminiDay,
} from "./pipeline-v3-types";

// ⚠️ 수정금지(승인필요) 2026-07-18 사장님 확정 = 메인앱 여정 Step1 모델 = gemini-3-flash-preview 로 복귀.
//   = 옛 gemini-3.5-flash 폐기 §19 = 3.5 는 thinking 기반 추론모델이라 thinkingBudget:0 에서 긴 JSON(24곳) 생성이 불안정 = finishReason STOP 인데 응답 중간 잘림(실증: 9,686자↔5,554자 변동 = 3일↔2일).
//     리서치 확정(ai.google.dev/gemini-3.5 + 개발자포럼): 3.5 는 thinking 켜야 긴 구조화 출력 안정 = thinking 켜면 비싼 모델 쓸 이유 없음(사장님). preview 는 thinking 0 에서도 안정적 3일 완결(예전 실증).
//   = 로그·호출 2곳 단일 지점(다른 파일 MODEL_ID 로컬 상수 컨벤션 동일) = 향후 교체 1곳.
const STEP1_MODEL = "gemini-3-flash-preview";

// =====================================================
// Step 1: Gemini 완전 일정 생성
// =====================================================

export async function step1_geminiItinerary(
  formData: TripFormData,
  dayCount: number,
  daySlotsConfig: DaySlotConfig[],
  vibeWeights: VibeWeight[],
): Promise<GeminiDay[]> {
  const _t0 = Date.now();
  const mealBudget = MEAL_BUDGET[normalizeTravelStyle(formData.travelStyle)];

  // ===== 사용자 입력 9가지를 자연어로 상세 평문화 =====

  // ① 생년월일 → 나이 계산
  let ageDesc = "";
  if (formData.birthDate) {
    const birth = new Date(formData.birthDate);
    const age = new Date().getFullYear() - birth.getFullYear();
    ageDesc = `${age}세`;
  }

  // 🗑️ 2026-07-09 사장님 SSOT = companionTypeKo·focusKo 하드코딩 번역맵 삭제 §19 = 옛 AI 과설계(Gemini 응답요소에 없는 설명글).
  //   = 동행유형·큐레이션초점도 원본값(companionType·curationFocus) 그대로 Gemini 전달 = 자유해석([[feedback_dynamic_function_not_hardcoded_map]]). agesDesc(죽은코드) 삭제.
  const companionDesc = formData.companionType || "Couple"; // 원본값(Solo/Couple/Family/Group...) 그대로
  const headcount = formData.companionCount || 2;
  const focusDesc = formData.curationFocus || "Everyone"; // 원본값(Kids/Parents/Everyone/Self) 그대로

  // 🗑️ 2026-07-21 = startDate·endDate 삭제 §19 = dateRangeText(삭제됨)에서만 쓰이던 죽은 변수.
  // 🗑️ 2026-07-09 사장님 SSOT = vibeKo·styleKo·mobilityKo·paceKo 하드코딩 번역맵 4개 완전삭제 §19 = 옛 AI 과설계.
  //   = Gemini 응답요소에 없는 것(사람 읽는 설명글) = 삭제. 원본값(vibes·travelStyle·travelPace)을 그대로 프롬프트에 실어 Gemini 해석([[feedback_dynamic_function_not_hardcoded_map]]).
  //   = 실제 로직(카테고리 배분 catSlots·페이스 90/120/150분·예산)은 이미 다른 곳서 동적 처리 = 이 설명맵은 장식(죽은코드·도달불가폴백)이었음.

  // 🧠 2026-07-05 사장님 SSOT = vibe → 6카테고리 슬롯 배분을 프롬프트에 전달(§20 = catSlots 단일 SSOT ag2 재사용).
  //   = 옛날엔 "관광 X + 식사 Y" 2종으로만 전달 → Gemini 가 카테고리 모름 → attraction/restaurant 로 뭉개짐(리모주 사고).
  //   = 이제 "heritage 2곳·shopping 1곳·healing 1곳..." 명시 → 각 place 가 seed_category(6종) 답함 → DB 저장 시 카테고리 보존.
  const totalSlots = daySlotsConfig.reduce((s, d) => s + d.slots, 0);
  const catSlots = computeCatSlots(vibeWeights, totalSlots, dayCount);
  const nonRestCats = Object.entries(catSlots).filter(
    ([k]) => k !== "restaurant",
  );
  const categoryMatrix =
    nonRestCats.map(([cat, n]) => `${cat} ${n}곳`).join(", ") +
    (catSlots.restaurant ? ` / 식당(restaurant) ${catSlots.restaurant}곳` : "");

  // 일별 요구사항 (2026-07-21 사장님 SSOT = DB-only와 동일 규칙 = 식사 항상 2(점심 중간+저녁 마지막), 활동 = slots-2 우선).
  //   활동을 우선 최대한 채우고(AG1 슬롯수 = 활동 최대), 점심은 12~14시 중간, 저녁은 마지막 활동 직후(종료 미지정 = 유동).
  //   옛 저녁 18:30~20:00 윈도우 고정·윈도우 밖이면 식사 제외 폐기 §19 = DB-only(slots-2)와 불일치·저녁 누락 원인.
  const dayRequirements = daySlotsConfig
    .map((d) => {
      const activityCount = Math.max(0, d.slots - 2); // 식사2(점심·저녁) 제외 = 활동
      return `Day ${d.day}: ${d.startTime} 출발 ~ ${d.endTime} 마무리, 총 ${d.slots}곳 (관광 ${activityCount} + 식사 2) → 점심 t="lunch" 12:00~14:00 중간 배치, 저녁 t="dinner" 마지막 슬롯(마지막 관광 직후, 시각 유동 = 종료시간 무관)`;
    })
    .join("\n");

  // ⚠️ 2026-07-21 사장님 SSOT = 다국어 출력은 여기(Gemini k/r/s)서 안 함 = PSR 공유컬럼(name_ko·summary_ko·editorial_summary)은 한국어 고정(오염 방지).
  //   표시 다국어(사용자 프로필 언어설정 연동)는 별도 = FE/BE 가 name_en·name_local 중 선택하거나 표시전용 번역 = 별도 설계(PSR 저장과 분리). 옛 langMap(프롬프트 미삽입 죽은코드) 폐기 §19.

  // 현재 연도/월 (2026 최신 정보 반영 지시용)
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const seasonNote =
    nowMonth >= 3 && nowMonth <= 5
      ? "봄 시즌"
      : nowMonth >= 6 && nowMonth <= 8
        ? "여름 시즌 (성수기, 인파 많음)"
        : nowMonth >= 9 && nowMonth <= 11
          ? "가을 시즌"
          : "겨울 시즌 (비수기, 일부 시설 단축운영)";

  // ⚠️ 수정금지(승인필요) 2026-07-11 = 메인앱 표준 prompt 사장님 SSOT = 슬림본(축약키 12필드 + 꾸밈글 18자 상한, A/B 실호출 실증 = 26% 단축·결손 0)
  // = SSOT 원본 = .claude/skills/raw-db-verify-and-complete/prompts/09-main-app-itinerary/STANDARD_PROMPT_2026-05-24.md + 카탈로그 docs/20260607PROMPTS_TOTAL_SSOT.md #02
  // = 1 글자 변경 = Gemini 응답 변경 = 세 파일 동기 강제. 축약키 = 아래 수신부 SLIM_KEYS 가 원명 복원(하류·DB 컬럼 불변)
  // 🗑️ 2026-07-09 사장님 SSOT = vibe/페이스/스타일 = 하드코딩 번역맵 폐기 §19 → 원본값 그대로(Gemini 해석). vibes·travelPace·travelStyle 원본 = route-prompt 동적 패턴.
  const koreanTravelerStyle = `${companionDesc} ${headcount}명 / vibe=${(formData.vibes || []).join("+")} / 페이스=${formData.travelPace || "Normal"} / 스타일=${formData.travelStyle || "Reasonable"}${ageDesc ? ` / 나이=${ageDesc}` : ""}`;
  // ⚠️ 2026-07-17 사장님 SSOT = 출발점 = 동적(숙소 입력 시 그 좌표, 미입력 시 도시 중심부). 도심 고정 폐기 §19.
  //   = 좌표가 정본(BE 가 구글위젯 해석값을 이미 보유) = Gemini 재지오코딩 오차 0 + d(haversine)·y/x 좌표기계와 동종. 이름은 사람용 라벨만(거리계산 X).
  //   = pool-radius 동적 출발점(accommodationCoords)과 동일 원칙 = 여정 동선·외곽거리 기준을 숙소로 통일.
  const startPoint =
    formData.accommodationCoords?.lat && formData.accommodationCoords?.lng
      ? `출발점 좌표 (${formData.accommodationCoords.lat.toFixed(6)}, ${formData.accommodationCoords.lng.toFixed(6)})${formData.accommodationName ? ` = 숙소 "${formData.accommodationName}"` : ""}`
      : `${formData.destination} 도시 중심부`;
  const prompt = `You are a travel data assistant for KOREAN TRAVELERS (${nowYear}년 기준 최신 정보).
Return STRICT machine-parseable JSON only (no prose, no markdown wrappers).

⚠️ GROUNDING REQUIREMENT (= Gemini 3 + Google Search 강제):
- All facts (place names, addresses, coordinates, prices, opening hours) MUST be verified via Google Search grounding.
- No hallucinations. No made-up coordinates. No fabricated addresses.
- If you cannot verify a fact via Google Search, SKIP that place — do NOT guess.

TASK: Fill the provided slot matrix (categories + counts) and sort places within each day by minimum travel distance to generate the itinerary.

CITY: ${formData.destination}
RADIUS_KM: 100
TARGET_AUDIENCE: Korean travelers (= 한국 인스타/블로그/유튜브 트렌드 기준)

[USER CONTEXT — AG1 보강]
${koreanTravelerStyle}
계절: ${seasonNote} / 큐레이션: ${focusDesc}

[SLOT MATRIX — AG1 결정]
${dayRequirements}

[CATEGORY MATRIX — 전체 여정 카테고리별 곳수 (= 사용자 vibe 반영, 반드시 이 비율로 선정)]
${categoryMatrix}
- 각 place 의 c(카테고리)는 위 카테고리 중 하나로 정확히 지정 (heritage=문화/유산, healing=힐링/자연, hotspot=핫플, adventure=모험/액티비티, shopping=쇼핑, attraction=즐길거리/체험, restaurant=식당).
- 식사(lunch/dinner) = c="restaurant".

[동선 원칙]
- ⚠️ NO DUPLICATE PLACES: Each place must appear AT MOST ONCE across the ENTIRE itinerary (all days). 같은 장소(같은 건물·같은 구글맵 위치)를 여러 슬롯/여러 날에 중복 추천 금지 = 이름·주소를 다르게 써도 실제 같은 곳이면 한 번만. 슬롯이 남으면 다른 장소로 채운다.
- 매일 ${startPoint}에서 출발·귀환, 같은 날 = 같은 구역 묶기
- Array order within each day = visit order (= sorted by minimum travel distance from start)
- DAILY MEAL RULE (= AG1 has already assigned these slots — DO NOT modify count or position):
    * Each day MUST contain exactly 1 lunch (t="lunch") somewhere in the middle of the day.
    * The FINAL slot of each day MUST be dinner (t="dinner").
- 3 일+ 일정 시 = Day 2+ 한 날 = outskirt (= 출발점에서 10-100km 외곽) day-trip 1-2 곳 포함 가능 (= 한국 여행객이 자주 찾는 외곽 명소/아울렛)

[가격 원칙]
- p = ${nowYear}년 실제 입장료 (1인, EUR). 무료=0
- 점심 1인 ~€${mealBudget.lunch}, 저녁 1인 ~€${mealBudget.dinner}
- 활동(activity) = 1인 입장료 / 식당(lunch/dinner) = 1인당 평균. 확실하지 않으면 0

For each place include (= ALL fields verified via Google Search grounding, 키는 아래 축약형 그대로 사용):
- n (English official name on Google Maps)
- k (한국어 = 한국 여행자가 부르는 이름) [= PSR name_ko 공유컬럼 = 언어 고정(오염 방지). 표시 다국어는 별도 = FE가 name_en/local 선택]
- l (local language name = 예: 파리=Tour Eiffel) [= REQUIRED for ALL places INCLUDING restaurants (식당도 반드시). If the restaurant's official name is already in the local language (예: "Le Comptoir du Marché"), copy that same name into l — never leave l empty. = Text Search forwarding + matching key, final DB column]
- a (FULL street address with NUMBER + street + postal code + city) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search]
- t ("activity" | "lunch" | "dinner")
- c (= 위 CATEGORY MATRIX 중 하나 = heritage|healing|hotspot|adventure|shopping|attraction|restaurant. 식사=restaurant) [= final DB column, 카테고리 보존 필수]
- y (latitude = decimal 6 digits, e.g. 48.858370) [= REQUIRED for Text Search forwarding + matching key, final DB column — verify via Google Search, NO hallucination]
- x (longitude = decimal 6 digits, e.g. 2.294481) [= 위 y 와 동일 요건]
- p (1 인 EUR)
- d (= 출발점(위 동선 원칙 기준)으로부터 직선거리 km = haversine = 소수 1 자리 = 동선 최적화 기본 필수)
- r (한국어 한 줄 = 최대 18자 = 선정 이유 = 한국 여행객 트렌드 = 인스타 성지/한국 vlog 등 사회적 검증) [= PSR summary_ko 공유컬럼 = 언어 고정]
- s (한국어 한 줄 = 최대 18자 = 장소에 대한 코믹/위트 = Claude 톤. 단순 정보 X = "프사각", "본전 뽑음" 같은 한국 슬랭) [= PSR editorial_summary 공유컬럼 = 언어 고정]

OUTPUT (strict JSON, no markdown fences):
{"days":[{"day":1,"theme":"테마","places":[
  {"n":"Eiffel Tower","k":"에펠탑","l":"Tour Eiffel","a":"Champ de Mars, 5 Av. Anatole France, 75007 Paris","t":"activity","c":"attraction","y":48.858370,"x":2.294481,"p":29.4,"d":2.4,"r":"파리 인증샷 1순위 성지","s":"나 파리다 국룰"},
  {"n":"Le Comptoir du Marché","k":"르 콩투아 뒤 마르쉐","l":"Le Comptoir du Marché","a":"8 Rue de la Loge, 06300 Nice, France","t":"lunch","c":"restaurant","y":43.697415,"x":7.276451,"p":35,"d":0.8,"r":"시장 근처 가성비 미쉐린","s":"예약 없으면 자리 없음"}
]}]}`;

  try {
    // ⚠️ 수정금지(승인필요) 2026-07-18 사장님 확정 = 발굴(_call-config.md 검증표준)과 완전 통일 = googleSearch 그라운딩 실제 켬 + responseMimeType 제거.
    //   근본: preview 모델·temp0.2 로도 환각(렌 실증: 파리 식당을 렌에·거리이름 추천) 발생 = 원인은 모델 아니라 "그라운딩 미실행"(프롬프트엔 GROUNDING REQUIREMENT 글만, 실제 tools 없어 효력0).
    //   = 발굴은 tools googleSearch 로 실제 Google 검증 = 환각 억제. responseMimeType 은 grounding 과 배타(INVALID_ARGUMENT, 06-run.ts:92 정합) = 제거 → 프롬프트 STRICT JSON + repairTruncatedJSON 이 JSON 보장.
    // ⚠️ maxOutputTokens 50000(발굴 통일, 8192 폐기 §19) / temperature 0.2(발굴 통일, 0.3 폐기 §19) / 모델 preview(3.5 thinking0 잘림 §19).
    const step1Config: any = {
      temperature: 0.2,
      maxOutputTokens: 50000,
      thinkingConfig: { thinkingBudget: 0 },
      tools: [{ googleSearch: {} }],
    };
    console.log(`[V3-Step1] 🤖 ${STEP1_MODEL} + JSON (${prompt.length}자)...`);

    const response = await getAI().models.generateContent({
      model: STEP1_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: step1Config,
    });

    // gemini-2.5-flash: thinking 모드 시 응답이 parts 배열로 올 수 있음
    const candidate = (response as any).candidates?.[0];
    const parts = candidate?.content?.parts || [];
    // parts 중 text 타입만 추출 (thought 타입 제외)
    let text =
      parts
        .filter((p: any) => p.text && !p.thought)
        .map((p: any) => p.text)
        .join("") ||
      response.text ||
      "";
    const finishReason = candidate?.finishReason || "unknown";
    console.log(
      `[V3-Step1] 🤖 응답 수신 (${text.length}자, finish=${finishReason}, parts=${parts.length}, ${Date.now() - _t0}ms)`,
    );

    // 🗑️ 2026-07-06 삭제 = 여기 saveRaw(contextId:null=runtime·봉투형식) 폐기 = cityId 미확정 시점이라 runtime 개판저장 §19.
    //   = raw 저장은 호출부(runPipelineMix)에서 Promise.all 후 preloaded.cityId 확정 시점에 saveCollectedRaw 로(도시폴더+parsedPlaces). rawText 는 아래 days 에 부착해 전달.

    if (text.length < 100) {
      console.warn(`[V3-Step1] ⚠️ 짧은 응답: ${text}`);
    }

    // ── Markdown code fence 제거 ──
    // Gemini가 ```json ... ``` 으로 감싸서 응답하는 경우 처리
    text = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[V3-Step1] ❌ JSON 블록 없음");
      console.error("[V3-Step1] 원문 앞 200자:", text.substring(0, 200));
      return [];
    }

    let result: any;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      console.warn(
        `[V3-Step1] ⚠️ JSON 파싱 오류 (${parseErr.message}), 복구 시도...`,
      );
      // 디버그: 파싱 실패 위치 근처 출력
      const pos = parseInt(
        String(parseErr.message).match(/position (\d+)/)?.[1] || "0",
      );
      if (pos > 0) {
        console.warn(
          `[V3-Step1] 오류 위치 주변: ...${jsonMatch[0].substring(Math.max(0, pos - 50), pos + 50)}...`,
        );
      }
      result = repairTruncatedJSON(jsonMatch[0]);
      if (!result) {
        console.error("[V3-Step1] ❌ JSON 복구 실패");
        return [];
      }
      console.log(
        `[V3-Step1] ✅ JSON 복구 성공: ${result.days?.length || 0}일`,
      );
    }

    // ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 슬림 프롬프트 축약키 → 원명 복원 = 수신부 단일 지점(하류 GeminiPlace·DB 컬럼 불변).
    const SLIM_KEYS: Record<string, string> = {
      n: "name",
      k: "nameKo",
      l: "nameLocal",
      a: "address",
      t: "type",
      c: "seed_category",
      y: "latitude",
      x: "longitude",
      p: "price_eur",
      d: "distance_km_from_center",
      r: "selection_reason_ko",
      s: "shortform_ko",
    };
    for (const d of result.days || []) {
      d.places = (d.places || []).map((pl: any) => {
        const out: any = {};
        for (const [key, v] of Object.entries(pl))
          out[SLIM_KEYS[key] || key] = v;
        return out;
      });
    }

    const days: GeminiDay[] = result.days || [];

    if (days.length === 0) {
      console.warn("[V3-Step1] ⚠️ Gemini가 0일 반환");
      return [];
    }

    // 🗑️ 2026-07-05 삭제 = DEBUG_PIPELINE_SNAPSHOT 로컬 dump = saveRaw(§18) 이중저장 관문우회 §0/§19

    // 검증: 각 일의 장소 수/식사 체크
    for (const day of days) {
      const hasLunch = day.places?.some((p) => p.type === "lunch");
      const hasDinner = day.places?.some((p) => p.type === "dinner");
      const placeCount = day.places?.length || 0;
      if (!hasLunch) console.warn(`[V3-Step1] ⚠️ Day ${day.day} 점심 없음`);
      if (!hasDinner) console.warn(`[V3-Step1] ⚠️ Day ${day.day} 저녁 없음`);
      console.log(
        `[V3-Step1]   Day ${day.day} "${day.theme}": ${placeCount}곳 (🍽️${day.places?.filter((p) => p.type === "lunch" || p.type === "dinner").length || 0}식사)`,
      );
    }

    console.log(
      `[V3-Step1] ✅ Gemini ${days.length}일 완전 일정 생성 (${Date.now() - _t0}ms)`,
    );
    // 🧠 2026-07-06 사장님 SSOT = rawText/finishReason 를 days 에 비열거 속성 부착 = 반환타입(GeminiDay[]) 불변 + 호출부가 Promise.all 후 cityId 확정 시점에 raw 저장(도시폴더).
    Object.defineProperty(days, "__rawText", {
      value: text,
      enumerable: false,
    });
    Object.defineProperty(days, "__finishReason", {
      value: finishReason,
      enumerable: false,
    });
    return days;
  } catch (error: any) {
    if (error.message === "GEMINI_API_KEY_MISSING") throw error;
    console.error(`[V3-Step1] ❌ Gemini 실패: ${error?.message}`);
    return [];
  }
}

/** Gemini JSON 잘림 복구 = 발굴(01-run.ts parse) 방식 동일(§16 통일).
 *  = 뒤에서부터 성한 '}' 지점마다 접미사(]}}/]}/}) 붙여 파싱 시도 = 잘린 마지막 날의 완성 place 까지 살림.
 *  = 옛 "day 경계 통째 버림"(braceDepth) 폐기 2026-07-19 §19 = 3일 요청인데 Day3 통째 소실 근본(렌 2일 잘림). */
export function repairTruncatedJSON(
  broken: string,
): { days: GeminiDay[] } | null {
  const start = broken.indexOf("{");
  if (start < 0) return null;
  // 1차 = 통째 시도
  try {
    const p = JSON.parse(broken.slice(start, broken.lastIndexOf("}") + 1));
    if (p.days) return p;
  } catch {
    /* 잘림 = 아래 복구 */
  }
  // 2차 = 뒤에서부터 성한 '}' 마다 접미사 붙여 최대한 살림(발굴 parse 패턴)
  for (let endIdx = broken.length - 1; endIdx > start; endIdx--) {
    if (broken[endIdx] !== "}") continue;
    const trimmed = broken.slice(start, endIdx + 1);
    for (const suffix of ["]}]}", "]}}", "]}", "}", ""]) {
      try {
        const p = JSON.parse(trimmed + suffix);
        if (p.days) return p;
      } catch {
        /* 다음 접미사 */
      }
    }
  }
  return null;
}
