// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 지브리 스토리보드 = Gemini 1콜 ('AI의견' 패턴)
// = "우리가 가진 것 전부 다 줌": 여정 메타+바이브+해당일 슬롯 전요소(PSR summaryKo·editorialSummary 포함)+캐릭터·차량 매트릭스를
//   JSON 그대로 Gemini 에 제공(셀렉 금지) → 하루 전체 씬(최대 8)의 장면+한국어 대사를 한 번에 작성
//   = 대사·서사 일관성 + 환각 차단(실데이터만 근거). 옛 코드 템플릿 조립 = 폐기 2026-07-22 사장님 지시.
// = visualPrompt 의 <IMAGE_REF_0/1/2> = video-gen-client 레퍼런스 배열 순서(주인공/가이드/차량)와 1:1.

import path from "path";
import { geminiJson } from "./shared/geminiClient";
import { calculateAge } from "./protagonist-generator";
import { selectGhibliCast, type GhibliCast } from "./character-roster-ghibli";

export interface GhibliScene {
  sceneIndex: number;
  placeName: string;
  visualPrompt: string; // Omni 영상 프롬프트(영어, <IMAGE_REF_N> 태그 포함)
  narrationKo: string; // 한국어 나레이션 대사(6초 낭독 분량)
}

export interface GhibliStoryboard {
  title: string;
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
}

// 사장님 SSOT 2026-07-22 = 6초×최대 10씬 ≈ 60초. 씬 수·길이 상수 = 이 파일 1벌만(routes·stitcher 가 import = §0 드리프트 차단)
export const MAX_SCENES = 10;
export const SCENE_SECONDS = 6;

// 스토리보드 지시 프롬프트 (= 코드 = 변경 시 사장님 원본 제시 후 반영)
function buildStoryboardPrompt(input: object, sceneCount: number): string {
  return `당신은 스튜디오 지브리풍 여행 애니메이션 감독입니다.
아래 [여행 데이터]는 실제 사용자의 하루 여정입니다. 이것을 6초 씬 ${sceneCount}개로 구성된 세로(9:16) 숏폼 애니메이션 스토리보드로 만드세요.

연출 원칙:
1. 톤 = 최대한 코믹하고 유쾌하게. 과장된 표정, 슬랩스틱, 씬마다 웃음 포인트 1개 이상. 지브리 수채화 감성.
2. 등장인물 = **일행 전원 + 드라이빙 가이드 1명 = 반드시 (일행 수+1)명 구성**(일행 수 = cast.totalTravelerCount). [여행 데이터] cast.travelers 의 일행 전원(각자의 <IMAGE_REF_N> 태그·나이대·성별 그대로)과 파리 현지 거주 한국인 드라이빙 가이드는 **모든 씬 필수 등장**(가이드 생략 금지 = 이 영상의 목적). 가이드 차량도 동일 차량 유지. **특정 1명만 등장 금지**(일행 수가 이미지보다 많으면 totalTravelerCount 만큼 나머지도 배경에 함께). 장소 간 이동 장면은 차량 드라이빙의 편안함·즐거움을 매력적으로 강조.
3. narrationKo = 해당 슬롯의 editorialSummary 문구를 **그대로** 사용(창작·수정 금지 = 우리 서비스 톤앤매너 유지). editorialSummary 가 없는 슬롯만 summaryKo 근거로 25자 내외 1문장 작성(데이터에 없는 사실 창작 금지).
4. 식사 슬롯(isMealSlot=true) = 음식 클로즈업 + 주인공 리액션 개그.
5. visualPrompt = 영어로 작성. 반드시 "Studio Ghibli hand-drawn watercolor anime style" 포함 + <IMAGE_REF_N> 태그로 인물·차량 지정 + 해당 장소의 시각 특징 + 코믹 액션 묘사 + "vertical 9:16 short-form".
6. 씬 순서 = 슬롯 시간 순서 그대로. 씬 수 = 정확히 ${sceneCount}개.
7. 전체 = 하나의 여행 브이로그 스토리(기승전결): 첫 씬 = 설레는 하루 시작 인사, 마지막 씬 = 하루를 마무리하는 소감 한마디, 씬 간 대사·감정이 앞 씬을 이어받아 자연스럽게 흐르도록(각 씬이 따로 놀지 않게).

출력 = JSON 만:
{"title":"영상 제목(한국어, 유쾌하게)","scenes":[{"sceneIndex":1,"placeName":"슬롯 장소명","visualPrompt":"...","narrationKo":"..."}]}

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

/** [A안] 씬 1개의 영상 생성 프롬프트 = visualPrompt + 한국어 나레이션(화자 음색 = 출연진 연동) */
export function sceneClipPrompt(scene: GhibliScene, narrator?: string): string {
  return `${scene.visualPrompt}
${SCENE_SECONDS}-second clip. Audio: ${narrator || "a warm, cheerful Korean narrator"} says in Korean: "${scene.narrationKo}" — plus light Ghibli-style piano background music.`;
}

/** [B안 ①] 씬 스틸 합성 프롬프트 = 실사 배경 유지 + 우리 캐릭터 삽입 (나노바나나).
 *  hasPlacePhoto = 장소 실사진 첨부 여부(§22 review: 사진 결손 슬롯에서 첫 첨부=캐릭터인데 "첫 장=배경" 지시 = 깨진 스틸 방지) */
export function sceneStillPrompt(
  scene: GhibliScene,
  totalTravelerCount: number,
  hasPlacePhoto: boolean,
): string {
  const background = hasPlacePhoto
    ? `The FIRST attached image is a real photograph of "${scene.placeName}" — use it as the background and keep it a photorealistic photograph (do not repaint, stylize or illustrate the background).`
    : `No place photo is attached — create a photorealistic background that faithfully depicts the real place "${scene.placeName}".`;
  return `Photo compositing task. ${background}
Insert the illustrated Korean travel characters from the attached character images into this real scene: exactly ${totalTravelerCount} traveler(s) AND 1 driving guide = ${totalTravelerCount + 1} people total, every one of them visible, with correct scale, perspective, lighting and soft shadows. Comic, cheerful poses fitting this moment: "${scene.narrationKo}"
Keep every character's face, hairstyle and outfit exactly as in their reference images.
Do NOT render any text, captions, subtitles, letters, numbers, ratios, watermarks or logos in the image (existing real signage in the photo is fine).
Tall vertical portrait composition, high detail.`;
}

/** [B안 ②] 스틸→영상 프롬프트 = 사진 배경 유지 + 자연 모션 + 한국어 나레이션 (Veo Lite 첫 프레임 입력용) */
export function scenePhotoMotionPrompt(
  scene: GhibliScene,
  narrator?: string,
): string {
  return `Animate this image into a lively ${SCENE_SECONDS}-second clip. Keep the photographic background of "${scene.placeName}" as-is (no style change). The characters move naturally and playfully — small comic actions, waving, laughing. Subtle cinematic camera motion. Do NOT add any text, captions or numbers.
Audio: ${narrator || "a warm, cheerful Korean narrator"} says in Korean: "${scene.narrationKo}" — plus light piano background music.`;
}

// Gemini가 간혹 정상 JSON 뒤에 여분의 `}` 를 붙임(2026-07-22 운영 i103 raw 2회 실증 = "...}\n}") →
// 중괄호 균형 기준으로 첫 JSON 객체만 정확히 추출하는 파서 1벌(§0). 문자열 내부의 {}·이스케이프 안전.
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

/** 하루치 지브리 스토리보드 = Gemini 1콜 (비용 ≈ $0.01 미만) */
export async function buildGhibliStoryboard(
  params: StoryboardParams,
): Promise<GhibliStoryboard> {
  const { itinerary, user, day } = params;
  const slots = (params.slots || []).slice(0, MAX_SCENES);
  if (!slots.length) throw new Error(`[storyboard] day ${day} 슬롯 없음`);

  // 출연진 = '누구랑'(companionType·companionCount) + users.birth_date 실계산 = 사장님 SSOT 2026-07-22
  //   (protagonist-generator 의 calculateAge 재사용 §16. 생년월일 없는 계정 = 40대 가정)
  const userAge = calculateAge(user?.birthDate || itinerary.userBirthDate);
  const cast = selectGhibliCast({
    companionType: itinerary.companionType,
    companionCount: itinerary.companionCount,
    userAge,
    userGender: itinerary.userGender,
    companionAges: itinerary.companionAges,
  });

  // 전부 다 줌 = 여정 메타(무거운 rawData 원본 컬럼만 제외 = slots 로 이미 포함) + 출연진·차량
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

  const r = await geminiJson<{ title: string; scenes: GhibliScene[] }>(
    buildStoryboardPrompt(geminiInput, slots.length),
    {
      apiKey: params.apiKey,
      contextId: null, // 메인앱 런타임 호출 = raw 'runtime' 폴더 (§18 = 발굴 cityId 체계와 분리)
      rawTag: `ghibli-storyboard-i${itinerary.id ?? 0}-d${day}`,
    },
  );
  // 파싱 = 균형 파서 1벌만 사용(관문의 greedy 정규식은 여분 `}` 에 깨짐 = 운영 실증)
  const data = parseFirstJsonObject<{ title: string; scenes: GhibliScene[] }>(
    r.raw,
  );
  if (!data?.scenes?.length)
    throw new Error(
      `[storyboard] Gemini 응답 파싱 실패: ${r.parseError || r.finishReason}`,
    );

  const root = process.cwd();
  return {
    title: data.title || `${itinerary.title || "여행"} Day ${day}`,
    cast,
    referenceImagePaths: [
      ...cast.travelers.map((c) => path.join(root, c.assetPath)),
      path.join(root, cast.koreanGuide.assetPath),
      path.join(
        root,
        `assets/vehicles/vehicle_${cast.vehicle.type === "sprinter_bus" ? "bus" : cast.vehicle.type}.jpg`,
      ),
    ],
    scenes: data.scenes.slice(0, slots.length),
  };
}
