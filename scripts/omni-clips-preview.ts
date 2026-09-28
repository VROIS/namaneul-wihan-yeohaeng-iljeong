// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 옴니 시험 도구 = 운영과 같은 옴니 조각 코드로 하루치를 동시에 만들고 이어 붙임, 조각은 R2 금고 시험 폴더에 보관, DB 기록·크레딧 없음 (정본 §)
// 사용: npx tsx --env-file=.env scripts/omni-clips-preview.ts <여정번호> <일차> <저장폴더> [조각번호들 예: 1,2 또는 all] [언어 ko|en|fr|ja|zh|es|de] [--dry]
import fs from "fs";
import path from "path";
import { storage } from "../worker/container/lib/storage";
import { pool } from "../worker/container/lib/db";
import { issueApiKey } from "../worker/container/lib/services/shared/issue-api-key";
import { generateSceneClip } from "../worker/container/lib/services/shared/video-gen-client";
import { concatClips } from "../worker/container/lib/services/video-stitcher";
import { uploadToR2 } from "../worker/container/lib/services/shared/r2-client";
import { fileStamp } from "../shared/r2-paths";
import {
  MAX_SCENES,
  normalizeVideoLang,
  omniClips,
  omniClipRequest,
  clipKey,
} from "../worker/container/lib/services/omni-day-clips";
import {
  castFor,
  placeTranslations,
  tripInputs,
  videoCity,
} from "../worker/container/day-scenes";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [idArg, dayArg, outDir, pick, langArg] = args.filter(
    (a) => a !== "--dry",
  );
  const id = Number(idArg);
  const day = Number(dayArg);
  if (!id || !day || !outDir)
    throw new Error(
      "사용: <여정번호> <일차> <저장폴더> [조각번호들|all] [언어] [--dry]",
    );
  const lang = normalizeVideoLang(langArg);
  fs.mkdirSync(outDir, { recursive: true });

  const itin = await storage.getItinerary(id);
  const slots: any[] | undefined = (itin?.rawData as any)?.days?.[day - 1]
    ?.places;
  if (!itin || !slots?.length)
    throw new Error(`여정 ${id} ${day}일차 슬롯 없음`);
  const daySlots = slots.slice(0, MAX_SCENES);
  const cast = await castFor(itin);
  const { meta } = await tripInputs(itin);
  const city = await videoCity(itin);
  const translations = await placeTranslations(daySlots, lang);
  const clips = omniClips(daySlots, cast);
  const want =
    pick && pick !== "all"
      ? pick.split(",").map(Number)
      : clips.map((c) => c.index);
  const chosen = clips.filter((c) => want.includes(c.index));

  const requests = chosen.map((clip) => {
    const req = omniClipRequest(clip, cast, {
      city: city.name,
      tripKind: meta.companionType,
      lang,
      translations,
      root: process.cwd(),
    });
    const name = `조각${clip.index}_${lang}`;
    fs.writeFileSync(
      path.join(outDir, `${name}_지시문.txt`),
      `${req.prompt}\n\n=== 그림 순서 ===\n${req.images
        .map((im, i) => `<IMAGE_REF_${i}> ${im.path || im.url}`)
        .join("\n")}\n`,
    );
    console.log(
      `조각 ${clip.index} 지시문 저장 (${clip.slots.length}곳${clip.ending ? " + 배웅" : ""}, ${clip.seconds}초, 그림 ${req.images.length}장)`,
    );
    return { clip, req, name };
  });
  if (dry) return;

  const stamp = fileStamp();
  const vault = `${city.folder}/tests`;
  const apiKey = await issueApiKey(
    pool,
    "GEMINI_API_KEY",
    null,
    stamp.slice(0, 10),
    true,
  );
  const start = Date.now();
  const results = await Promise.all(
    requests.map(async ({ clip, req, name }) => {
      const t0 = Date.now();
      try {
        const buf = await generateSceneClip(req.prompt, {
          apiKey,
          referenceImages: req.images,
          aspectRatio: "9:16",
          seconds: clip.seconds,
          contextId: null,
          rawTag: `omni-preview-i${id}-d${day}-c${clip.index}-${lang}`,
        });
        fs.writeFileSync(path.join(outDir, `${name}.mp4`), buf);
        const key = clipKey(vault, day, stamp, clip, lang);
        await uploadToR2(key, buf, "video/mp4");
        console.log(
          `조각 ${clip.index} 완료: ${Math.round((Date.now() - t0) / 1000)}초 → R2 ${key}`,
        );
        return buf;
      } catch (e) {
        console.log(`조각 ${clip.index} 실패: ${(e as Error)?.message}`);
        return null;
      }
    }),
  );
  console.log(
    `전체(동시 ${requests.length}개): ${Math.round((Date.now() - start) / 1000)}초`,
  );

  if (chosen.length === clips.length && results.every(Boolean)) {
    const { buf, durationSec } = await concatClips(results as Buffer[]);
    fs.writeFileSync(path.join(outDir, `완성본_${lang}.mp4`), buf);
    console.log(`완성본 저장: ${durationSec.toFixed(1)}초`);
  }
}

main()
  .catch((e) => console.error("중단:", (e as Error)?.message))
  .finally(async () => {
    await (pool as any)?.end?.();
    process.exit(0);
  });
