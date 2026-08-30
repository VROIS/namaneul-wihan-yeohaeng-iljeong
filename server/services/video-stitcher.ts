// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 씬 클립 결합 + R2 업로드 (지브리 일별 영상 후처리 1벌)

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";
import { SCENE_SECONDS } from "./ghibli-travel-storyboard";
import { uploadToR2 } from "./shared/r2-client";

const execFileAsync = promisify(execFile);

export async function stitchAndUpload(
  clips: Buffer[],
  itineraryId: number,
  day: number,
): Promise<string> {
  if (!clips.length) throw new Error("[stitcher] 클립 없음");
  const work = fs.mkdtempSync(
    path.join(os.tmpdir(), `ghibli-${itineraryId}-d${day}-`),
  );
  try {
    const files = clips.map((buf, i) => {
      const p = path.join(work, `scene${i}.mp4`);
      fs.writeFileSync(p, buf);
      return p;
    });
    const listPath = path.join(work, "list.txt");
    fs.writeFileSync(
      listPath,
      files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"),
    );
    const outPath = path.join(work, "final.mp4");
    await execFileAsync(ffmpegPath as unknown as string, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ]);

    const info = await execFileAsync(ffmpegPath as unknown as string, [
      "-i",
      outPath,
    ]).catch(
      (e) => e, // ffmpeg -i 는 출력파일 미지정으로 exit 1 = stderr 에 Duration 있음
    );
    const m = String(info.stderr || "").match(
      /Duration: (\d+):(\d+):(\d+\.\d+)/,
    );
    const durationSec = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
    const expected = clips.length * SCENE_SECONDS;
    if (durationSec < expected * 0.85)
      throw new Error(
        `[stitcher] 결합 길이 이상: ${durationSec}s (기대 ${expected}s)`,
      );

    const finalBuf = fs.readFileSync(outPath);
    const up = await uploadToR2(
      `itinerary-videos/${itineraryId}/day${day}.mp4`,
      finalBuf,
      "video/mp4",
    );
    return up.publicUrl;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
