// ⚠️ 수정금지(승인필요) 2026-10-28 사장님 결정 = 장면 첫 화면 그림 = 시나리오 장면 1개 = 그림 1장(가이드 낮 그림 + 장소 실제 사진, 무대 = 7명 공연복), 1인칭 카메라 (정본 큰 일 4)
import fs from "fs";
import path from "path";
import { BTS_CHARACTERS } from "../client/constants/bts-characters";
import { pool } from "../worker/lib/db";
import { geminiImage } from "../worker/lib/services/shared/geminiClient";
import { CHARACTER_FOLDER, keep, latestIn, readScenario } from "./store";

type Ref = { name: string; data: Buffer; mimeType: string };

const character = (suffix: string): Ref => {
  const f = latestIn(CHARACTER_FOLDER, suffix);
  return {
    name: path.basename(f),
    data: fs.readFileSync(f),
    mimeType: "image/jpeg",
  };
};

async function placePhoto(placeId: number): Promise<Ref | null> {
  const r = await pool!.query(
    "SELECT image_url FROM place_seed_raw WHERE id = $1",
    [placeId],
  );
  const url = r.rows[0]?.image_url;
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`[scenes] 장소 사진 ${res.status}: ${url}`);
  return {
    name: url,
    data: Buffer.from(await res.arrayBuffer()),
    mimeType: "image/jpeg",
  };
}

const STYLE =
  "Clean hand-drawn illustration with light watercolor shading, soft paper texture, thin dark-brown ink outlines and warm colors — the same style as the character reference. Vertical 9:16 frame for a short video.";

export async function drawScenes(city: string, only?: string): Promise<void> {
  const sc = readScenario(city);
  const guide = character(`_character_${sc.guide}.jpg`);
  const stage = [
    sc.guide,
    ...BTS_CHARACTERS.map((c) => c.id).filter((id) => id !== sc.guide),
  ].map((id) => character(`_character_${id}_stage.jpg`));
  const CAST: Record<string, { people: Ref[]; who: string }> = {
    guide: {
      people: [guide],
      who: "The FIRST image is the guide: keep his face, glasses, hairstyle, outfit and props exactly as in that image.",
    },
    "guide-stage": {
      people: [stage[0]],
      who: "The FIRST image is the performer: same stage outfit; his face stays hidden in the backlight.",
    },
    seven: {
      people: stage,
      who: `The FIRST image is the guide (he stands at center front); images 2-${stage.length} are the other six members — keep every face, hairstyle and the identical stage outfit exactly.`,
    },
    none: { people: [], who: "" },
  };
  for (const s of sc.scenes.filter((s: any) => !only || String(s.n) === only)) {
    const photo = s.placeId ? await placePhoto(s.placeId) : null;
    const { people, who } = CAST[s.cast];
    const refs = [...people, ...(photo ? [photo] : [])];
    const where = photo
      ? `The LAST image is a real photo of ${s.place}: draw the place from it, keeping its layout and landmarks, in the illustration style (never paste the photo).`
      : "";
    const text = s.sign
      ? "The only text anywhere is the exact words given above."
      : "No text, letters, signs or logos anywhere.";
    const jpg = await geminiImage(
      [
        "A single key frame for an animated short film, shot from the viewer's first-person point of view.",
        s.draw,
        who,
        where,
        STYLE,
        text,
        "No watermark, no signature.",
      ]
        .filter(Boolean)
        .join("\n"),
      {
        references: refs,
        aspectRatio: "9:16",
        imageSize: "2K",
        contextId: "marketing",
        rawTag: `${city}-scene${s.n}`,
      },
    );
    const saved = await keep(
      sc.folder,
      `${city}_scene${s.n}.jpg`,
      jpg,
      "image/jpeg",
    );
    console.log(`✓ ${city} 장면 ${s.n} → ${saved.key} · ${saved.local}`);
  }
}
