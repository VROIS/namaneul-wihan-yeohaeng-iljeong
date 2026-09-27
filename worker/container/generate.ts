// ⚠️ 수정금지(승인필요) 2026-09-12 사장님 결정 = TRIPIS 독립. 영상 생성 = 이 컨테이너 1벌 (정본 §)

import http from "http";
import { storage } from "./lib/storage";
import { db, pool } from "./lib/db";
import { issueApiKey } from "./lib/services/shared/issue-api-key";
import { generateSceneClip } from "./lib/services/shared/video-gen-client";
import {
  MAX_SCENES,
  normalizeVideoLang,
  omniClips,
  omniClipRequest,
  omniSceneCards,
  clipKey,
  dayVideoKey,
  slotPlaceId,
  type OmniClip,
} from "./lib/services/omni-day-clips";
import {
  castFor,
  placeTranslations,
  publishToProfile,
  setDayVideo,
  tripInputs,
  videoCity,
} from "./day-scenes";
import { stitchAndUpload } from "./lib/services/video-stitcher";
import { uploadToR2, isR2Configured } from "./lib/services/shared/r2-client";
import { chargeOnSuccess } from "@shared/credits";

// ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = **씬 1개가 죽은 사유표(키)** 전용 = 화면이 tripisVideo.partialReason.<키> 로 번역한다. 여정 전체 실패 사유는 이걸 쓰지 않고 예외 문장 원문을 쓴다(운영 동일) (정본 §)
function userReason(e: unknown): string {
  const m = String((e as Error)?.message || e);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(m)) return "quota";
  if (/타임아웃|timeout|ETIMEDOUT/i.test(m)) return "timeout";
  if (/R2|저장|storage/i.test(m)) return "storage";
  if (/이미지/.test(m)) return "image";
  return "scene";
}

export interface DayVideoJob {
  id: number;
  day: number;
  taskId: string;
  lang?: string;
  requesterUserId: string;
}

interface MadeClip {
  clip: OmniClip;
  buf: Buffer;
  key: string | null;
}

/** 202 응답 뒤 뒷일 전부 = Worker 가 접수를 끝내고 여기로 넘긴다. */
// ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 하루 영상 = 옴니 조각 전부 동시 생성 → 조각마다 R2 금고(도시 폴더) → 성공 조각만 이어 붙여 게시 (정본 §)
export async function runDayVideo(job: DayVideoJob): Promise<void> {
  const { id, day, taskId, requesterUserId } = job;
  const lang = normalizeVideoLang(job.lang);
  let totalScenes = 0;
  try {
    // 슬롯은 DB 에서 다시 읽는다(Worker 와 같은 자리).
    const itin = await storage.getItinerary(id);
    const slots: any[] | undefined = (itin?.rawData as any)?.days?.[day - 1]
      ?.places;
    if (!itin || !slots?.length)
      throw new Error(`여정 ${id} day ${day} 슬롯 없음`);
    const daySlots = slots.slice(0, MAX_SCENES);
    totalScenes = daySlots.length;

    // ⚠️ 2026-08-07 사장님 승인 = 저장 열쇠 없으면 씬 생성(유료) 전에 즉시 실패 = 비용 유출 0
    if (!isR2Configured())
      throw new Error(
        "저장 창고(R2) 열쇠 미등록 = 영상을 만들어도 저장할 수 없어 시작 전 중단(관리자: 클라우드플레어 비밀 설정 확인)",
      );
    const today = new Date().toISOString().slice(0, 10);
    const apiKey = await issueApiKey(pool, "GEMINI_API_KEY", null, today, true);
    const cast = await castFor(itin);
    const { meta } = await tripInputs(itin);
    const city = await videoCity(itin);
    const translations = await placeTranslations(daySlots, lang);
    const clips = omniClips(daySlots, cast);
    const reasons: (string | null)[] = clips.map(() => null);
    let done = 0;
    // 조각 하나 실패해도 전체 폐기 금지 = 성공한 조각만 모아 완성(사장님 SSOT 2026-07-23 = 사용자를 마냥 기다리게 안 함).
    const made = await Promise.all(
      clips.map(async (clip, i): Promise<MadeClip | null> => {
        const req = omniClipRequest(clip, cast, {
          city: city.name,
          tripKind: meta.companionType,
          lang,
          translations,
          root: process.cwd(),
        });
        try {
          const buf = await generateSceneClip(req.prompt, {
            apiKey,
            referenceImages: req.images,
            aspectRatio: "9:16",
            seconds: clip.seconds,
            contextId: null,
            rawTag: `omni-i${id}-d${day}-c${clip.index}-${lang}`,
          });
          const key = clipKey(city.folder, id, day, clip, lang);
          const kept = await uploadToR2(key, buf, "video/mp4").then(
            () => true,
            (e) => {
              console.error(
                `[video] ${taskId} 조각${clip.index} 금고 보관 실패(완성은 계속):`,
                (e as Error)?.message,
              );
              return false;
            },
          );
          done += clip.slots.length;
          await setDayVideo(id, day, {
            status: "processing",
            url: null,
            taskId,
            scenesDone: done,
            totalScenes,
          });
          return { clip, buf, key: kept ? key : null };
        } catch (clipErr) {
          console.error(
            `[video] ${taskId} 조각${clip.index} 실패(제외):`,
            String((clipErr as Error)?.message || clipErr).slice(0, 200),
          );
          reasons[i] = userReason(clipErr);
          return null;
        }
      }),
    );
    const ok = made.filter((m): m is MadeClip => m != null);
    if (!ok.length) throw new Error("모든 조각 생성 실패 = 완성할 조각 없음");
    const okPlaces = ok.reduce((n, m) => n + m.clip.slots.length, 0);
    console.log(
      `[video] ${taskId} 성공 조각 ${ok.length}/${clips.length}(장소 ${okPlaces}/${totalScenes}) = 완성 진행`,
    );
    const url = await stitchAndUpload(
      ok.map((m) => m.buf),
      dayVideoKey(city.folder, id, day),
      ok.reduce((n, m) => n + m.clip.seconds, 0),
    );
    const scenes = omniSceneCards(
      ok.map((m) => m.clip),
      city.name,
    );
    await setDayVideo(id, day, {
      status: "succeeded",
      url,
      taskId,
      scenesDone: scenes.length,
      totalScenes: scenes.length,
      scenes,
      clips: ok
        .filter((m) => m.key)
        .map((m) => ({
          key: m.key as string,
          places: m.clip.slots.map(slotPlaceId),
        })),
      // ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 빠진 장소는 **숫자와 사유표만** 남긴다(옴니 = 실패한 조각에 든 장소 수) = 문장 조립은 화면(7개 로케일)이 한다 (정본 §)
      partial:
        okPlaces < totalScenes
          ? {
              skipped: totalScenes - okPlaces,
              total: totalScenes,
              reason: reasons.find(Boolean) || "scene",
            }
          : undefined,
    });
    // ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 차감 = 기존 "최소 6씬" 그대로, 옴니는 성공한 조각에 든 장소 수로 센다 (정본 §)
    if (okPlaces >= Math.min(6, totalScenes)) {
      await chargeOnSuccess(db!, requesterUserId, "day_video", taskId);
    } else {
      console.log(
        `[video] ${taskId} 성공 장소 ${okPlaces} < ${Math.min(6, totalScenes)} = 무료 게시(차감 없음)`,
      );
    }
    // ⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정 = 프로필 자동게시 = 게시 도구와 같은 1벌(재생성 시 created_at 갱신 포함) (정본 §)
    if (requesterUserId) {
      await publishToProfile(requesterUserId, id, day).catch((pubErr) =>
        console.error(
          `[video] ${taskId} 자동게시 실패:`,
          (pubErr as Error)?.message,
        ),
      );
    }
    console.log(`[video] ${taskId} 완료(옴니): ${url}`);
  } catch (e) {
    console.error(`[video] ${taskId} 실패:`, e);
    // ⚠️ 2026-08-06 사장님 승인 = 실패 **사유를 DB 에 기록**(화면이 그대로 표시 = 뭉개기 금지 SSOT).
    await setDayVideo(id, day, {
      status: "failed",
      url: null,
      taskId,
      scenesDone: 0,
      totalScenes,
      // ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = 완전 실패 사유 = 운영과 같이 **예외 문장 원문 그대로**(뭉개기 금지 SSOT 2026-08-06). 사유표(키)는 씬 단위에만 쓴다 = 화면이 번역하는 자리가 거기뿐 (정본 §)
      error: String((e as Error)?.message || e).slice(0, 300),
    });
  }
}

// ── HTTP 접수 = Worker(routes-video-generate.ts) 가 부른다 ──────────────────
const PORT = Number(process.env.PORT) || 8080;

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error("[generate] 요청 본문이 너무 큽니다"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("[generate] 요청 본문이 JSON 이 아닙니다"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, db: !!pool, r2: isR2Configured() }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/generate") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST /generate 만 받습니다" }));
    return;
  }
  (async () => {
    const body = await readJsonBody(req);
    const job: DayVideoJob = {
      id: Number(body.id),
      day: Number(body.day),
      taskId: String(body.taskId || ""),
      lang: body.lang,
      requesterUserId: String(body.requesterUserId || ""),
    };
    if (!Number.isFinite(job.id) || !Number.isFinite(job.day) || job.day < 1)
      throw new Error("[generate] id + day 필요");
    if (!job.taskId) throw new Error("[generate] taskId 필요");
    if (!job.requesterUserId)
      throw new Error("[generate] requesterUserId 필요");
    // 접수 즉시 202, 뒷일은 응답 뒤에 돈다.
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ taskId: job.taskId }));
    void runDayVideo(job);
  })().catch((e) => {
    const msg = String(e?.message || e);
    console.error("[generate] 접수 실패:", msg);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
  });
});

server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 75_000;

server.listen(PORT, () => {
  console.log(`[generate] listening on ${PORT}`);
});
