// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 지브리 스토리보드 = Gemini 1콜 ('AI의견' 패턴)
//   = 대사·서사 일관성 + 환각 차단(실데이터만 근거). 옛 코드 템플릿 조립 = 폐기 2026-07-22 사장님 지시.

import fs from "fs";
import path from "path";
import { geminiJson } from "./shared/geminiClient";
import { calculateAge } from "./protagonist-generator";
import { selectGhibliCast, type GhibliCast } from "./character-roster-ghibli";

export interface GhibliScene {
  sceneIndex: number;
  placeName: string;
  visualPrompt: string; // Omni 영상 프롬프트(영어, <IMAGE_REF_N> 태그 포함)
  narrationKo: string; // 나레이션 대사(6초 낭독 분량) — ko=한국어 / 비ko=사용자 언어(2026-08-22 사장님 승인, 필드명은 소비처 3곳 유지)
  cardSummary?: string; // 비ko 전용 = 장소카드 요약(사용자 언어, 같은 1콜 응답에서 옴 = 추가호출 0)
}

export interface GhibliStoryboard {
  title: string;
  source: "manual" | "gemini"; // 2026-08-22 판단3종 지적 = 캐시 지문 정책이 출처에 따라 달라야 함(제미니 = 매번 새 문장)
  cast: GhibliCast; // 일행 전원(누구랑 기반) + 가이드 + 차량 = 사장님 SSOT 2026-07-22
  referenceImagePaths: string[]; // [일행들..., 가이드, 차량] jpg 절대경로 = <IMAGE_REF_N> 순서와 1:1
  scenes: GhibliScene[];
}

export interface StoryboardParams {
  itinerary: Record<string, any>; // 여정 행 전체(메타·바이브·큐레이션 = 전부 다 줌)
  user?: Record<string, any> | null;
  day: number; // 1-base 일차
  slots: any[]; // rawData.days[day-1].places 통째(전요소)
  apiKey?: string; // issueApiKey 출입증(백그라운드) / 미전달 = env(메인앱)
  model?: string; // 2026-08-06 사장님 지시(모델 A/B 시뮬·전환용) = geminiJson 에 그대로 전달. 미지정 = 기존 기본 모델(동작 무변경)
  language?: string; // 2026-08-22 사장님 승인 = 사용자 언어(7종 두 글자). 미지정=ko(동작 무변경)
}

// 사장님 SSOT 2026-07-22 = 6초×최대 10씬 ≈ 60초. 씬 수·길이 상수 = 이 파일 1벌만(routes·stitcher 가 import = §0 드리프트 차단)
export const MAX_SCENES = 10;
export const SCENE_SECONDS = 6;

// ⚠️ 2026-08-22 사장님 승인 = 영상 다국어(동적함수) = 앱 7언어 두 글자 코드 → 프롬프트용 언어명 1벌.
const VIDEO_LANGS: Record<string, string> = {
  ko: "Korean",
  en: "English",
  fr: "French",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  de: "German",
};
export function videoLangName(code?: string | null): string {
  return VIDEO_LANGS[(code || "ko").slice(0, 2)] || "Korean";
}
export function normalizeVideoLang(code?: string | null): string {
  const c = (code || "ko").slice(0, 2);
  return VIDEO_LANGS[c] ? c : "ko";
}

function buildStoryboardPrompt(
  input: object,
  sceneCount: number,
  language = "ko",
): string {
  const isKo = language === "ko";
  const langName = videoLangName(language);
  // ko = 기존 문구 그대로(무변경) / 비ko = 같은 재료 근거로 사용자 언어 작성 + 씬별 cardSummary(2026-08-22 사장님 원본 승인)
  const rule3 = isKo
    ? `3. narrationKo = 해당 슬롯의 editorialSummary 문구를 **그대로** 사용(창작·수정 금지 = 우리 서비스 톤앤매너 유지). editorialSummary 가 없는 슬롯만 summaryKo 근거로 25자 내외 1문장 작성(데이터에 없는 사실 창작 금지).`
    : `3. narration = 해당 슬롯의 editorialSummary(없으면 summaryKo) 내용을 근거로 ${langName}로 6초 낭독 분량 1문장 작성. 데이터에 없는 사실 창작 금지, 원문의 유쾌한 톤 유지.
3-1. cardSummary = 각 씬 장소의 1문장 요약을 ${langName}로 작성(summaryKo 내용 근거, 창작 금지).`;
  const schema = isKo
    ? `{"title":"영상 제목(한국어, 유쾌하게)","scenes":[{"sceneIndex":1,"placeName":"슬롯 장소명","visualPrompt":"...","narrationKo":"..."}]}`
    : `{"title":"영상 제목(${langName}, 유쾌하게)","scenes":[{"sceneIndex":1,"placeName":"슬롯 장소명","visualPrompt":"...","narration":"...","cardSummary":"..."}]}`;
  return `당신은 스튜디오 지브리풍 여행 애니메이션 감독입니다.
아래 [여행 데이터]는 실제 사용자의 하루 여정입니다. 이것을 6초 씬 ${sceneCount}개로 구성된 세로(9:16) 숏폼 애니메이션 스토리보드로 만드세요.

연출 원칙:
1. 톤 = 최대한 코믹하고 유쾌하게. 과장된 표정, 슬랩스틱, 씬마다 웃음 포인트 1개 이상. 지브리 수채화 감성.
2. 등장인물 = **일행 전원 + 드라이빙 가이드 1명 = 반드시 (일행 수+1)명 구성**(일행 수 = cast.totalTravelerCount). [여행 데이터] cast.travelers 의 일행 전원(각자의 <IMAGE_REF_N> 태그·나이대·성별 그대로)과 파리 현지 거주 한국인 드라이빙 가이드는 **모든 씬 필수 등장**(가이드 생략 금지 = 이 영상의 목적). 가이드 차량도 동일 차량 유지. **특정 1명만 등장 금지**(일행 수가 이미지보다 많으면 totalTravelerCount 만큼 나머지도 배경에 함께). 장소 간 이동 장면은 차량 드라이빙의 편안함·즐거움을 매력적으로 강조.
${rule3}
4. 식사 슬롯(isMealSlot=true) = 음식 클로즈업 + 주인공 리액션 개그.
5. visualPrompt = 영어로 작성. 반드시 "Studio Ghibli hand-drawn watercolor anime style" 포함 + <IMAGE_REF_N> 태그로 인물·차량 지정 + 해당 장소의 시각 특징 + 코믹 액션 묘사 + "vertical 9:16 short-form".
6. 씬 순서 = 슬롯 시간 순서 그대로. 씬 수 = 정확히 ${sceneCount}개.
7. 전체 = 하나의 여행 브이로그 스토리(기승전결): 첫 씬 = 설레는 하루 시작 인사, 마지막 씬 = 하루를 마무리하는 소감 한마디, 씬 간 대사·감정이 앞 씬을 이어받아 자연스럽게 흐르도록(각 씬이 따로 놀지 않게).

출력 = JSON 만:
${schema}

[여행 데이터]
${JSON.stringify(input, null, 1)}`;
}

/** 나레이터 음색 = 출연진 매트릭스 연동(사장님 SSOT 2026-07-23 = 연령대·성별 목소리). 주인공(첫 캐릭터) 기준 */
export function narratorFromCast(cast: GhibliCast): string {
  const p = cast.travelers[0];
  const isMale = p?.gender === "male";
  const age = p?.ageGroup?.replace("s", "") || "30";
  return `a cheerful Korean ${isMale ? "man" : "woman"} in ${isMale ? "his" : "her"} ${age}s`;
}

export function sceneClipPrompt(
  scene: GhibliScene,
  narrator?: string,
  language = "ko", // 2026-08-22 사장님 승인 = 발화 언어 동적(캐릭터 정체성은 한국인 유지)
): string {
  return `${scene.visualPrompt}
${SCENE_SECONDS}-second clip. Audio: ${narrator || "a warm, cheerful Korean narrator"} says in ${videoLangName(language)}: "${scene.narrationKo}" — plus light Ghibli-style piano background music.`;
}

export function sceneStillPrompt(
  scene: GhibliScene,
  totalTravelerCount: number,
  hasPlacePhoto: boolean,
): string {
  const background = hasPlacePhoto
    ? `The FIRST attached image is a real photograph of "${scene.placeName}" — use it as the background and keep it a photorealistic photograph (do not repaint, stylize or illustrate the background).`
    : `No place photo is attached — create a photorealistic background that faithfully depicts the real place "${scene.placeName}".`;
  return `Photo compositing task. ${background}
Insert the illustrated Korean travel characters from the attached character images into this real scene: exactly ${totalTravelerCount} traveler(s) AND 1 driving guide = ${totalTravelerCount + 1} people total, every one of them visible, with correct scale, perspective, lighting and soft shadows.
Characters' poses, actions and mood must follow this scene direction — apply it to the CHARACTERS ONLY, never to the background: "${scene.visualPrompt}"
Use the character reference images ONLY for each person's face, hairstyle and outfit. IGNORE everything else in those reference images — their backgrounds, scenery, landmarks, vehicle interiors and hand-held props (phones etc.) must NOT appear unless the scene direction explicitly asks for them.
The background must remain the real place "${scene.placeName}" — never replace it with any other city or landmark.
Do NOT render any text, captions, subtitles, letters, numbers, ratios, watermarks or logos in the image (existing real signage in the photo is fine).
Tall vertical portrait composition, high detail.`;
}

export function scenePhotoMotionPrompt(
  scene: GhibliScene,
  narrator?: string,
  language = "ko", // 2026-08-22 사장님 승인 = 발화 언어 동적
): string {
  return `Animate this image into a lively ${SCENE_SECONDS}-second clip. Keep the photographic background of "${scene.placeName}" as-is (no style change). The characters move following this scene direction (actions and mood, characters only): "${scene.visualPrompt}". Subtle cinematic camera motion. Do NOT add any text, captions or numbers.
Audio: ${narrator || "a warm, cheerful Korean narrator"} says in ${videoLangName(language)}: "${scene.narrationKo}" — plus light piano background music.`;
}

function parseFirstJsonObject<T>(raw: string): T | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      if (inStr) esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function buildGhibliStoryboard(
  params: StoryboardParams,
): Promise<GhibliStoryboard> {
  const { itinerary, user, day } = params;
  const slots = (params.slots || []).slice(0, MAX_SCENES);
  if (!slots.length) throw new Error(`[storyboard] day ${day} 슬롯 없음`);

  // 출연진 = '누구랑'(companionType·companionCount) + users.birth_date 실계산 = 사장님 SSOT 2026-07-22
  const userAge = calculateAge(user?.birthDate || itinerary.userBirthDate);
  const cast = selectGhibliCast({
    companionType: itinerary.companionType,
    companionCount: itinerary.companionCount,
    userAge,
    userGender: itinerary.userGender,
    companionAges: itinerary.companionAges,
  });

  const { rawData: _omit, ...itineraryMeta } = itinerary;
  const guideRef = cast.travelers.length; // 가이드 = 일행 다음 번호
  const geminiInput = {
    itinerary: itineraryMeta,
    day,
    slots,
    cast: {
      travelers: cast.travelers.map((c, i) => ({
        ref: `<IMAGE_REF_${i}>`,
        ...c,
      })),
      totalTravelerCount: cast.totalTravelerCount,
      guide: { ref: `<IMAGE_REF_${guideRef}>`, ...cast.koreanGuide },
      vehicle: { ref: `<IMAGE_REF_${guideRef + 1}>`, ...cast.vehicle },
    },
  };

  const lang = normalizeVideoLang(params.language); // 2026-08-22 사장님 승인 = 미지정 ko(동작 무변경)

  const root0 = process.cwd();
  const referenceImagePaths = [
    ...cast.travelers.map((c) => path.join(root0, c.assetPath)),
    path.join(root0, cast.koreanGuide.assetPath),
    path.join(
      root0,
      `assets/vehicles/vehicle_${cast.vehicle.type === "sprinter_bus" ? "bus" : cast.vehicle.type}.jpg`,
    ),
  ];

  // ⚠️ 2026-08-22 사장님 지시 = 관리자 수동 스토리보드 주입 = 베스트영상·쇼윈도우 제작 정식 채널(1회용 우회 아님).
  const manualPath = path.join(
    root0,
    "docs/storyboards-manual",
    `i${itinerary.id ?? 0}-d${day}.json`,
  );
  if (fs.existsSync(manualPath)) {
    const m = JSON.parse(fs.readFileSync(manualPath, "utf-8"));
    if (m?.scenes?.length) {
      console.log(
        `[storyboard] 수동 스토리보드 사용(${manualPath}) = Gemini 0회`,
      );
      return {
        title: m.title || `${itinerary.title || "여행"} Day ${day}`,
        source: "manual",
        cast,
        referenceImagePaths,
        scenes: (m.scenes as GhibliScene[]).slice(0, slots.length),
      };
    }
  }

  const r = await geminiJson<{ title: string; scenes: GhibliScene[] }>(
    buildStoryboardPrompt(geminiInput, slots.length, lang),
    {
      apiKey: params.apiKey,
      model: params.model, // 미지정 = geminiClient 기본(현행 무변경)
      contextId: null, // 메인앱 런타임 호출 = raw 'runtime' 폴더 (§18 = 발굴 cityId 체계와 분리)
      rawTag: `ghibli-storyboard-i${itinerary.id ?? 0}-d${day}${lang === "ko" ? "" : `-${lang}`}`,
    },
  );
  const data = parseFirstJsonObject<{ title: string; scenes: GhibliScene[] }>(
    r.raw,
  );
  if (!data?.scenes?.length)
    throw new Error(
      `[storyboard] Gemini 응답 파싱 실패: ${r.parseError || r.finishReason}`,
    );
  // 2026-08-22 사장님 승인 = 비ko 응답 키(narration) → 내부 소비처 1벌(narrationKo)로 정규화(소비처 3곳 무변경 = 파장 0)
  if (lang !== "ko")
    for (const s of data.scenes as any[])
      if (s.narration && !s.narrationKo) s.narrationKo = s.narration;

  return {
    title: data.title || `${itinerary.title || "여행"} Day ${day}`,
    source: "gemini",
    cast,
    referenceImagePaths,
    scenes: data.scenes.slice(0, slots.length),
  };
}
