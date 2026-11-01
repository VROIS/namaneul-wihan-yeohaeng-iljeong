// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "지금 영상 만드는 방식이 이제 정본이야. 오늘 날짜 찍어" = 지금 코드: 하루 영상 = 옴니 1.1 플래시 1벌 · 실사 배경 + 3D 캐릭터 · 1곳 = 10초 1조각 + 배웅 1조각 · 장면 대본 = 제미니 1회 · 화면 글자 없음 (정본 2026-11-01)
import path from "path";
import { calculateAge } from "./protagonist-generator";
import {
  selectGhibliCast,
  type GhibliCast,
  type GhibliCharacter,
} from "./character-roster-ghibli";

export const MAX_SCENES = 10;
export const CLIP_SECONDS = 10;

export interface OmniClip {
  index: number;
  slots: any[]; // 장소 1곳 · 배웅 = 빈 목록
  lead: GhibliCharacter;
  ending: boolean;
  seconds: number;
}

export interface PlaceTranslation {
  editorialSummary: string | null;
}

export interface SceneScript {
  n: number;
  foreground: string;
  action: string;
  camera: string;
  sfx: string;
  guideLine: string;
  reaction: string;
}

export const slotPlaceId = (s: any): number =>
  parseInt(String(s?.id ?? "").replace(/\D/g, ""), 10);

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 영상 언어 = 앱 7개 언어 두 글자 코드 → 지시문 언어명 1벌 (정본 §)
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

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "오늘 즐거웠어요 빠지고" = 지금 코드: 배웅 인사 = 앱 7개 언어 고정 문장(오늘 즐거웠다 + 작별) (정본 2026-11-01)
const FAREWELL: Record<string, string> = {
  ko: "오늘 정말 즐거웠어요. 조심히 들어가세요!",
  en: "Today was so much fun. Take care on your way home!",
  fr: "Aujourd'hui, c'était vraiment génial. Rentrez bien !",
  ja: "今日は本当に楽しかったです。気をつけて帰ってくださいね！",
  zh: "今天真的很开心。回去路上小心！",
  es: "Hoy ha sido muy divertido. ¡Que lleguen bien a casa!",
  de: "Heute hat es richtig Spaß gemacht. Kommen Sie gut nach Hause!",
};

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 사람 목록 순서 = 일행 순서 + 가이드 마지막, 주인공 = 그 번호 (정본 §)
export function castLineup(cast: GhibliCast): GhibliCharacter[] {
  return [...cast.travelers, cast.koreanGuide];
}

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 차 그림 파일 고르기 1벌 (정본 §)
export function vehicleAssetPath(cast: GhibliCast): string {
  return `assets/vehicles/vehicle_${cast.vehicle.type === "sprinter_bus" ? "bus" : cast.vehicle.type}.jpg`;
}

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "같은 그림은 한 번만 + N명 · 최대 60대" = 지금 코드: 출연진 계산 1벌('누구랑'·인원 + 생년월일 실계산) 뒤 같은 캐릭터는 한 번만 남기고 나머지는 일행 뒤 +N명 (정본 2026-11-01)
export function castForItinerary(
  itinerary: Record<string, any>,
  user?: Record<string, any> | null,
): GhibliCast {
  const cast = selectGhibliCast({
    companionType: itinerary.companionType,
    companionCount: itinerary.companionCount,
    userAge: calculateAge(user?.birthDate || itinerary.userBirthDate),
    userGender: itinerary.userGender,
    companionAges: itinerary.companionAges,
  });
  const seen = new Set<string>();
  const travelers = cast.travelers.filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  return { ...cast, travelers };
}

export function omniClips(slots: any[], cast: GhibliCast): OmniClip[] {
  const people = castLineup(cast);
  const clips: OmniClip[] = slots.map((s, i) => ({
    index: i + 1,
    slots: [s],
    lead: people[i % people.length],
    ending: false,
    seconds: CLIP_SECONDS,
  }));
  clips.push({
    index: clips.length + 1,
    slots: [],
    lead: cast.koreanGuide,
    ending: true,
    seconds: CLIP_SECONDS,
  });
  return clips;
}

function lightAt(time?: string): string {
  const h = parseInt(String(time || "12").split(":")[0], 10);
  if (h < 10) return "Soft morning light";
  if (h < 12) return "Bright late-morning light";
  if (h < 15) return "Clear midday light";
  if (h < 18) return "Warm afternoon light";
  if (h < 19) return "Golden sunset light";
  return "Cozy evening light with glowing lamps";
}

function season(date?: string): string {
  const m = date ? new Date(date).getMonth() + 1 : 0;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return m ? "winter" : "the current season";
}

function roleOf(i: number, c: GhibliCharacter, tripKind?: string): string {
  const m = c.gender === "male";
  if (c.role === "guide") return "the guide";
  if (tripKind === "Single") return "the traveler";
  if (tripKind === "Couple") return m ? "the husband" : "the wife";
  if (tripKind === "Family" || tripKind === "ExtendedFamily") {
    if (i <= 1) return m ? "the father" : "the mother";
    if (tripKind === "ExtendedFamily" && i <= 3)
      return m ? "the grandfather" : "the grandmother";
    if (c.ageGroup === "kids" || c.ageGroup === "teen")
      return m ? "the son" : "the daughter";
    return m ? "the grown-up son" : "the grown-up daughter";
  }
  return `friend ${i + 1}`;
}

const DECADE: Record<string, string> = {
  "2": "twenties",
  "3": "thirties",
  "4": "forties",
  "5": "fifties",
  "6": "sixties",
};
function ageOf(c: GhibliCharacter): string {
  if (/kid/.test(c.id)) return "a child about ten years old";
  if (/teen/.test(c.id)) return "a teenager about fifteen years old";
  const d = c.id.match(/(\d)0s/)?.[1];
  const his = c.gender === "female" ? "her" : "his";
  return d ? `in ${his} ${DECADE[d]}` : "an adult";
}

const speaker = (role: string) => role.replace(/^the /, "").toUpperCase();
const isMeal = (s: any) =>
  !!s.isMealSlot ||
  /restaurant|cafe/i.test(`${s.seedCategory || ""} ${s.type || ""}`);
const drives = (s: any) => !!s.transit_mode && !/walk/i.test(s.transit_mode);
// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "실내이면 차를 넣지 않는다" = 지금 코드: 쇼핑 분류이거나 이름이 몰·도서관·박물관·수족관·백화점·미술관·아케이드면 차 그림 없음 (정본 2026-11-01)
const isIndoor = (s: any) =>
  s.seedCategory === "shopping" ||
  /\b(mall|library|museum|aquarium|department store|gallery|arcade)\b/i.test(
    String(s.nameEn || s.name || ""),
  );
export const placeName = (s: any): string =>
  String(s.nameEn || s.nameLocal || s.name || "")
    .split("/")[0]
    .trim();

const CAMERAS = [
  "slow push-in",
  "slow glide",
  "slow tilt up",
  "slow pull back",
];

export function placeLine(
  slot: any,
  lang: string,
  tr?: PlaceTranslation,
): { text: string; lang: string } {
  if (lang !== "ko" && tr?.editorialSummary?.trim())
    return { text: tr.editorialSummary.trim(), lang };
  return {
    text: String(slot.editorialSummary || slot.summaryKo || "").trim(),
    lang: "ko",
  };
}

interface ClipOpts {
  city: string;
  tripKind?: string;
  lang: string;
  startDate?: string;
  translations: Map<number, PlaceTranslation>;
  root: string;
}

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "대사는 우리 기본 틀만 주고" = 지금 코드: 장면 대본 요청문 = Flow 대본 도구 형식(장소마다 10초 한 컷 · 전경 · 주인공 동작 1개 · 카메라 1개 · 소리 · 가이드 한 줄 + 반응 한 줄) (정본 2026-11-01)
export function sceneScriptPrompt(
  clips: OmniClip[],
  cast: GhibliCast,
  opts: ClipOpts,
): string {
  const people = castLineup(cast);
  const langName = videoLangName(opts.lang);
  const label = (c: GhibliCharacter) =>
    speaker(roleOf(people.indexOf(c), c, opts.tripKind));
  const places = clips.filter((c) => !c.ending);
  return [
    `You write scene scripts for a vertical 9:16 travel film in ${opts.city}, ${season(opts.startDate)}.`,
    `Exactly ${places.length} scenes, one per place in this order. Each scene = ONE continuous 10-second shot (no cuts).`,
    `Cast (exactly these people, every scene): ${people.map((c) => `${label(c)} (${ageOf(c)})`).join("; ")}. The GUIDE is a local driving guide who presents each place.`,
    "For each scene write:",
    "- foreground: what is in the sharp foreground, fitting the season and the place (flowers, leaves, steam, lanterns...), one short phrase",
    '- action: the given LEAD person doing ONE clear, funny, visible action that fits the place; start with "The <lead>"',
    `- camera: exactly one of ${CAMERAS.map((c) => `"${c}"`).join(", ")}`,
    "- sfx: one line of place sounds",
    `- guideLine: the guide's line in ${langName}, 15-25 characters, a warm witty one-liner drawn from the place summary; no numbers, no English words`,
    `- reaction: the LEAD's short ${langName} reaction, under 15 characters, no numbers, no English words (if the lead is the GUIDE, the reaction comes from the first family member instead)`,
    "Never have anyone read, point at or hold any sign, menu or text. Meal places: the group sits at one table with the signature dish.",
    "Places:",
    ...places.map((c) => {
      const s = c.slots[0];
      const summary = placeLine(
        s,
        opts.lang,
        opts.translations.get(slotPlaceId(s)),
      ).text;
      return `${c.index}. ${placeName(s)}, ${s.startTime || ""}${isMeal(s) ? " (meal)" : ""} — LEAD: ${label(c.lead)} — summary: ${summary.slice(0, 300)}`;
    }),
    'Return JSON: {"scenes":[{"n":1,"foreground":"","action":"","camera":"","sfx":"","guideLine":"","reaction":""}]}',
  ].join("\n");
}

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "지금 영상 만드는 방식이 이제 정본이야" = 지금 코드: 옴니 지시문 = Flow 최고판 틀(실사 환경 + 3D 사람 · 참고 그림 = 3D 캐릭터·장소 실사 사진·3D 차 · 나이 · 대사는 소리로만 · 글자 금지) (정본 2026-11-01)
export function omniClipRequest(
  clip: OmniClip,
  cast: GhibliCast,
  scene: SceneScript | undefined,
  opts: ClipOpts,
): { prompt: string; images: { path?: string; url?: string }[] } {
  const people = castLineup(cast);
  const langName = videoLangName(opts.lang);
  const ref = (i: number) => `<IMAGE_REF_${i}>`;
  const roles = people.map((c, i) => roleOf(i, c, opts.tripKind));
  const guide = cast.koreanGuide;
  const gHis = guide.gender === "female" ? "her" : "his";
  const gHim = guide.gender === "female" ? "her" : "him";
  const extra = Math.max(0, cast.totalTravelerCount - cast.travelers.length);
  const images: { path?: string; url?: string }[] = people.map((c) => ({
    path: path.join(opts.root, c.assetPath),
  }));
  const s = clip.slots[0];
  let placeRef = "";
  if (s?.image) {
    placeRef = ` ${ref(images.length)} is the real place: use it only for the layout and landmarks; it never changes how the people look.`;
    images.push({ url: s.image });
  }
  const withCar =
    clip.ending || (!!s && drives(s) && !isMeal(s) && !isIndoor(s));
  const carRef = withCar
    ? images.push({ path: path.join(opts.root, vehicleAssetPath(cast)) }) - 1
    : -1;
  const spoken = "These lines are only heard, never written on screen.";

  const head = [
    "STYLE: Premium cinematic travel film. The ENVIRONMENT is fully photorealistic like a high-end travel reel: sharp seasonal foreground, natural light, shallow depth of field, one rich warm color grade. The PEOPLE are high-end 3D animated film characters (Pixar-like, soft stylized faces, expressive acting, talking) - every person in every frame is rendered exactly like their 3D reference image, never as a photoreal human. Characters interact with each other, not the camera. Uncropped full frame, textless: no letters, blank signboards, no speech bubbles, no captions, no letterboxing.",
    `References: ${people.map((c, i) => `${ref(i)} ${speaker(roles[i])}`).join(", ")} — each image fixes that one person's face, hair and outfit.${placeRef}`,
    `${people
      .map((c, i) => `${roles[i]} is ${ageOf(c)}`)
      .join("; ")
      .replace(
        /^t/,
        "T",
      )}. Only the people in the reference images are the group;${extra ? ` ${extra} more members of the group stand just behind them;` : ""} everyone else stays small and far in the background. The guide always wears ${gHis} own outfit and never works at a shop. Phones stay in pockets.`,
    `Dialogue in ${langName} only, each line spoken only by its own speaker with matching lips. No letters anywhere: blank signs, no speech bubbles, no captions, no subtitles. Nobody reads, points at or holds any sign or menu.`,
    "",
  ];

  if (clip.ending || !s) {
    const prompt = [
      ...head,
      `A continuous ten-second vertical 9:16 shot. The end of the day in ${opts.city}: ${lightAt("19:00").toLowerCase()} beside the guide's car ${ref(carRef)}.`,
      "The guide opens the car door for everyone; the whole group turns and waves goodbye to the camera, happy and tired.",
      "The camera: slow pull back.",
      "SFX: soft evening city ambience and a car door opening.",
      `GUIDE: ${FAREWELL[opts.lang] || FAREWELL.en}`,
      spoken,
    ].join("\n");
    return { prompt, images };
  }

  const lead = clip.lead;
  const leadLabel = speaker(roles[people.indexOf(lead)]);
  const reactor = lead.role === "guide" ? speaker(roles[0]) : leadLabel;
  const camera =
    scene && CAMERAS.includes(scene.camera) ? scene.camera : CAMERAS[0];
  const prompt = [
    ...head,
    `A continuous ten-second vertical 9:16 shot. ${placeName(s)}, ${opts.city}, ${lightAt(s.startTime).toLowerCase()}; ${scene?.foreground || "seasonal details"} sharp in the foreground.${carRef >= 0 ? ` The guide's car ${ref(carRef)} is parked nearby.` : ""}`,
    isMeal(s)
      ? `The guide seats everyone around one table and presents the signature dish, steaming and delicious. ${scene?.action || ""}`.trim()
      : `The guide stands in the foreground presenting the place; the group is with ${gHim}. ${scene?.action || ""}`.trim(),
    `The camera: ${camera}.`,
    `SFX: ${scene?.sfx || "the natural sounds of the place"}`,
    `GUIDE: ${scene?.guideLine || ""}`,
    `${reactor}: ${scene?.reaction || ""}`,
    spoken,
  ].join("\n");
  return { prompt, images };
}

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "유리카드처럼 생긴 그거 다 삭제하고 이거를 정본으로" = 지금 코드: 지명 타이포그래피 문구 = 위 줄 영어 장소명 · 아래 줄 도착 시각 · 배웅 = 도시 이름 (정본 2026-11-01)
export function clipTitle(
  clip: OmniClip,
  city: string,
): { name: string; time?: string } {
  const s = clip.slots[0];
  if (clip.ending || !s) return { name: city };
  const [h, m] = String(s.startTime || "")
    .split(":")
    .map(Number);
  const time =
    !s.startTime || Number.isNaN(h)
      ? undefined
      : `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { name: placeName(s), time };
}

// ⚠️ 수정금지(승인필요) 2026-09-28 사장님 결정 = 영상 폴더 = shared/r2-paths videoDir(도시 번호/videos/여정), 이름 맨 앞 = 만든 시각 초까지(다시 만들어도 덮지 않음), 조각 이름에 장소 번호·언어 (정본 K3)
export const dayVideoKey = (
  folder: string,
  day: number,
  stamp: string,
): string => `${folder}/${stamp}_day${day}.mp4`;

export function clipKey(
  folder: string,
  day: number,
  stamp: string,
  clip: OmniClip,
  lang: string,
): string {
  const places = clip.slots.map((s) => `p${slotPlaceId(s)}`).join("-");
  return `${folder}/${stamp}_day${day}/clip${clip.index}-${places || "end"}-${lang}.mp4`;
}
