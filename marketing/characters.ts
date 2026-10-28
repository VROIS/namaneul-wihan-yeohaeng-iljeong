// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = BTS 캐릭터 7명 = 낮 가이드 차림(캐릭터 1명 = 소품 1개) + 7명 똑같은 공연복(흰 배경) + 앱 카드판(같은 그림에 성격 배경 · 아래 어둡게) → 앱 그림 교체 = 896x1200 png·webp 저장소 + R2 한 묶음 (정본 큰 일 4)
import fs from "fs";
import sharp from "sharp";
import { appAssetKey } from "../shared/r2-paths";
import { uploadToR2 } from "../worker/lib/services/shared/r2-client";
import { BTS_CHARACTERS } from "../client/constants/bts-characters";
import { geminiImage } from "../worker/lib/services/shared/geminiClient";
import { CHARACTER_FOLDER, keep, latestIn } from "./store";

const APP_DIR = "assets/images/bts-characters";
const APP_SIZE = { width: 896, height: 1200 };
const personRef = (id: string) =>
  latestIn(CHARACTER_FOLDER, `_character_${id}.jpg`);

const PROPS: Record<string, string> = {
  collector:
    "holds a well-worn art museum guidebook open in one hand, a canvas tote bag on the shoulder; no camera",
  romanticist:
    "holds a vintage film camera at chest height, about to take a picture; the only camera in the picture",
  explorer:
    "holds a smartphone up with both hands, taking a photo with the phone camera; no other camera",
  challenger:
    "wears a hiking backpack and holds one trekking pole in each hand; nothing else in the hands",
  companion:
    "holds two takeaway drinks and offers one forward to the viewer with a warm smile",
  recharger: "carries a fishing rod over one shoulder and wears a straw hat",
  chiller:
    "wears headphones around the neck and holds an iced americano in a clear cup",
};

const CARD_BG: Record<string, string> = {
  collector:
    "a quiet, bright modern art gallery with a few paintings on white walls",
  romanticist: "a warm evening cobblestone alley with glowing street lamps",
  explorer: "a colorful street-art mural alley in daylight",
  challenger: "a mountain trail at sunrise with soft mist",
  companion: "a cozy cafe terrace with plants and soft afternoon light",
  recharger: "a calm lakeside wooden dock at golden hour",
  chiller: "a minimalist sunlit room with a record player and green plants",
};

const STAGE_OUTFIT =
  "the group's matching concert stage outfit: tailored black jacket with fine silver embroidery and a sparkling silver shoulder chain, crisp white shirt, slim black trousers, polished black boots, a thin clear in-ear monitor wire behind one ear; exactly the same outfit as every other member";

const COMMON = [
  "Face: keep his face exactly as in the reference image — same face shape, eyes, eyebrows, nose, lips, jawline and adult proportions. Do not make the face rounder, cuter or younger.",
  "Keep the same drawing of the face as the reference (sharp, handsome, idol-like adult features). Render the whole figure as a clean hand-drawn illustration with light watercolor shading, soft paper texture, thin dark-brown ink outlines and gentle warm colors.",
  "Full body, standing, facing the viewer, centered with margin around the figure.",
  "Remove every brand logo, letter and printed word from clothes, hats, bags and shoes.",
  "Pure plain white background. No scenery, no other people, no text, no letters, no logos, no watermark, no signature.",
];

const dayPrompt = (persona: string, props: string) =>
  [
    "Redraw the young man from the reference image as a new character illustration.",
    "Keep his hairstyle, hair color and the overall feel of his outfit.",
    `He is a friendly local day-trip guide; personality: ${persona}.`,
    `Props: he ${props}. Do not add any other props.`,
    ...COMMON,
  ].join("\n");

const stagePrompt = () =>
  [
    "Draw the same young man from the reference image, same face and hairstyle, now changed into his concert stage outfit.",
    `Outfit: ${STAGE_OUTFIT}.`,
    "Confident star pose, one hand raised to the crowd, a slim handheld stage microphone in the other hand.",
    ...COMMON,
  ].join("\n");

const ref = (name: string, mimeType: string) => ({
  name,
  data: fs.readFileSync(name),
  mimeType,
});

async function draw(
  id: string,
  kind: "day" | "stage" | "card",
  prompt: string,
  person: { name: string; data: Buffer; mimeType: string },
): Promise<Buffer> {
  const jpg = await geminiImage(prompt, {
    references: [person],
    aspectRatio: "3:4",
    imageSize: "2K",
    contextId: "marketing",
    rawTag: `character-${id}-${kind}`,
  });
  const name =
    kind === "day" ? `character_${id}.jpg` : `character_${id}_${kind}.jpg`;
  const saved = await keep(CHARACTER_FOLDER, name, jpg, "image/jpeg");
  console.log(`✓ ${id} ${kind} → ${saved.key} · ${saved.local}`);
  return jpg;
}

export async function drawCharacters(only?: string): Promise<void> {
  for (const c of BTS_CHARACTERS.filter((c) => !only || c.id === only)) {
    const day = await draw(
      c.id,
      "day",
      dayPrompt(`${c.archetypeEn} — ${c.tags.join(" ")}`, PROPS[c.id]),
      ref(personRef(c.id), "image/jpeg"),
    );
    await draw(c.id, "stage", stagePrompt(), {
      name: `character_${c.id}.jpg`,
      data: day,
      mimeType: "image/jpeg",
    });
  }
}

const cardPrompt = (bg: string) =>
  [
    "Keep the character from the reference image exactly as drawn — same face, hair, outfit, props, pose, size and position. Do not redraw or change him.",
    `Replace only the plain white background with a soft hand-drawn watercolor background: ${bg}. Keep the background gentle and slightly out of focus so he stands out.`,
    "The bottom quarter of the picture gradually darkens to a deep shadow so white text placed there is easy to read.",
    "No text, letters, logos, watermark or signature anywhere.",
  ].join("\n");

export async function drawAppCards(only?: string): Promise<void> {
  for (const c of BTS_CHARACTERS.filter((c) => !only || c.id === only)) {
    const day = latestIn(CHARACTER_FOLDER, `_character_${c.id}.jpg`);
    await draw(c.id, "card", cardPrompt(CARD_BG[c.id]), {
      name: day,
      data: fs.readFileSync(day),
      mimeType: "image/jpeg",
    });
  }
}

export async function installAppCards(): Promise<void> {
  const key = appAssetKey("bts-characters");
  for (const c of BTS_CHARACTERS) {
    const card = sharp(
      latestIn(CHARACTER_FOLDER, `_character_${c.id}_card.jpg`),
    ).resize(APP_SIZE.width, APP_SIZE.height, { fit: "cover" });
    const png = await card.clone().png().toBuffer();
    const webp = await card.clone().webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(`${APP_DIR}/bts_${c.id}.png`, png);
    fs.writeFileSync(`${APP_DIR}/bts_${c.id}.webp`, webp);
    await uploadToR2(`${key}/bts_${c.id}.webp`, webp, "image/webp");
    console.log(
      `✓ ${c.id} → ${APP_DIR}/bts_${c.id}.png·webp · R2 ${key}/bts_${c.id}.webp`,
    );
  }
  console.log(`R2 묶음 = ${key}`);
}
