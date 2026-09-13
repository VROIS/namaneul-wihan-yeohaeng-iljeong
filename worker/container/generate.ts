// ⚠️ 수정금지(승인필요) 2026-09-12 사장님 결정 = TRIPIS 독립 = Replit(server/**) 안 씀. 영상 생성 = 이 컨테이너 1벌 (정본 §)
// Replit(내손안에가이드)은 곧 폐기 = 그 코드에 의존하면 TRIPIS 가 같이 죽는다.
// 그래서 필요한 18개를 worker/container/lib/ 로 복사했다(내용 무변경, 경로만 바뀜).

import http from "http";
import crypto from "crypto";
import { storage } from "./lib/storage";
import { pool } from "./lib/db";
import type { DayVideo } from "../../shared/schema";
import { issueApiKey } from "./lib/services/shared/issue-api-key";
import {
  buildGhibliStoryboard,
  sceneClipPrompt,
  sceneStillPrompt,
  scenePhotoMotionPrompt,
  narratorFromCast,
  normalizeVideoLang,
  MAX_SCENES,
  SCENE_SECONDS,
} from "./lib/services/ghibli-travel-storyboard";
import {
  generateSceneClip,
  animateStillToClip,
} from "./lib/services/shared/video-gen-client";
import { composeSceneStill } from "./lib/services/shared/image-gen-client";
import { stitchAndUpload } from "./lib/services/video-stitcher";
import {
  uploadToR2,
  getFromR2,
  isR2Configured,
} from "./lib/services/shared/r2-client";
import { chargeOnSuccess } from "./lib/credit-charge";

// 원본 :43
const SCENE_CONCURRENCY = 4;

// ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = **씬 1개가 죽은 사유표(키)** 전용 = 화면이 tripisVideo.partialReason.<키> 로 번역한다. 여정 전체 실패 사유는 이걸 쓰지 않고 예외 문장 원문을 쓴다(운영 동일) (정본 §)
function userReason(e: unknown): string {
  const m = String((e as Error)?.message || e);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(m)) return "quota";
  if (/타임아웃|timeout|ETIMEDOUT/i.test(m)) return "timeout";
  if (/R2|저장|storage/i.test(m)) return "storage";
  if (/이미지|image-gen|스틸/i.test(m)) return "image";
  return "scene";
}

// 원본 :45-61
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

// 원본 :68-81
async function resolveSummaries(slots: any[]): Promise<Record<number, string>> {
  const map: Record<number, string> = {};
  if (!pool) return map;
  const ids = slots
    .map((s) => parseInt(String(s?.id ?? "").replace(/\D/g, ""), 10)) // "db-62219" → 62219
    .filter((n) => !isNaN(n));
  if (!ids.length) return map;
  const r = await pool.query(
    "SELECT id, summary_ko FROM place_seed_raw WHERE id = ANY($1::int[])",
    [ids],
  );
  for (const row of r.rows) map[row.id] = row.summary_ko || "";
  return map;
}

// 원본 :83-96
async function setDayVideo(
  itineraryId: number,
  day: number,
  v: DayVideo,
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE itineraries
       SET video_by_day = COALESCE(video_by_day, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
           updated_at = NOW()
     WHERE id = $1`,
    [itineraryId, String(day), JSON.stringify(v)],
  );
}

export interface DayVideoJob {
  id: number;
  day: number;
  taskId: string;
  lang?: string;
  useOptionB: boolean;
  requesterUserId: string;
}

/** 원본 :172-391 = 202 응답 뒤 뒷일 전부. Worker 가 :114-170 을 끝내고 여기로 넘긴다. */
export async function runDayVideo(job: DayVideoJob): Promise<void> {
  const { id, day, taskId, useOptionB, requesterUserId } = job;
  const lang = normalizeVideoLang(job.lang);
  let totalScenes = 0;
  try {
    // 원본 :124-126 + :152-153 = 슬롯은 DB 에서 다시 읽는다(Worker 와 같은 자리).
    const itin = await storage.getItinerary(id);
    const slots: any[] | undefined = (itin?.rawData as any)?.days?.[day - 1]
      ?.places;
    if (!itin || !slots?.length)
      throw new Error(`여정 ${id} day ${day} 슬롯 없음`);
    const sceneSlots = slots.slice(0, MAX_SCENES);
    totalScenes = sceneSlots.length;

    // ⚠️ 2026-08-07 사장님 승인 = 저장 열쇠 없으면 씬 생성(유료) 전에 즉시 실패 = 비용 유출 0
    if (!isR2Configured())
      throw new Error(
        "저장 창고(R2) 열쇠 미등록 = 영상을 만들어도 저장할 수 없어 시작 전 중단(관리자: Replit Secrets 확인)",
      );
    const today = new Date().toISOString().slice(0, 10);
    const apiKey = await issueApiKey(pool, "GEMINI_API_KEY", null, today, true);
    const user = itin.userId ? await storage.getUser(itin.userId) : null;
    const { rawData: _omit, ...meta } = itin as any;
    // ⚠️ 2026-08-22 사장님 승인(A+B+C) = 캐스팅 재료(누구랑·인원·나이) = rawData(생성 산출물=진실) 우선(읽을 때 조립).
    for (const k of ["companionType", "companionCount", "companionAges"])
      if (_omit?.[k] != null) meta[k] = _omit[k];
    const sb = await buildGhibliStoryboard({
      itinerary: meta,
      user,
      day,
      slots: sceneSlots,
      apiKey,
      language: lang,
    });
    // 데이터 소스 = 사장님 SSOT 2026-07-23: 대사 = editorial_summary / 카드 요약 = summary_ko / 카드 장소명 = name_local
    sb.scenes.forEach((s, i) => {
      const es = sceneSlots[i]?.editorialSummary;
      // ko = 우리 DB 문구 그대로(톤앤매너 통일) / 비ko = 제미니가 쓴 사용자 언어 나레이션 유지(2026-08-22 사장님 승인)
      if (es && lang === "ko") s.narrationKo = es;
    });
    const psrSummary = await resolveSummaries(sceneSlots);
    // ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = 씬 목록 모양 = shared/schema 의 DayVideo.scenes 1벌을 그대로 쓴다(사유 칸 포함) = 두 벌로 갈라지지 않게 (정본 §)
    const scenesMeta: NonNullable<DayVideo["scenes"]> = sb.scenes.map(
      (s, i) => {
        const numId = parseInt(
          String(sceneSlots[i]?.id ?? "").replace(/\D/g, ""),
          10,
        );
        return {
          // 2026-08-22 사장님 원칙 = 장소명 노출 nameEn 1순위(전 언어 공통)
          placeName:
            sceneSlots[i]?.nameEn ||
            sceneSlots[i]?.nameLocal ||
            sceneSlots[i]?.name ||
            s.placeName,
          // ko = 창고 summary_ko / 비ko = 같은 1콜 응답의 cardSummary(추가호출 0, 2026-08-22 사장님 승인)
          summary:
            lang === "ko"
              ? sceneSlots[i]?.summaryKo || psrSummary[numId] || ""
              : (s as any).cardSummary || "",
        };
      },
    );
    const narrator = narratorFromCast(sb.cast); // 나레이터 음색 = 출연진 연령대·성별 연동
    let done = 0;
    // 씬 하나 실패해도 전체 폐기 금지 = 성공한 씬만 모아 완성(사장님 SSOT 2026-07-23 = 사용자를 마냥 기다리게 안 함).
    const rawClips = await mapLimit(
      sb.scenes,
      SCENE_CONCURRENCY,
      async (scene, i) => {
        try {
          // ⚠️ 2026-08-07 사장님 승인 = 씬 낱개 즉시 R2 보존 + 재시도 재활용(외부 재과금 0).
          const slotKeyId = String(sceneSlots[i]?.id ?? i).replace(
            /[^A-Za-z0-9_-]/g,
            "",
          );
          const slotImage = sceneSlots[i]?.image;
          const fpSource =
            sb.source === "manual"
              ? `${scene.visualPrompt}|${scene.narrationKo}|${slotImage || ""}`
              : `${slotImage || ""}|${sceneSlots[i]?.editorialSummary || ""}|${sceneSlots[i]?.summaryKo || ""}`;
          const sceneFp = crypto
            .createHash("md5")
            .update(fpSource)
            .digest("hex")
            .slice(0, 8);
          const sceneKey = `itinerary-videos/${id}/scenes/d${day}-s${scene.sceneIndex}-p${slotKeyId}-${useOptionB ? "b" : "a"}-${sceneFp}.mp4`;
          let buf: Buffer | null = await getFromR2(sceneKey);
          const reused = !!buf;
          if (buf) {
            console.log(
              `[video] ${taskId} 씬${scene.sceneIndex} = 보존본 재활용(재과금 0): ${sceneKey}`,
            );
          } else if (useOptionB) {
            const still = await composeSceneStill(
              sceneStillPrompt(scene, sb.cast.totalTravelerCount, !!slotImage),
              {
                apiKey,
                referenceImages: [
                  ...(slotImage ? [{ url: slotImage }] : []), // 실사진 없는 슬롯(드묾) = 캐릭터 참조만
                  ...sb.referenceImagePaths.map((p) => ({ path: p })),
                ],
                contextId: null,
                rawTag: `nano-i${id}-d${day}-s${scene.sceneIndex}`,
              },
            );
            buf = await animateStillToClip(
              scenePhotoMotionPrompt(scene, narrator, lang),
              {
                apiKey,
                imageBuffer: still,
                imageMimeType: "image/png",
                durationSeconds: SCENE_SECONDS,
                contextId: null,
                rawTag: `veo-i${id}-d${day}-s${scene.sceneIndex}`,
              },
            );
          } else {
            buf = await generateSceneClip(
              sceneClipPrompt(scene, narrator, lang),
              {
                apiKey,
                referenceImages: sb.referenceImagePaths.map((p) => ({
                  path: p,
                })),
                aspectRatio: "9:16",
                contextId: null,
                rawTag: `omni-i${id}-d${day}-s${scene.sceneIndex}`,
              },
            );
          }
          if (!reused && buf)
            await uploadToR2(sceneKey, buf, "video/mp4").catch((e) =>
              console.error(
                `[video] ${taskId} 씬${scene.sceneIndex} 낱개보존 실패(완성은 계속):`,
                (e as Error)?.message,
              ),
            );
          done++;
          await setDayVideo(id, day, {
            status: "processing",
            url: null,
            taskId,
            scenesDone: done,
            totalScenes,
            scenes: scenesMeta,
          });
          return buf;
        } catch (sceneErr) {
          const why = String((sceneErr as Error)?.message || sceneErr).slice(
            0,
            200,
          );
          console.error(
            `[video] ${taskId} 씬${scene.sceneIndex} 실패(제외):`,
            why,
          );
          // ⚠️ 수정금지(승인필요) 2026-09-12 사장님 결정 = 씬 사유를 DB 에 남긴다(로그는 컨테이너 밖으로 안 나옴)
          scenesMeta[i].error = userReason(sceneErr);
          await setDayVideo(id, day, {
            status: "processing",
            url: null,
            taskId,
            scenesDone: done,
            totalScenes,
            scenes: scenesMeta,
          });
          return null;
        }
      },
    );
    const clips = rawClips.filter((b): b is Buffer => b != null);
    const okScenesMeta = scenesMeta.filter((_, i) => rawClips[i] != null);
    const dead = scenesMeta.filter((m) => m.error);
    if (!clips.length) throw new Error("모든 씬 생성 실패 = 완성할 클립 없음");
    console.log(
      `[video] ${taskId} 성공 씬 ${clips.length}/${totalScenes} = 완성 진행`,
    );
    const url = await stitchAndUpload(clips, id, day);
    await setDayVideo(id, day, {
      status: "succeeded",
      url,
      taskId,
      scenesDone: clips.length,
      totalScenes: clips.length,
      scenes: okScenesMeta,
      // ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = 일부 씬이 죽으면 **숫자와 사유표만** 남긴다 = 문장 조립은 화면(7개 로케일)이 한다 (옛 영어 문장 조립 폐기 §19) (정본 §)
      partial: dead.length
        ? {
            skipped: dead.length,
            total: totalScenes,
            reason: dead[0].error || "scene",
          }
        : undefined,
    });
    // 🪙 2026-08-06 사장님 승인 = 차감 = **완성·게시 시점**(성공 씬 ≥ min(6, 요청 씬수)만 유료 = "최소 6씬" SSOT.
    if (clips.length >= Math.min(6, totalScenes)) {
      await chargeOnSuccess(requesterUserId, "day_video", {
        referenceId: taskId,
        tag: `일별 영상 ${taskId}`,
      });
    } else {
      console.log(
        `[video] ${taskId} 성공 씬 ${clips.length} < ${Math.min(6, totalScenes)} = 무료 게시(차감 없음)`,
      );
    }
    //   ⚠️ 수정금지(승인필요) 2026-08-20 §22 판단검증 지적 = created_at 도 재생성 시 함께 갱신.
    if (requesterUserId && pool) {
      await pool
        .query(
          `INSERT INTO saved_videos (user_id, itinerary_id, day, is_new)
           VALUES ($1, $2, $3, true)
           ON CONFLICT ON CONSTRAINT saved_videos_user_itin_day_uniq
           DO UPDATE SET is_new = true, created_at = now()`,
          [requesterUserId, id, day],
        )
        .catch((pubErr) =>
          console.error(
            `[video] ${taskId} 자동게시 실패:`,
            (pubErr as Error)?.message,
          ),
        );
    }
    console.log(
      `[video] ${taskId} 완료(${useOptionB ? "B실사포토무비" : "A지브리"}): ${url}`,
    );
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
      useOptionB: body.useOptionB !== false,
      requesterUserId: String(body.requesterUserId || ""),
    };
    if (!Number.isFinite(job.id) || !Number.isFinite(job.day) || job.day < 1)
      throw new Error("[generate] id + day 필요");
    if (!job.taskId) throw new Error("[generate] taskId 필요");
    if (!job.requesterUserId)
      throw new Error("[generate] requesterUserId 필요");
    // 원본 :162 = 접수 즉시 202, 뒷일은 원본 :172 처럼 응답 뒤에 돈다.
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
