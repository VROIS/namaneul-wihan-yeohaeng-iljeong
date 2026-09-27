// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 하루 영상 = 옴니 1.1 플래시 1벌 = 여정 자료로 바로 10초 조각(2곳), 가이드가 안내하는 투어 쇼, 화면 글자 없음 (정본 §)
import path from "path";
import { calculateAge } from "./protagonist-generator";
import {
  selectGhibliCast,
  type GhibliCast,
  type GhibliCharacter,
} from "./character-roster-ghibli";

export const MAX_SCENES = 10;
export const OMNI_PLACES_PER_CLIP = 2;
export const OMNI_SECONDS_PER_PLACE = 5;
const REVEAL_SECONDS = 2;

export interface OmniClip {
  index: number;
  slots: any[];
  leads: GhibliCharacter[];
  ending: boolean;
  seconds: number;
}

export interface PlaceTranslation {
  editorialSummary: string | null;
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

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 사람 목록 순서 = 일행 순서 + 가이드 마지막, 주인공 = 그 번호 (정본 §)
export function castLineup(cast: GhibliCast): GhibliCharacter[] {
  return [...cast.travelers, cast.koreanGuide];
}

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 차 그림 파일 고르기 1벌 (정본 §)
export function vehicleAssetPath(cast: GhibliCast): string {
  return `assets/vehicles/vehicle_${cast.vehicle.type === "sprinter_bus" ? "bus" : cast.vehicle.type}.jpg`;
}

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 출연진 계산 1벌('누구랑'·인원 + 생년월일 실계산) (정본 §)
export function castForItinerary(
  itinerary: Record<string, any>,
  user?: Record<string, any> | null,
): GhibliCast {
  return selectGhibliCast({
    companionType: itinerary.companionType,
    companionCount: itinerary.companionCount,
    userAge: calculateAge(user?.birthDate || itinerary.userBirthDate),
    userGender: itinerary.userGender,
    companionAges: itinerary.companionAges,
  });
}

export function omniClips(slots: any[], cast: GhibliCast): OmniClip[] {
  const people = castLineup(cast);
  const clips: OmniClip[] = [];
  for (let i = 0; i < slots.length; i += OMNI_PLACES_PER_CLIP) {
    const group = slots.slice(i, i + OMNI_PLACES_PER_CLIP);
    clips.push({
      index: clips.length + 1,
      slots: group,
      leads: group.map((_, j) => people[(i + j) % people.length]),
      ending: false,
      seconds: group.length * OMNI_SECONDS_PER_PLACE,
    });
  }
  const last = clips[clips.length - 1];
  if (last && last.slots.length < OMNI_PLACES_PER_CLIP) {
    last.ending = true;
    last.seconds += OMNI_SECONDS_PER_PLACE;
  }
  return clips;
}

const TRIP_KIND: Record<string, string> = {
  Single: "a solo traveler",
  Couple: "a couple",
  Family: "a family",
  ExtendedFamily: "a big family",
  Group: "a group of friends",
};

function lightAt(time?: string): string {
  const h = parseInt(String(time || "12").split(":")[0], 10);
  if (h < 10) return "Soft morning light";
  if (h < 12) return "Bright late-morning light";
  if (h < 15) return "Clear midday light";
  if (h < 18) return "Warm afternoon light";
  if (h < 19) return "Golden sunset light";
  return "Cozy evening light with glowing lamps";
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
    return m
      ? `the grown-up son (in his ${c.ageGroup})`
      : `the grown-up daughter (in her ${c.ageGroup})`;
  }
  return `friend ${i + 1}`;
}

const isMeal = (s: any) =>
  !!s.isMealSlot ||
  /restaurant|cafe/i.test(`${s.seedCategory || ""} ${s.type || ""}`);
const drives = (s: any) => !!s.transit_mode && !/walk/i.test(s.transit_mode);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 장면 카드 = 영어 장소명만(요약 줄 없음, 설명은 가이드 대사가 함), 배웅이 든 조각은 도시 카드 1장 더 = 5초마다 넘김 (정본 §)
export function omniSceneCards(
  clips: OmniClip[],
  city: string,
): { placeName: string }[] {
  return clips.flatMap((c) => [
    ...c.slots.map((s) => ({
      placeName: String(s.nameEn || s.nameLocal || s.name || ""),
    })),
    ...(c.ending ? [{ placeName: city }] : []),
  ]);
}

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = R2 금고 = 도시별 폴더(도시 번호-영어 도시명), 조각 이름에 장소 번호·언어 (정본 §)
export function videoFolder(
  cityId: number | null | undefined,
  cityNameEn?: string | null,
): string {
  const slug = String(cityNameEn || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cityId
    ? `videos/${cityId}${slug ? `-${slug}` : ""}`
    : "videos/0-unknown";
}

export const dayVideoKey = (
  folder: string,
  itineraryId: number,
  day: number,
): string => `${folder}/${itineraryId}/day${day}.mp4`;

export function clipKey(
  folder: string,
  itineraryId: number,
  day: number,
  clip: OmniClip,
  lang: string,
): string {
  const places = clip.slots.map((s) => `p${slotPlaceId(s)}`).join("-");
  return `${folder}/${itineraryId}/day${day}/clip${clip.index}-${places}${clip.ending ? "-end" : ""}-${lang}.mp4`;
}

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

export function omniClipRequest(
  clip: OmniClip,
  cast: GhibliCast,
  opts: {
    city: string;
    tripKind?: string;
    lang: string;
    translations: Map<number, PlaceTranslation>;
    root: string;
  },
): { prompt: string; images: { path?: string; url?: string }[] } {
  const people = castLineup(cast);
  const guide = cast.koreanGuide;
  const gHe = guide.gender === "female" ? "she" : "he";
  const langName = videoLangName(opts.lang);
  const ref = (i: number) => `<IMAGE_REF_${i}>`;
  const role = (c: GhibliCharacter) =>
    roleOf(people.indexOf(c), c, opts.tripKind);
  const images: { path?: string; url?: string }[] = people.map((c) => ({
    path: path.join(opts.root, c.assetPath),
  }));
  const placeRef = clip.slots.map((s) => images.push({ url: s.image }) - 1);
  const carShown = clip.slots.map((s) => drives(s) && !isMeal(s));
  const carRef =
    clip.ending || carShown.some(Boolean)
      ? images.push({ path: path.join(opts.root, vehicleAssetPath(cast)) }) - 1
      : -1;
  const kind = TRIP_KIND[opts.tripKind || ""] || "a travel group";
  const extra = Math.max(0, cast.totalTravelerCount - cast.travelers.length);
  const lines = clip.slots.map((s) =>
    placeLine(s, opts.lang, opts.translations.get(slotPlaceId(s))),
  );

  const castLines = people.map(
    (c, i) => `- ${ref(i)} ${role(c)}: ${c.ghibliStylePrompt}`,
  );

  const scenes = clip.slots.map((s, j) => {
    const t0 = j * OMNI_SECONDS_PER_PLACE;
    const t1 = t0 + REVEAL_SECONDS;
    const t2 = t0 + OMNI_SECONDS_PER_PLACE;
    const lead = clip.leads[j];
    const he = lead.gender === "female" ? "she" : "he";
    const reveal = isMeal(s)
      ? "The guide seats everyone around one table and presents the signature dish, steaming and delicious. Medium shot at table height."
      : "The guide walks a step ahead and proudly presents the place's highlight at its most beautiful. Wide shot.";
    const act = lines[j].text
      ? `with one clear, funny, visible action ${he} acts out the joke the guide tells here.`
      : `with one clear, funny, visible action ${he} shows how much ${he} loves this place.`;
    const payoff =
      lead.role === "guide"
        ? "Everyone bursts out laughing."
        : "Everyone bursts out laughing; the guide gives a thumbs-up.";
    return [
      `[${t0}-${t1}s] ${j ? "Cut to " : ""}${s.nameEn || s.name}, ${opts.city} — drawn from the photo ${ref(placeRef[j])}, keeping its layout and landmarks. ${lightAt(s.startTime)}. ${reveal}${carShown[j] ? ` The guide's car ${ref(carRef)} is parked nearby.` : ""}`,
      `[${t1}-${t2}s] Slow push-in on ${role(lead)} (${ref(people.indexOf(lead))}), who steals the scene: ${act} ${payoff}`,
    ].join("\n");
  });

  const endAt = clip.slots.length * OMNI_SECONDS_PER_PLACE;
  const lastSlot = clip.slots[clip.slots.length - 1];
  if (clip.ending)
    scenes.push(
      `[${endAt}-${endAt + OMNI_SECONDS_PER_PLACE}s] ${clip.slots.length ? "Cut to the" : "The"} end of the day: ${lightAt(lastSlot?.endTime || lastSlot?.startTime || "18:30").toLowerCase()} beside the guide's car ${ref(carRef)}. The guide opens the car door for everyone; the whole group turns and waves goodbye to the camera, happy and tired. Only these ${people.length} people are there.`,
    );

  const audio = clip.slots
    .map((_, j) => {
      const line = lines[j];
      if (!line.text) return "";
      const t0 = j * OMNI_SECONDS_PER_PLACE;
      const how =
        line.lang === opts.lang
          ? ""
          : ` (say it in ${langName}, translated naturally, keeping the joke)`;
      return `[${t0}-${t0 + OMNI_SECONDS_PER_PLACE}s]${how} "${line.text}"`;
    })
    .filter(Boolean);
  if (clip.ending)
    audio.push(
      `[${endAt}-${endAt + OMNI_SECONDS_PER_PLACE}s] The guide says a short, warm goodbye in ${langName}.`,
    );
  const voice = guide.ghibliStylePrompt
    .split(",")[0]
    .replace(
      /^Korean (driving )?guide/,
      `a warm, witty Korean ${guide.gender === "female" ? "woman" : "man"}`,
    );

  const prompt = [
    "A wordless animated short: not a single letter, number or symbol appears anywhere in any frame. Signboards, notices, posters, menus, screens and name badges are all plain and blank; whatever the guide says is only heard.",
    "Hand-drawn 2D watercolor animation with a soft paper texture, warm colors and bouncy, expressive cartoon acting — a funny, cozy animated travel film that makes viewers want to visit every place. People and places share this one art style: draw every place from its photo reference in this style, never paste the photo.",
    "",
    `Cast: ${kind} (${cast.totalTravelerCount} travelers) on a guided day trip in ${opts.city} with their local driving guide. Keep each person's face, hairstyle, glasses and outfit exactly as in their reference image:`,
    ...castLines,
    `The guide is the host of the day: ${gHe} always leads the way a step ahead and shows off each place with pride. All ${people.length} stay together and clearly visible, moving naturally.${extra ? ` ${extra} more members of the group stand just behind them.` : ""} Phones stay in pockets. Exactly these ${people.length} people form the group — never add extra family members, children or friends; other diners and passers-by stay small, far in the background.`,
    "",
    `The clip is ${clip.seconds} seconds long.`,
    ...scenes,
    "",
    `Audio — ${cap(voice)}, the guide, tells a joke about each place in ${langName}, like a fun tour guide:`,
    ...audio,
    "Playful acoustic music (ukulele and light percussion) with comedic timing, plus small sound effects on the funny moments. No other speech.",
  ].join("\n");

  return { prompt, images };
}
