// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 하루 영상 = 옴니 1.1 플래시 1벌 · 실사 배경 + 3D 캐릭터 · 1곳 = 10초 1조각 + 배웅 1조각 · 장면 대본 = 제미니 1회 · 지시문 글자 = prompts/ 파일(잠금) · 화면 글자 없음 (정본 2026-11-03)
import fs from "fs";
import path from "path";
import { calculateAge } from "./protagonist-generator";
import {
  selectGhibliCast,
  type GhibliCast,
  type GhibliCharacter,
} from "./character-roster-ghibli";

export const MAX_SCENES = 10;
const CLIP_SECONDS = 10;

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
  light: string;
  action: string;
  camera: string;
  sfx: string;
  lines: { speaker: string; text: string }[];
}

export const slotPlaceId = (s: any): number =>
  parseInt(String(s?.id ?? "").replace(/\D/g, ""), 10);

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 영상 언어 = 앱 7개 언어 두 글자 코드 → 지시문 언어명 1벌(이 파일 안에서만 씀) (정본 2026-11-03)
const VIDEO_LANGS: Record<string, string> = {
  ko: "Korean",
  en: "English",
  fr: "French",
  ja: "Japanese",
  zh: "Chinese",
  es: "Spanish",
  de: "German",
};
function videoLangName(code?: string | null): string {
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

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 사람 목록 순서 = 일행 순서 + 가이드 마지막, 주인공 = 그 번호 (정본 2026-11-03)
function castLineup(cast: GhibliCast): GhibliCharacter[] {
  return [...cast.travelers, cast.koreanGuide];
}

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 차 그림 파일 고르기 1벌 (정본 2026-11-03)
function vehicleAssetPath(cast: GhibliCast): string {
  return `assets/vehicles/vehicle_${cast.vehicle.type === "sprinter_bus" ? "bus" : cast.vehicle.type}.jpg`;
}

// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "그 매트릭스대로 들어가야지. 옛 것을 왜 살려" = 지금 코드: 출연진 계산 1벌('누구랑'·인원 + 생년월일 매트릭스, 동반자 나이 입력 안 읽음) 뒤 같은 캐릭터는 한 번만 남기고 나머지는 일행 뒤 +N명 (정본 2026-11-01)
export function castForItinerary(
  itinerary: Record<string, any>,
  user?: Record<string, any> | null,
): GhibliCast {
  const cast = selectGhibliCast({
    companionType: itinerary.companionType,
    companionCount: itinerary.companionCount,
    userAge: calculateAge(user?.birthDate || itinerary.userBirthDate),
    userGender: itinerary.userGender,
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

function season(date?: string): string {
  const m = date ? new Date(date).getMonth() + 1 : 0;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return m ? "winter" : "the current season";
}

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 역할 = 아이·10대 먼저(아들·딸) → 대가족 윗 나이대(할아버지·할머니) → 남은 어른 앞 2명(아버지·어머니) · 나머지(다 큰 아들·딸) (정본 2026-11-03)
function roleOf(
  c: GhibliCharacter,
  people: GhibliCharacter[],
  tripKind?: string,
): string {
  const m = c.gender === "male";
  if (c.role === "guide") return "the guide";
  if (tripKind === "Single") return "the traveler";
  if (tripKind === "Couple") return m ? "the husband" : "the wife";
  if (tripKind === "Family" || tripKind === "ExtendedFamily") {
    const young = (x: GhibliCharacter) =>
      x.ageGroup === "kids" || x.ageGroup === "teen";
    const decade = (x: GhibliCharacter) => parseInt(x.ageGroup, 10) || 0;
    const elder = (x: GhibliCharacter) =>
      tripKind === "ExtendedFamily" && decade(x) > decade(people[0]);
    if (young(c)) return m ? "the son" : "the daughter";
    if (elder(c)) return m ? "the grandfather" : "the grandmother";
    const nth = people
      .slice(0, people.indexOf(c))
      .filter((x) => x.role !== "guide" && !young(x) && !elder(x)).length;
    if (nth <= 1) return m ? "the father" : "the mother";
    return m ? "the grown-up son" : "the grown-up daughter";
  }
  return `friend ${people.indexOf(c) + 1}`;
}

const speaker = (role: string) => role.replace(/^the /, "").toUpperCase();
const his = (c: GhibliCharacter) => (c.gender === "female" ? "her" : "his");

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 지시문 글자 = worker/container/prompts/ 파일(압축판, 지문 잠금, 파일마다 한 번만 읽음) · 코드는 {{빈칸}} 치환만 · 제미니가 비운 칸은 빈 글자 · 동작 끝 마침표는 꼭 붙임 (정본 2026-11-03)
const PROMPTS = "worker/container/prompts";
const promptCache = new Map<string, string>();
function promptFile(root: string, name: string): string {
  const file = path.join(root, PROMPTS, name);
  let text = promptCache.get(file);
  if (text === undefined) {
    text = fs
      .readFileSync(file, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\n$/, "");
    promptCache.set(file, text);
  }
  return text;
}
interface Fragments {
  placeRef: string;
  carRef: string;
  carScene: string;
  extra: string;
  age: Record<string, string>;
  ageShort: Record<string, string>;
}
const fragmentsOf = (root: string): Fragments =>
  JSON.parse(promptFile(root, "fragments.json"));
const sentence = (t: string): string => {
  const s = String(t ?? "").trim();
  return !s || /[.!?…]["')\]]*$/.test(s) ? s : `${s}.`;
};
function fill(
  tpl: string,
  vals: Record<string, string | number | undefined>,
): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in vals)) throw new Error(`[prompt] 빈칸 ${k} 값 없음`);
    return String(vals[k] ?? "");
  });
}
function ageOf(c: GhibliCharacter, frag: Fragments): string {
  const tpl = frag.age[c.ageGroup];
  if (!tpl) throw new Error(`[prompt] 나이 문구 없음: ${c.ageGroup}`);
  return fill(tpl, { HIS: his(c) });
}

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
const placeName = (s: any): string =>
  String(s.nameEn || s.nameLocal || s.name || "")
    .split("/")[0]
    .trim();

const CAMERAS = [
  "slow push-in",
  "slow glide",
  "slow tilt up",
  "slow pull back",
];

function placeLine(
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

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 참조 그림 = 사람마다 1장 + 장소 사진 + 차(가이드 여정의 운전 장소·배웅만, 차를 준 장소 조각은 본문에 "차가 근처에 서 있다" 1문장) · 대중교통 여정 = 차 0 · 배웅 = 지하철역 입구 (정본 2026-11-03)
export interface ClipOpts {
  city: string;
  tripKind?: string;
  lang: string;
  startDate?: string;
  translations: Map<number, PlaceTranslation>;
  root: string;
  transport: "guide" | "transit"; // 여정 매트릭스 transportCategory
}

export function sceneScriptPrompt(
  clips: OmniClip[],
  cast: GhibliCast,
  opts: ClipOpts,
): string {
  const people = castLineup(cast);
  const frag = fragmentsOf(opts.root);
  const label = (c: GhibliCharacter) =>
    speaker(roleOf(c, people, opts.tripKind));
  const places = clips.filter((c) => !c.ending);
  return fill(promptFile(opts.root, "scene-script.txt"), {
    CITY: opts.city,
    SEASON: season(opts.startDate),
    N: places.length,
    CAST: people.map((c) => `${label(c)} (${ageOf(c, frag)})`).join("; "),
    CAMERAS: CAMERAS.map((c) => `"${c}"`).join(", "),
    LANG: videoLangName(opts.lang),
    PLACES: places
      .map((c) => {
        const s = c.slots[0];
        const summary = placeLine(
          s,
          opts.lang,
          opts.translations.get(slotPlaceId(s)),
        ).text;
        return `${c.index}. ${placeName(s)}, ${s.startTime || ""}${isMeal(s) ? " (meal)" : ""} — LEAD: ${label(c.lead)} — summary: ${summary.slice(0, 300)}`;
      })
      .join("\n"),
  });
}

export function omniClipRequest(
  clip: OmniClip,
  cast: GhibliCast,
  scene: SceneScript | undefined,
  opts: ClipOpts,
): { prompt: string; images: { path?: string; url?: string }[] } {
  const people = castLineup(cast);
  const frag = fragmentsOf(opts.root);
  const roles = people.map((c) => roleOf(c, people, opts.tripKind));
  const extra = Math.max(0, cast.totalTravelerCount - cast.travelers.length);
  const images: { path?: string; url?: string }[] = people.map((c) => ({
    path: path.join(opts.root, c.assetPath),
  }));
  const s = clip.slots[0];
  const ending = clip.ending || !s;
  let placeRef = "";
  if (!ending && s.image) {
    placeRef = fill(frag.placeRef, { I: images.length });
    images.push({ url: s.image });
  }
  const withCar =
    opts.transport === "guide" &&
    (ending || (drives(s) && !isMeal(s) && !isIndoor(s)));
  let carRef = "";
  if (withCar) {
    carRef = fill(frag.carRef, { I: images.length });
    images.push({ path: path.join(opts.root, vehicleAssetPath(cast)) });
  }
  const head = fill(promptFile(opts.root, "head.txt"), {
    REFS: people
      .map(
        (c, i) =>
          `<IMAGE_REF_${i}> ${roles[i].replace(/^the /, "")} ${frag.ageShort[c.ageGroup]}`,
      )
      .join(", "),
    PLACE_REF: placeRef,
    CAR_REF: carRef,
    COUNT: people.length,
    EXTRA: extra ? fill(frag.extra, { N: extra }) : "",
    LANG: videoLangName(opts.lang),
  });

  if (ending) {
    const body = fill(
      promptFile(opts.root, withCar ? "farewell.txt" : "farewell-transit.txt"),
      { CITY: opts.city, FAREWELL: FAREWELL[opts.lang] || FAREWELL.en },
    );
    return { prompt: `${head}\n${body}`, images };
  }
  if (!scene) throw new Error(`[prompt] 조각 ${clip.index} 장면 대본 없음`);
  const body = fill(promptFile(opts.root, "clip.txt"), {
    PLACE: placeName(s),
    CITY: opts.city,
    LIGHT: scene.light,
    FOREGROUND: scene.foreground,
    CAR: withCar ? frag.carScene : "",
    ACTION: sentence(scene.action),
    CAMERA: scene.camera,
    SFX: scene.sfx,
    LINES: (scene.lines || []).map((l) => `${l.speaker}: ${l.text}`).join("\n"),
  });
  return { prompt: `${head}\n${body}`, images };
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
