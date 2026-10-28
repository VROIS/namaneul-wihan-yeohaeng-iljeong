// ⚠️ 수정금지(승인필요) 2026-10-28 사장님 결정 = 홍보 숏폼 묶기 = 결말 미리보기 → 흰 섬광 → 오프닝 카드 → 장면(컷 길이로 자름) → 엔딩 카드 → 끝 카드, 1080x1920 24fps · 영어 자막 60~70% 높이 가운데 · 무대 BTS 글자 · 15MB 안 (정본 큰 일 4)
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { keep, latestIn, readScenario } from "./store";

import FFMPEG_PATH from "ffmpeg-static";

const FFMPEG = String(FFMPEG_PATH);
const FONT = "assets/fonts/Pretendard-Bold.otf";
const CJK_FONT = "assets/fonts/NotoSerifKR-Bold.ttf";
const FLASH_SECONDS = 0.125;
const CAPTION_Y = 0.62;
const BTS_Y = 520;
const BTS_SECONDS = 3;
const CARDS = ["opening", "ending", "endcard"] as const;

function ffmpeg(args: string[]): void {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error(`[assemble] ffmpeg 실패 ${r.status}`);
}

const ENC = [
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "24",
  "-c:a",
  "aac",
  "-ar",
  "48000",
  "-ac",
  "2",
  "-b:a",
  "128k",
];

const STYLE: Record<string, { color: string; font: string }> = {
  guide: { color: "white", font: FONT },
  viewer: { color: "0xC59BFF", font: FONT },
  note: { color: "white@0.9", font: FONT },
  cjk: { color: "white", font: CJK_FONT },
};

function drawLines(
  dir: string,
  key: string,
  lines: string[],
  opts: {
    size: number;
    y: number;
    style?: string;
    border?: string;
    from?: number;
    to?: number;
    alpha?: string;
  },
): string[] {
  const st = STYLE[opts.style || "guide"];
  const when =
    opts.from != null
      ? `:enable='between(t,${opts.from},${opts.to ?? 999})'`
      : "";
  return lines.map((line, i) => {
    const f = path.join(dir, `${key}-${i}.txt`).replace(/\\/g, "/");
    fs.writeFileSync(f, line);
    return `drawtext=fontfile=${st.font}:textfile='${f.replace(":", "\\:")}':fontsize=${opts.size}:fontcolor=${st.color}:borderw=5:bordercolor=${opts.border || "black@0.9"}:shadowcolor=black@0.6:shadowx=2:shadowy=3:x=(w-text_w)/2:y=${Math.round(opts.y + i * opts.size * 1.3)}${opts.alpha ? `:alpha='${opts.alpha}'` : ""}${when}`;
  });
}

export async function keepCards(city: string, from: string): Promise<void> {
  const sc = readScenario(city);
  for (const card of CARDS) {
    const f = fs.readdirSync(from).find((x) => x.includes(`_${card}_`));
    if (!f) throw new Error(`[assemble] 카드 없음: ${card} in ${from}`);
    const saved = await keep(
      sc.folder,
      `${city}_card_${card}.mp4`,
      fs.readFileSync(path.join(from, f)),
      "video/mp4",
    );
    console.log(`✓ ${city} 카드 ${card} → ${saved.key} · ${saved.local}`);
  }
}

export async function assemble(city: string): Promise<void> {
  const sc = readScenario(city);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mk-${city}-`));
  const piece = (name: string) => path.join(tmp, `${name}.mp4`);
  const card = (name: string, input: string) => {
    ffmpeg([
      "-i",
      input,
      "-vf",
      "scale=1080:1920:flags=lanczos,fps=24",
      ...ENC,
      piece(name),
    ]);
    return piece(name);
  };

  const scene = (s: any): string => {
    const layers = ["scale=1080:1920:flags=lanczos,fps=24"];
    s.captions.forEach((c: any, k: number) =>
      layers.push(
        ...drawLines(tmp, `cap${s.n}-${k}`, c.text.split("\n"), {
          size: 54,
          y: 1920 * CAPTION_Y,
          style: c.font || c.who,
          from: c.from,
          to: c.to,
        }),
      ),
    );
    if (s.greeting)
      layers.push(
        ...drawLines(tmp, "bts", ["BTS"], {
          size: 64,
          y: BTS_Y,
          border: "0x8A2BE2",
          alpha: `if(lt(t,${BTS_SECONDS - 0.5}),1,max(0,(${BTS_SECONDS}-t)/0.5))`,
          from: 0,
          to: BTS_SECONDS,
        }),
        ...drawLines(tmp, "fan", [sc.fanLabel], {
          size: 28,
          y: 1480,
          style: "note",
        }),
      );
    if (s.fadeOut)
      layers.push(`fade=t=out:st=${s.cut - s.fadeOut}:d=${s.fadeOut}`);
    ffmpeg([
      ...(s.trimStart ? ["-ss", String(s.trimStart)] : []),
      "-i",
      latestIn(sc.folder, `_${city}_clip${s.n}_720p.mp4`),
      "-t",
      String(s.cut),
      "-vf",
      layers.join(","),
      ...(s.mute ? ["-af", "volume=0"] : []),
      ...ENC,
      piece(`s${s.n}`),
    ]);
    return piece(`s${s.n}`);
  };

  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `color=c=white:s=1080x1920:d=${FLASH_SECONDS}:r=24`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    String(FLASH_SECONDS),
    ...ENC,
    piece("flash"),
  ]);

  const [cold, ...rest] = sc.scenes;
  const parts = [
    scene(cold),
    piece("flash"),
    card("opening", latestIn(sc.folder, `_${city}_card_opening.mp4`)),
    ...rest.map(scene),
    card("ending", latestIn(sc.folder, `_${city}_card_ending.mp4`)),
    card("endcard", latestIn(sc.folder, `_${city}_card_endcard.mp4`)),
  ];

  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(
    list,
    parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
  );
  const final = piece("final");
  ffmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "23",
    "-maxrate",
    "3000k",
    "-bufsize",
    "6000k",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    final,
  ]);
  const saved = await keep(
    sc.folder,
    `${city}_ep${sc.episode}_9x16.mp4`,
    fs.readFileSync(final),
    "video/mp4",
  );
  console.log(
    `✓ ${city} 완성본 ${(fs.statSync(final).size / 1e6).toFixed(1)}MB → ${saved.key} · ${saved.local}`,
  );
  fs.rmSync(tmp, { recursive: true, force: true });
}
