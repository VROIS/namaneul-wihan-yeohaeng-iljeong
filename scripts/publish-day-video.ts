// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 완성본 게시 도구 = 운영과 같은 기록·게시 코드로 R2 도시 폴더 저장 + 일차 기록(영어 장소명 카드) + 프로필 게시, 크레딧 없음 (정본 §)
// 사용: npx tsx --env-file=.env scripts/publish-day-video.ts <여정번호> <일차> <영상파일> [--dry]
import fs from "fs";
import { storage } from "../worker/container/lib/storage";
import { pool } from "../worker/container/lib/db";
import {
  MAX_SCENES,
  omniClips,
  omniSceneCards,
  dayVideoKey,
} from "../worker/container/lib/services/omni-day-clips";
import {
  castFor,
  publishToProfile,
  setDayVideo,
  videoCity,
} from "../worker/container/day-scenes";
import { uploadToR2 } from "../worker/container/lib/services/shared/r2-client";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [idArg, dayArg, file] = args.filter((a) => a !== "--dry");
  const id = Number(idArg);
  const day = Number(dayArg);
  if (!id || !day || !file || !fs.existsSync(file))
    throw new Error("사용: <여정번호> <일차> <영상파일> [--dry]");

  const itin = await storage.getItinerary(id);
  const slots: any[] | undefined = (itin?.rawData as any)?.days?.[day - 1]
    ?.places;
  if (!itin || !slots?.length)
    throw new Error(`여정 ${id} ${day}일차 슬롯 없음`);
  const daySlots = slots.slice(0, MAX_SCENES);
  const cast = await castFor(itin);
  const city = await videoCity(itin);
  const scenes = omniSceneCards(omniClips(daySlots, cast), city.name);
  const buf = fs.readFileSync(file);
  const key = dayVideoKey(city.folder, id, day);

  console.log(
    `여정 ${id} ${day}일차 | 영상 ${(buf.length / 1e6).toFixed(1)}MB → ${key} | 게시 계정 ${itin.userId}`,
  );
  scenes.forEach((s, i) =>
    console.log(`  카드 ${i + 1}/${scenes.length}: ${s.placeName}`),
  );
  if (dry) return;

  const up = await uploadToR2(key, buf, "video/mp4");
  await setDayVideo(id, day, {
    status: "succeeded",
    url: up.publicUrl,
    taskId: `omni-manual-i${id}-d${day}`,
    scenesDone: scenes.length,
    totalScenes: scenes.length,
    scenes,
  });
  await publishToProfile(itin.userId, id, day);
  console.log(`게시 완료: ${up.publicUrl}`);
}

main()
  .catch((e) => console.error("중단:", (e as Error)?.message))
  .finally(async () => {
    await (pool as any)?.end?.();
    process.exit(0);
  });
