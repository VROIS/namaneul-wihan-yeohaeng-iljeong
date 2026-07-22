// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 씬 클립 결합 + Storage 업로드 (지브리 일별 영상 후처리 1벌)
// = ffmpeg concat -c copy(무재인코딩 = 수 초) → 길이 검증 → Supabase Storage itinerary-videos/{itineraryId}/day{N}.mp4 → 공개 URL.
// = 업로드 = ts-client tsPhoto 와 동형 PUT(x-upsert) 패턴. 옛 목업(샘플 URL 반환) = 폐기 2026-07-22 구현계획.

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegPath from "ffmpeg-static";
import { SCENE_SECONDS } from "./ghibli-travel-storyboard";

const execFileAsync = promisify(execFile);

/** 씬 클립들(mp4 Buffer, 씬 순서) → 단일 mp4 결합 → Storage 업로드 → 공개 URL */
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

    // 길이 검증 = 씬수×6초 ±15% (concat 손실 감지. 미달 시 = 재인코딩 방식으로 코드 교체 판단)
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

    // Storage 업로드 (save-raw 와 동일 env 체계)
    const storageKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY;
    const supaPublicUrl =
      process.env.SUPABASE_PUBLIC_URL ||
      "https://wxebceflvuythuodemro.supabase.co";
    if (!storageKey) throw new Error("[stitcher] Storage 키 없음");
    const filePath = `${itineraryId}/day${day}.mp4`;
    const finalBuf = fs.readFileSync(outPath);
    const ur = await fetch(
      `${supaPublicUrl}/storage/v1/object/itinerary-videos/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${storageKey}`,
          "Content-Type": "video/mp4",
          "x-upsert": "true",
        },
        body: finalBuf,
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!ur.ok) throw new Error(`[stitcher] 업로드 실패 ${ur.status}`);
    return `${supaPublicUrl}/storage/v1/object/public/itinerary-videos/${filePath}`;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
