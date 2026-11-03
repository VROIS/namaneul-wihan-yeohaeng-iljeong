// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 옴니 시험 도구 = 운영과 같은 대본(제미니 1회, --dry 는 안 부름)·옴니 조각 코드로 하루치를 동시에 만들고 이어 붙임, 조각은 R2 금고 시험 폴더, DB 기록·크레딧 없음 · --birth/--with/--count = 출연진 매트릭스 입력 3개만 바꿔 시험(계산은 운영 castForItinerary 그대로) (정본 2026-11-03)
// 사용: npx tsx --env-file=.env scripts/omni-clips-preview.ts <여정번호> <일차> <저장폴더> [조각번호들 예: 1,2 또는 all] [언어 ko|en|fr|ja|zh|es|de] [--dry] [--birth=YYYY-MM-DD --with=Family --count=4] [--guide=f]
import fs from "fs";
import path from "path";
import { storage } from "../worker/container/lib/storage";
import { pool } from "../worker/container/lib/db";
import { issueApiKey } from "../worker/container/lib/services/shared/issue-api-key";
import { generateSceneClip } from "../worker/container/lib/services/shared/video-gen-client";
import {
  burnTitles,
  concatClips,
} from "../worker/container/lib/services/video-stitcher";
import { uploadToR2 } from "../worker/container/lib/services/shared/r2-client";
import { fileStamp } from "../shared/r2-paths";
import {
  MAX_SCENES,
  castForItinerary,
  normalizeVideoLang,
  omniClips,
  omniClipRequest,
  sceneScriptPrompt,
  clipKey,
  clipTitle,
  type SceneScript,
} from "../worker/container/lib/services/omni-day-clips";
import { scriptScenes } from "../worker/container/lib/services/prompt-check";
import { geminiTextJson } from "../worker/container/lib/services/shared/gemini-text";
import { GHIBLI_CHARACTER_ROSTER_18 } from "../worker/container/lib/services/character-roster-ghibli";
import {
  castFor,
  placeTranslations,
  tripInputs,
  videoCity,
} from "../worker/container/day-scenes";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const flag = (k: string) =>
    args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const [idArg, dayArg, outDir, pick, langArg] = args.filter(
    (a) => !a.startsWith("--"),
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
  const { user, meta } = await tripInputs(itin);
  const matrixCast = flag("birth")
    ? castForItinerary(
        {
          ...meta,
          companionType: flag("with") || meta.companionType,
          companionCount: Number(flag("count")) || meta.companionCount,
        },
        { ...user, birthDate: flag("birth") },
      )
    : await castFor(itin);
  // 2026-11-03 최적값 = --guide=f 는 시험 도구 전용(운영 매트릭스 = 남자 40대 고정)
  const cast =
    flag("guide") === "f"
      ? {
          ...matrixCast,
          koreanGuide: GHIBLI_CHARACTER_ROSTER_18.guide_korean_f_40s,
        }
      : matrixCast;
  const city = await videoCity(itin);
  const translations = await placeTranslations(daySlots, lang);
  const clips = omniClips(daySlots, cast);
  const want =
    pick && pick !== "all"
      ? pick.split(",").map(Number)
      : clips.map((c) => c.index);
  const chosen = clips.filter((c) => want.includes(c.index));

  const clipOpts = {
    city: city.name,
    tripKind: flag("with") || meta.companionType,
    lang,
    startDate: (itin.rawData as any)?.startDate,
    translations,
    root: process.cwd(),
    transport: meta.transport,
  };
  // 장면 대본 = 운영과 같은 제미니 1회 받은 그대로(재요청 없음) → 그 장면 대본이 안 온 조각만 빠짐(generate.ts 와 같은 흐름) · 빈 실행(--dry)은 부르지 않고 대본 칸을 비운 지시문만 저장
  const { scenes, missing } = dry
    ? { scenes: [] as SceneScript[], missing: [] as number[] }
    : await scriptScenes(chosen, async () =>
        geminiTextJson(sceneScriptPrompt(clips, cast, clipOpts), {
          apiKey: await issueApiKey(
            pool,
            "GEMINI_API_KEY",
            null,
            fileStamp().slice(0, 10),
            true,
          ),
          contextId: null,
          rawTag: `omni-preview-script-i${id}-d${day}-${lang}`,
        }),
      );
  const skipped = chosen.filter((c) => {
    if (missing.includes(c.index))
      console.log(`조각 ${c.index} 장면 대본 없음`);
    return missing.includes(c.index);
  });
  // 빈 실행(--dry) = 대본이 없으므로 장소 조각 지시문은 못 만든다 → 대본 요청문 + 배웅 조각만 저장
  if (dry)
    fs.writeFileSync(
      path.join(outDir, `대본요청문_${lang}.txt`),
      sceneScriptPrompt(clips, cast, clipOpts) + "\n",
    );
  const requests = (
    dry
      ? chosen.filter((c) => c.ending)
      : chosen.filter((c) => !skipped.includes(c))
  ).map((clip) => {
    const req = omniClipRequest(
      clip,
      cast,
      scenes.find((s) => Number(s.n) === clip.index),
      clipOpts,
    );
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

  // 2026-11-03 최적값 = 하루 전체일 때 성공 조각만 이어 붙이고 운영과 같은 지명 새김 1벌
  const made = requests.flatMap(({ clip }, i) => {
    const buf = results[i];
    return buf ? [{ clip, buf }] : [];
  });
  if (chosen.length === clips.length && made.length) {
    const { buf, durationSec, starts } = await concatClips(
      made.map((m) => m.buf),
    );
    const titled = await burnTitles(
      buf,
      made.map((m) => clipTitle(m.clip, city.name)),
      starts,
    );
    fs.writeFileSync(path.join(outDir, `완성본_${lang}.mp4`), titled);
    console.log(
      `완성본 저장(지명 새김): ${durationSec.toFixed(1)}초 · 조각 ${made.length}/${clips.length}`,
    );
  }
}

main()
  .catch((e) => console.error("중단:", (e as Error)?.message))
  .finally(async () => {
    await (pool as any)?.end?.();
    process.exit(0);
  });
