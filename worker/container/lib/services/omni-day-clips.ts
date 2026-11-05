// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 하루 영상 = 옴니 1.2 플래시 1벌 · 인물·장소 모두 3D · 2곳 = 15초 1조각(홀수 마지막 1곳 = 8초) · 마지막 장소 안에서 작별 · 장면 대본 = 제미니 1회 · 지시문 글자 = prompts/ 파일(잠금) · 화면 글자 없음 (정본 2026-11-05)
import fs from "fs";
import path from "path";
import { calculateAge } from "./protagonist-generator";
import {
  selectGhibliCast,
  type GhibliCast,
  type GhibliCharacter,
} from "./character-roster-ghibli";
import { sceneOf } from "./prompt-check";

export const MAX_SCENES = 10;
const PAIR_SECONDS = 15;
const SINGLE_SECONDS = 8;

export interface OmniClip {
  index: number;
  slots: any[]; // 장소 2곳(홀수 마지막 = 1곳)
  placeNos: number[]; // 장소 순번 = 장면 대본 n
  leads: GhibliCharacter[]; // 장소마다 주인공
  ending: boolean; // 마지막 장소가 든 조각 = 작별 포함
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

// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 장소 2곳씩 1조각(15초) · 홀수 마지막 1곳 = 8초 · 배웅 조각 없음 = 마지막 장소 조각이 작별 포함 · 주인공 = 장소 순번대로 일행 → 가이드 (정본 2026-11-05)
export function omniClips(slots: any[], cast: GhibliCast): OmniClip[] {
  const people = castLineup(cast);
  const clips: OmniClip[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const placeNos = [i + 1, i + 2].filter((n) => n <= slots.length);
    clips.push({
      index: clips.length + 1,
      slots: placeNos.map((n) => slots[n - 1]),
      placeNos,
      leads: placeNos.map((n) => people[(n - 1) % people.length]),
      ending: placeNos[placeNos.length - 1] === slots.length,
      seconds: placeNos.length === 2 ? PAIR_SECONDS : SINGLE_SECONDS,
    });
  }
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

// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 참조 그림 = 사람마다 1장 + 차(가이드 여정에서 조각 안 운전 장소가 있을 때, 그 장소 칸에 "차가 근처에 서 있다" 1문장) · 장소 사진 없음(이름만) · 대중교통 여정 = 차 0 · 최대 6장 (정본 2026-11-05)
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
  const places = clips.flatMap((c) =>
    c.slots.map((s, k) => ({ s, no: c.placeNos[k], lead: c.leads[k] })),
  );
  return fill(promptFile(opts.root, "scene-script.txt"), {
    CITY: opts.city,
    SEASON: season(opts.startDate),
    N: places.length,
    CAST: people.map((c) => `${label(c)} (${ageOf(c, frag)})`).join("; "),
    CAMERAS: CAMERAS.map((c) => `"${c}"`).join(", "),
    LANG: videoLangName(opts.lang),
    FAREWELL: FAREWELL[opts.lang] || FAREWELL.en,
    PLACES: places
      .map(({ s, no, lead }) => {
        const summary = placeLine(
          s,
          opts.lang,
          opts.translations.get(slotPlaceId(s)),
        ).text;
        return `${no}. ${placeName(s)}, ${s.startTime || ""}${isMeal(s) ? " (meal)" : ""} — LEAD: ${label(lead)} — summary: ${summary.slice(0, 300)}`;
      })
      .join("\n"),
  });
}

// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 조각 안 시간 = 2곳 0-7s / 7-15s · 1곳 0-8s · 마지막 장소 칸 끝에 작별 1문장 (정본 2026-11-05)
const CUTS: Record<number, string[]> = { 2: ["0-7s", "7-15s"], 1: ["0-8s"] };
const CUT_AT: Record<number, number[]> = { 2: [0, 7], 1: [0] };

export function omniClipRequest(
  clip: OmniClip,
  cast: GhibliCast,
  scenes: SceneScript[],
  opts: ClipOpts,
): { prompt: string; images: { path?: string; url?: string }[] } {
  const people = castLineup(cast);
  const frag = fragmentsOf(opts.root);
  const roles = people.map((c) => roleOf(c, people, opts.tripKind));
  const extra = Math.max(0, cast.totalTravelerCount - cast.travelers.length);
  const images: { path?: string; url?: string }[] = people.map((c) => ({
    path: path.join(opts.root, c.assetPath),
  }));
  const carAt = (s: any) => drives(s) && !isMeal(s) && !isIndoor(s);
  const withCar = opts.transport === "guide" && clip.slots.some(carAt);
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
    CAR_REF: carRef,
    COUNT: people.length,
    EXTRA: extra ? fill(frag.extra, { N: extra }) : "",
    LANG: videoLangName(opts.lang),
    SECONDS: clip.seconds,
  });
  const cuts = CUTS[clip.slots.length];
  const parts = clip.slots.map((s, k) => {
    const scene = sceneOf(scenes, clip.placeNos[k]);
    if (!scene)
      throw new Error(`[prompt] 장소 ${clip.placeNos[k]} 장면 대본 없음`);
    const body = fill(promptFile(opts.root, "clip.txt"), {
      PLACE: placeName(s),
      CITY: opts.city,
      LIGHT: scene.light,
      FOREGROUND: scene.foreground,
      CAR: withCar && carAt(s) ? frag.carScene : "",
      ACTION: sentence(scene.action),
      CAMERA: scene.camera,
      SFX: scene.sfx,
      LINES: (scene.lines || [])
        .map((l) => `${l.speaker}: ${l.text}`)
        .join("\n"),
    });
    const bye =
      clip.ending && k === clip.slots.length - 1
        ? `\n${fill(promptFile(opts.root, "farewell.txt"), { CITY: opts.city })}`
        : "";
    return `${cuts[k]}: ${body}${bye}`;
  });
  return { prompt: [head, ...parts].join("\n"), images };
}

// ⚠️ 수정금지(승인필요) 2026-11-05 사장님 결정 = 지명 타이포그래피 = 조각 안 장소마다(2곳 = 0초·7초) 위 줄 영어 장소명 · 아래 줄 도착 시각 (정본 2026-11-05)
export function clipTitles(
  clip: OmniClip,
): { title: { name: string; time?: string }; at: number }[] {
  return clip.slots.map((s, k) => {
    const [h, m] = String(s.startTime || "")
      .split(":")
      .map(Number);
    const time =
      !s.startTime || Number.isNaN(h)
        ? undefined
        : `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    return {
      title: { name: placeName(s), time },
      at: CUT_AT[clip.slots.length][k],
    };
  });
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
