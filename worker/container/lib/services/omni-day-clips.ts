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

// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "1번하고 2번만 하고 통과하고 나한테 얘기해" = 지금 코드: 역할 = 아이·10대 먼저(아들·딸) → 대가족에서 본인보다 윗 나이대(할아버지·할머니) → 남은 어른 앞 2명(아버지·어머니) · 나머지 어른(다 큰 아들·딸) (정본 2026-11-01)
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

const DECADE: Record<string, string> = {
  "2": "twenties",
  "3": "thirties",
  "4": "forties",
  "5": "fifties",
  "6": "sixties",
};
function ageOf(c: GhibliCharacter): string {
  if (c.ageGroup === "kids") return "child height";
  if (c.ageGroup === "teen") return "teenager, nearly adult height";
  const d = c.id.match(/(\d)0s/)?.[1];
  return `adult ${c.gender === "female" ? "woman in her" : "man in his"} ${d ? DECADE[d] : "forties"}`;
}

const andList = (xs: string[]): string =>
  xs.length > 1
    ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`
    : xs[0] || "";

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

// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "그 식당의 대표적인 음식과 음료수를 푸짐하게 먹는다 … 마시고 먹는다" = 지금 코드: 장면 대본 요청문 = Flow 대본 도구 형식(장소마다 10초 한 컷 · 전경 · 주인공 동작 1개 = 이름 없는 동사구 · 카메라 1개 · 소리 · 가이드 한 줄 + 반응 한 줄) · 사람 = 로마자 이름(역할) · 식사 = 다 같이 한 테이블에서 그 집 대표 음식·음료를 푸짐하게 먹고 마심 (정본 2026-11-01)
export function sceneScriptPrompt(
  clips: OmniClip[],
  cast: GhibliCast,
  opts: ClipOpts,
): string {
  const people = castLineup(cast);
  const langName = videoLangName(opts.lang);
  const label = (c: GhibliCharacter) =>
    `${c.nameEn} (${roleOf(c, people, opts.tripKind).replace(/^the /, "")})`;
  const places = clips.filter((c) => !c.ending);
  return [
    `You write scene scripts for a vertical 9:16 travel film in ${opts.city}, ${season(opts.startDate)}.`,
    `Exactly ${places.length} scenes, one per place in this order. Each scene = ONE continuous 10-second shot (no cuts).`,
    `Cast (exactly these people, every scene): ${people.map((c) => `${label(c)}, ${ageOf(c)}`).join("; ")}. ${cast.koreanGuide.nameEn} is the local driving guide who presents each place.`,
    "For each scene write:",
    "- foreground: what is in the sharp foreground, fitting the season and the place (flowers, leaves, steam, lanterns...), one short phrase",
    `- action: the given LEAD doing ONE clear, funny, visible action that fits the place, written as a verb phrase WITHOUT the lead's name (e.g. "spins around like a ballerina in the narrow alley"); anyone else is named only by their name`,
    `- camera: exactly one of ${CAMERAS.map((c) => `"${c}"`).join(", ")}`,
    "- sfx: one line of place sounds",
    `- guideLine: the guide's line in ${langName}, 15-25 characters, a warm witty one-liner drawn from the place summary; no numbers, no English words`,
    `- reaction: the LEAD's short ${langName} reaction, under 15 characters, no numbers, no English words (if the lead is the guide, the reaction comes from ${cast.travelers[0].nameEn} instead)`,
    "Never have anyone read, point at or hold any sign, menu, phone or text. Meal places: everyone eats and drinks this place's signature food and drinks heartily together at one table.",
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

const STYLE =
  "STYLE: Premium cinematic travel film. The ENVIRONMENT is fully photorealistic like a high-end travel reel: sharp seasonal foreground, natural light, shallow depth of field, one rich warm color grade. The PEOPLE are high-end 3D animated film characters (Pixar-like, soft stylized faces, expressive acting, talking) - every person in every frame is rendered exactly like their 3D reference image, never as a photoreal human. Characters interact with each other, not the camera. Uncropped full frame, textless: no letters, blank signboards, no speech bubbles, no captions, no letterboxing.";

// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "그 식당의 대표적인 음식과 음료수를 푸짐하게 먹는다 … 마시고 먹는다" = 지금 코드: 옴니 지시문 = 사람마다 참고 그림 번호 + 이름 + 역할 + 나이 + 3D 그림 그대로의 겉모습 + 겹치지 않는 옷 표시 · 정확한 인원 · 키 규칙 · 자리 배치(식사 = 다 같이 한 테이블에서 그 집 대표 음식·음료를 푸짐하게 먹고 마심) · 동작·대사 = 이름 + 그림 번호로 묶음 · 글자 금지 2번 · 배웅 = 가이드 혼자 말함 (정본 2026-11-01)
export function omniClipRequest(
  clip: OmniClip,
  cast: GhibliCast,
  scene: SceneScript | undefined,
  opts: ClipOpts,
): { prompt: string; images: { path?: string; url?: string }[] } {
  const people = castLineup(cast);
  const langName = videoLangName(opts.lang);
  const ref = (i: number) => `<IMAGE_REF_${i}>`;
  const guide = cast.koreanGuide;
  const g = people.length - 1;
  const gHis = guide.gender === "female" ? "her" : "his";
  const guests = cast.travelers;
  const extra = Math.max(0, cast.totalTravelerCount - guests.length);
  const total = people.length + extra;
  const bind = (c: GhibliCharacter) =>
    `${c.nameEn} ${ref(people.indexOf(c))} (${c.anchor})`;
  const guestNames = andList(guests.map((c) => c.nameEn));
  const images: { path?: string; url?: string }[] = people.map((c) => ({
    path: path.join(opts.root, c.assetPath),
  }));
  const s = clip.slots[0];
  const ending = clip.ending || !s;
  let placeRef = "";
  if (!ending && s.image) {
    placeRef = ` ${ref(images.length)} is the real place: use it only for layout and landmarks; it never changes how the people look.`;
    images.push({ url: s.image });
  }
  const withCar = ending || (drives(s) && !isMeal(s) && !isIndoor(s));
  const carRef = withCar
    ? images.push({ path: path.join(opts.root, vehicleAssetPath(cast)) }) - 1
    : -1;

  const young = (group: string) =>
    people.filter((c) => c.ageGroup === group).map((c) => c.nameEn);
  const kids = young("kids");
  const teens = young("teen");
  const heightRule =
    kids.length || teens.length
      ? `${[
          kids.length
            ? `${andList(kids)} ${kids.length > 1 ? "are children" : "is a child"}, head-and-shoulders shorter than the adults`
            : "",
          teens.length
            ? `${andList(teens)} ${teens.length > 1 ? "are teenagers" : "is a teenager"}, nearly adult height`
            : "",
        ]
          .filter(Boolean)
          .join("; ")}; everyone else is a full-grown adult of adult height.`
      : `${total > 2 ? `All ${total}` : "Both"} are full-grown adults of adult height; nobody is a child.`;
  const extraRule = extra
    ? ` ${extra} extra guest${extra > 1 ? "s" : ""} with no reference image ${extra > 1 ? "stay" : "stays"} behind the referenced people and never ${extra > 1 ? "take" : "takes"} their faces or clothes.`
    : "";
  const castBlock = [
    `CAST: exactly ${total} people${ending ? ", all visible for the whole shot" : ""} — ${guests.length + extra} guest${guests.length + extra > 1 ? "s" : ""} and the guide. One reference image per person; each image fixes that person's face, hair, outfit and height; hands free, no phones:`,
    ...guests.map(
      (c, i) =>
        `- ${ref(i)} ${c.nameEn}, ${roleOf(c, people, opts.tripKind)} (${ageOf(c)}): ${c.ghibliStylePrompt}; the only one in ${c.anchor}.`,
    ),
    `- ${ref(g)} ${guide.nameEn}, the guide (${ageOf(guide)}): ${guide.ghibliStylePrompt}; the only one in ${guide.anchor}, always in ${gHis} own outfit, never a shop worker.`,
    `${heightRule}${extraRule}`,
  ];
  const dialogue = `DIALOGUE in ${langName} only, heard, never written on screen; ${ending ? "only the guide speaks" : "each line spoken only by its named speaker"}, with matching lips. No letters anywhere: blank signs, no captions, no subtitles; nobody reads, points at or holds any sign, menu or phone.`;

  if (ending) {
    const prompt = [
      STYLE.replace(" not the camera.", " and wave to the camera at the end."),
      ...castBlock,
      `No other people near the camera. ${ref(carRef)} is the guide's car, parked at the curb, blank license plate.`,
      "",
      `SCENE: A continuous ten-second vertical 9:16 shot. End of the day in ${opts.city}, ${lightAt("19:00").toLowerCase()}, beside the car.`,
      `BLOCKING: ${people.length > 1 ? `all ${people.length} stand in one row beside the car, clearly separated, every face visible: ${bind(guide)} at the open rear door on the far left, ${guestNames} in a row to ${gHis} right${extra ? ", the extra guests behind them" : ""}` : `${bind(guide)} at the open rear door`}. ${guide.nameEn} speaks, then everyone turns and waves goodbye to the camera, happy and tired.`,
      "CAMERA: slow pull back.",
      "SFX: soft evening city ambience and a car door opening.",
      dialogue,
      `${bind(guide)}: "${FAREWELL[opts.lang] || FAREWELL.en}"`,
    ].join("\n");
    return { prompt, images };
  }

  const lead = clip.lead;
  const reactor = lead.role === "guide" ? guests[0] : lead;
  const camera =
    scene && CAMERAS.includes(scene.camera) ? scene.camera : CAMERAS[0];
  const action = (scene?.action || "smiles and looks around the place")
    .trim()
    .replace(new RegExp(`^(the\\s+)?${lead.nameEn}\\b[\\s,]*`, "i"), "")
    .replace(/^./, (ch) => ch.toLowerCase());
  const blocking = isMeal(s)
    ? `All ${total} eat and drink this place's signature food and drinks heartily together at one table, each in their own chair, every face visible; ${bind(guide)} at the head; ${guestNames} along the sides.`
    : `${bind(guide)} stands front-right presenting the place; ${guestNames} ${guests.length > 1 ? "stand side by side" : "stands"} to ${gHis} left, clearly separated, every face visible, nobody overlapping or merging.`;
  const prompt = [
    STYLE,
    ...castBlock,
    `No other people near the camera; passers-by tiny and blurred.${placeRef}${carRef >= 0 ? ` ${ref(carRef)} is the guide's car parked nearby, blank license plate.` : ""}`,
    "",
    `SCENE: A continuous ten-second vertical 9:16 shot. ${placeName(s)}, ${opts.city}, ${lightAt(s.startTime).toLowerCase()}; ${scene?.foreground || "seasonal details"} sharp in the foreground.`,
    `BLOCKING: ${blocking}`,
    `ACTION: ${bind(lead)} ${action}`,
    `CAMERA: ${camera}.`,
    `SFX: ${scene?.sfx || "the natural sounds of the place"}`,
    dialogue,
    `${bind(guide)}: "${scene?.guideLine || ""}"`,
    `${bind(reactor)}: "${scene?.reaction || ""}"`,
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
