// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "아까처럼 네가 원하는 대로 그 순서로 해" = 지금 코드: 이미지 굽기 때 리눅스 안에서 운영 이어 붙이기·지명 새기기를 시험 영상 2조각으로 실제로 돌린다 · 실패하면 빌드 실패(고장 난 이미지는 올라가지 않음) (정본 2026-11-01)
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { burnTitles, concatClips } from "./lib/services/video-stitcher";

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "selftest-"));
  const clip = (i: number) => {
    const out = path.join(work, `c${i}.mp4`);
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=360x640:rate=24:duration=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=10",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      out,
    ]);
    return fs.readFileSync(out);
  };
  const { buf, durationSec, starts } = await concatClips([clip(1), clip(2)]);
  const out = await burnTitles(
    buf,
    [
      { name: "Cathédrale Notre-Dame-de-Strasbourg", time: "4:21 PM" },
      { name: "Strasbourg" },
    ],
    starts,
  );
  fs.rmSync(work, { recursive: true, force: true });
  if (durationSec < 19 || out.length < 10000)
    throw new Error(`길이 ${durationSec}초 · 크기 ${out.length}`);
  console.log(
    `[selftest] 리눅스 지명 새기기 성공 = ${durationSec.toFixed(1)}초 · ${out.length}바이트`,
  );
}

main().catch((e) => {
  console.error(
    "[selftest] 실패:",
    String((e as any)?.stderr || (e as Error)?.message || e).slice(-1500),
  );
  process.exit(1);
});
