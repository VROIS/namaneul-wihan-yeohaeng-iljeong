// Cloudflare Containers = 영상 합성(ffmpeg) 전담 (2026-09-06)
//
// 원본 = server/services/video-stitcher.ts (합성 로직 1벌). 그 파일은
//   fs·os·path·child_process(:3-8) 를 쓰므로 Workers 런타임에서 원리적으로 못 돈다.
//   → 여기(컨테이너 = 진짜 Node = Linux VM)로 그대로 옮긴다.
//
// 왜 import 가 아니라 복사인가:
//   컨테이너는 Worker 번들과 **별개 이미지**라 server/** 를 import 할 수 없다.
//   그래서 §16(재발명 금지)을 지키는 방법 = 로직을 한 줄도 바꾸지 않고 옮기고,
//   각 블록에 원본 줄번호를 적어 출처를 밝힌다. 아래 주석의 `원본 :NN` 이 그것이다.
//
// 이 파일이 원본과 **다른 유일한 점** = R2 를 직접 만지지 않는다는 것.
//   원본 :65 는 uploadToR2() 로 직접 올렸지만, 컨테이너에는 R2 바인딩이 없다
//   (바인딩은 Worker 런타임 전용 = R2 Workers API 문서 "Create a binding" =
//    바인딩은 Worker 코드에 주입되는 런타임 변수다).
//   → 읽기 = R2 공개주소(https)로 GET / 쓰기 = 완성본을 응답 본문으로 Worker 에 돌려주고
//     Worker 가 자기 R2 바인딩으로 PUT 한다. 컨테이너에 열쇠를 넣지 않는 것이 목적.

import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { execFile } from "child_process";
import { promisify } from "util";

// 원본 video-stitcher.ts:12
const execFileAsync = promisify(execFile);

// 원본 video-stitcher.ts:8 은 ffmpeg-static(npm) 을 썼다.
// 여기서는 OS 패키지(apk add ffmpeg)로 깐 실행파일을 쓴다 = Dockerfile 참조.
// 이유 = 이미지 크기·아키텍처(linux/amd64) 안정성. npm 판은 플랫폼별 바이너리를 받아와
//        빌드 머신과 컨테이너 아키텍처가 어긋나면 실행이 안 된다.
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

// 원본 ghibli-travel-storyboard.ts:38 `export const SCENE_SECONDS = 6`.
// 컨테이너는 그 파일을 import 할 수 없으므로 같은 값을 둔다.
// 다만 아래 검사는 **요청이 준 값을 우선** 쓰므로(Worker 가 자기 상수를 보낸다)
// 이 값은 Worker 가 안 보낼 때만 쓰이는 대비값이다 = 두 벌이 어긋날 여지를 없앤다.
const DEFAULT_SCENE_SECONDS = 6;

const PORT = Number(process.env.PORT) || 8080;

/** 본문을 다 받는다(작은 JSON 전용). */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      // 본문은 R2 키 목록뿐 = 1MB 를 넘을 이유가 없다. 넘으면 잘못된 호출.
      if (size > 1_000_000) {
        reject(new Error("[stitch] 요청 본문이 너무 큽니다"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(new Error("[stitch] 요청 본문이 JSON 이 아닙니다"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * 씬 클립을 R2 공개주소에서 내려받는다.
 *
 * 왜 공개주소인가:
 *   ① 컨테이너에는 R2 바인딩이 없다(바인딩 = Worker 전용).
 *   ② 그렇다고 R2 API 열쇠를 컨테이너 환경변수로 넣으면 = 열쇠가 이미지·환경에 퍼진다.
 *   ③ 우리 버킷은 이미 공개주소가 있다(wrangler.jsonc vars.R2_PUBLIC_URL,
 *      = 앱이 완성 영상을 그 주소로 재생하고 있다 = 이미 공개된 자산).
 *   → 열쇠 0개로 읽기가 된다. 읽기 주소는 Worker 가 만들어 보내준다.
 */
async function fetchClip(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`[stitch] 씬 내려받기 실패 ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * 원본 video-stitcher.ts:14-74 stitchAndUpload() 의 **합성 부분 그대로**.
 * (원본의 마지막 R2 업로드 :65-70 만 빠졌다 = 위 파일머리 설명 참조.)
 *
 * @param {Buffer[]} clips 씬 영상들
 * @param {number} itineraryId
 * @param {number} day
 * @param {number} sceneSeconds 원본 SCENE_SECONDS
 * @returns {Promise<Buffer>} 이어붙인 mp4
 */
async function stitch(clips, itineraryId, day, sceneSeconds) {
  // 원본 :19
  if (!clips.length) throw new Error("[stitcher] 클립 없음");
  // 원본 :20-22
  const work = fs.mkdtempSync(
    path.join(os.tmpdir(), `ghibli-${itineraryId}-d${day}-`),
  );
  try {
    // 원본 :24-28
    const files = clips.map((buf, i) => {
      const p = path.join(work, `scene${i}.mp4`);
      fs.writeFileSync(p, buf);
      return p;
    });
    // 원본 :29-33
    const listPath = path.join(work, "list.txt");
    fs.writeFileSync(
      listPath,
      files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"),
    );
    // 원본 :34-46
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

    // 원본 :48-53
    const info = await execFileAsync(FFMPEG, ["-i", outPath]).catch(
      (e) => e, // ffmpeg -i 는 출력파일 미지정으로 exit 1 = stderr 에 Duration 있음
    );
    // 원본 :54-62
    const m = String(info.stderr || "").match(
      /Duration: (\d+):(\d+):(\d+\.\d+)/,
    );
    const durationSec = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
    const expected = clips.length * sceneSeconds;
    if (durationSec < expected * 0.85)
      throw new Error(
        `[stitcher] 결합 길이 이상: ${durationSec}s (기대 ${expected}s)`,
      );

    // 원본 :64 = 완성본을 읽어 돌려준다(원본은 이어서 R2 에 올렸다).
    return fs.readFileSync(outPath);
  } finally {
    // 원본 :71-73
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const server = http.createServer((req, res) => {
  // 컨테이너가 살아있는지 보는 용도. Container 클래스가 포트 열림을 기다리므로 가벼워야 한다.
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/stitch") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST /stitch 만 받습니다" }));
    return;
  }

  // 오래 걸리는 작업이다(씬 10개 이어붙이기). Node 기본 타임아웃에 끊기지 않게 푼다.
  req.setTimeout(0);
  res.setTimeout(0);

  (async () => {
    const body = await readJsonBody(req);
    const itineraryId = Number(body.itineraryId);
    const day = Number(body.day);
    const sceneUrls = Array.isArray(body.sceneUrls) ? body.sceneUrls : [];
    const sceneSeconds = Number(body.sceneSeconds) || DEFAULT_SCENE_SECONDS;

    if (!Number.isFinite(itineraryId) || !Number.isFinite(day))
      throw new Error("[stitch] itineraryId + day 필요");
    if (!sceneUrls.length) throw new Error("[stitcher] 클립 없음"); // 원본 :19 와 같은 문구

    // 순서가 곧 영상 순서 = 병렬로 받되 자리(i)는 지킨다.
    const clips = await Promise.all(sceneUrls.map((u) => fetchClip(String(u))));

    const out = await stitch(clips, itineraryId, day, sceneSeconds);

    // 완성본은 mp4 바이트 그대로 돌려준다. Worker 가 이걸 R2 에 PUT 한다.
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": String(out.length),
    });
    res.end(out);
  })().catch((e) => {
    const msg = String(e?.message || e);
    console.error("[stitch] 실패:", msg);
    if (res.headersSent) {
      // 본문을 이미 흘려보낸 뒤 = 상태코드를 바꿀 수 없다 = 끊어서 실패를 알린다.
      res.destroy();
      return;
    }
    res.writeHead(500, { "Content-Type": "application/json" });
    // 실패 사유를 그대로 담는다(뭉개기 금지 = 원본 video-routes.ts:381 과 같은 뜻).
    res.end(JSON.stringify({ error: msg }));
  });
});

// 합성은 몇 분이 걸릴 수 있다 = 유휴 연결 타임아웃을 넉넉히.
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 75_000;

server.listen(PORT, () => {
  console.log(`[stitch] listening on ${PORT}`);
});
