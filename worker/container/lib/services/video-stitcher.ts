// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = 씬 클립 결합 + R2 업로드 (지브리 일별 영상 후처리 1벌)

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { uploadToR2 } from "./shared/r2-client";

const execFileAsync = promisify(execFile);
// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "아까처럼 네가 원하는 대로 그 순서로 해" = 지금 코드: ffmpeg = 컨테이너 이미지의 데비안 공식 ffmpeg 1벌(PATH 의 ffmpeg · 지명 새김 drawtext 포함) (정본 2026-11-01)
const FFMPEG = "ffmpeg";

async function durationOf(file: string): Promise<number> {
  const info = await execFileAsync(FFMPEG, ["-i", file]).catch(
    (e) => e, // ffmpeg -i 는 출력파일 미지정으로 exit 1 = stderr 에 Duration 있음
  );
  const m = String(info.stderr || "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 조각 잇기 1벌 = 운영 업로드와 옴니 시험 도구가 같이 쓴다 (정본 §)
export async function concatClips(
  clips: Buffer[],
): Promise<{ buf: Buffer; durationSec: number; starts: number[] }> {
  if (!clips.length) throw new Error("[stitcher] 클립 없음");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "clips-"));
  try {
    const files = clips.map((buf, i) => {
      const p = path.join(work, `scene${i}.mp4`);
      fs.writeFileSync(p, buf);
      return p;
    });
    const starts: number[] = [];
    let at = 0;
    for (const f of files) {
      starts.push(at);
      at += await durationOf(f);
    }
    const listPath = path.join(work, "list.txt");
    fs.writeFileSync(
      listPath,
      files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"),
    );
    const outPath = path.join(work, "final.mp4");
    await execFileAsync(FFMPEG, [
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
    return {
      buf: fs.readFileSync(outPath),
      durationSec: await durationOf(outPath),
      starts,
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "두 줄 지명 괜찮아" · "50% 해야겠다" · "마지막에 떠 있는 것을 조금 더" = 지금 코드: 지명 타이포그래피 = Cousine Bold · 위 줄 지명(최대 86, 한 줄 안에 들어가게 축소) · 아래 줄 시각(52) · 왼쪽 위 · 타자기 초당 8글자 · 다 찍힌 뒤 4초 · 장면 10초 안에서 끝 (값 = 1080x1920 기준) (정본 2026-11-01)
const TITLE = {
  size: 86,
  timeSize: 52,
  x: 66,
  y: 230,
  cps: 8,
  start: 0.4,
  hold: 4,
  fade: 0.4,
  maxEnd: 9.6,
};
const FONT = () => path.join(process.cwd(), "assets/fonts/Cousine-Bold.ttf");
// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "360으로 가자. 전부 다 통일 … 옴니가 나오는 게 360이니까" = 지금 코드: 완성본 = 옴니 그대로 360x640 (지명 값은 1080 기준을 비율로 줄여 그린다) (정본 2026-11-01)
const OUT_W = 360;

export interface ClipTitle {
  name: string;
  time?: string;
}

function titleFilter(
  work: string,
  titles: ClipTitle[],
  starts: number[],
): string {
  const k = OUT_W / 1080;
  const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  const fit = (n: number) =>
    Math.min(TITLE.size, Math.floor((1080 - 2 * TITLE.x) / ((n + 1) * 0.6)));
  const fade = (end: number) =>
    `if(gt(t\\,${(end - TITLE.fade).toFixed(3)})\\,(${end.toFixed(3)}-t)/${TITLE.fade}\\,1)`;
  const parts = [
    `scale=${OUT_W}:${Math.round((OUT_W * 16) / 9)}:flags=lanczos,setsar=1`,
  ];
  const draw = (
    file: string,
    x: number,
    y: number,
    size: number,
    a: number,
    b: number,
    end: number,
    extra = "",
  ) =>
    parts.push(
      `drawtext=fontfile='${esc(FONT())}':textfile='${esc(file)}':fontsize=${(size * k).toFixed(1)}:fontcolor=white:borderw=${(3 * k).toFixed(1)}:bordercolor=black@0.45:shadowcolor=black@0.75:shadowx=2:shadowy=2:x=${(x * k).toFixed(1)}:y=${(y * k).toFixed(1)}:alpha='${fade(end)}':enable='between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})${extra}'`,
    );
  titles.forEach((t, ti) => {
    const nameSize = fit(t.name.length);
    const lines = [
      { text: t.name, size: nameSize, y: TITLE.y },
      ...(t.time
        ? [
            {
              text: t.time,
              size: Math.min(nameSize, TITLE.timeSize),
              y: TITLE.y + nameSize * 1.2,
            },
          ]
        : []),
    ];
    const total = lines.reduce((n, l) => n + l.text.length, 0);
    const s0 = starts[ti] + TITLE.start;
    const typed = s0 + total / TITLE.cps;
    const end = Math.min(
      typed + TITLE.hold + TITLE.fade,
      starts[ti] + TITLE.maxEnd,
    );
    let done = 0;
    lines.forEach((line, li) => {
      for (let c = 1; c <= line.text.length; c++) {
        const typing = c < line.text.length;
        const f = path.join(work, `t${ti}_${li}_${c}.txt`);
        fs.writeFileSync(f, line.text.slice(0, c) + (typing ? "|" : ""));
        const a = s0 + (done + c) / TITLE.cps;
        draw(
          f,
          TITLE.x,
          line.y,
          line.size,
          a,
          typing ? s0 + (done + c + 1) / TITLE.cps - 0.001 : end,
          end,
        );
      }
      done += line.text.length;
      if (li === lines.length - 1) {
        const cur = path.join(work, `t${ti}_cur.txt`);
        fs.writeFileSync(cur, "|");
        draw(
          cur,
          TITLE.x + line.text.length * line.size * 0.6,
          line.y,
          line.size,
          typed,
          end,
          end,
          `*lt(mod(t-${typed.toFixed(3)}\\,0.8)\\,0.4)`,
        );
      }
    });
  });
  return parts.join(",\n");
}

export async function burnTitles(
  video: Buffer,
  titles: ClipTitle[],
  starts: number[],
): Promise<Buffer> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "titles-"));
  try {
    const inPath = path.join(work, "in.mp4");
    const outPath = path.join(work, "out.mp4");
    const script = path.join(work, "filter.txt");
    fs.writeFileSync(inPath, video);
    fs.writeFileSync(script, titleFilter(work, titles, starts));
    await execFileAsync(
      FFMPEG,
      [
        "-y",
        "-i",
        inPath,
        "-filter_script:v",
        script,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ⚠️ 수정금지(승인필요) 2026-11-01 사장님 지시 "유리카드처럼 생긴 그거 다 삭제하고 이거를 정본으로" = 지금 코드: 완성본 = 조각 길이 합으로 검사 → 조각마다 실제 길이로 지명 새김 → 도시별 폴더 주소에 저장 (정본 2026-11-01)
export async function stitchAndUpload(
  clips: Buffer[],
  key: string,
  expectedSec: number,
  titles: ClipTitle[],
): Promise<string> {
  const { buf, durationSec, starts } = await concatClips(clips);
  if (durationSec < expectedSec * 0.85)
    throw new Error(
      `[stitcher] 결합 길이 이상: ${durationSec}s (기대 ${expectedSec}s)`,
    );
  const up = await uploadToR2(
    key,
    await burnTitles(buf, titles, starts),
    "video/mp4",
  );
  return up.publicUrl;
}
