// Cloudflare Worker 이관 = 일별 영상 생성 1건 (2026-09-06)
// 원본 = server/video-routes.ts:110 POST /api/itineraries/:id/video/generate
//
// ── 왜 컨테이너인가 ──────────────────────────────────────────────────────────
// 원본이 마지막에 부르는 server/services/video-stitcher.ts 는 fs·os·path·
// child_process·ffmpeg-static(:3-8) 을 쓴다. Workers 런타임에는 파일시스템도
// 프로세스 실행도 없으므로 **원리적으로** 못 돈다 = 컨테이너가 유일한 길.
// 근거: developers.cloudflare.com/containers/ (Container 는 Linux VM 안에서 이미지를 돌린다)
//
// ── 이 파일이 원본과 다른 점 (구조만 다르고, 응답·문구·상태코드는 100% 같다) ──
// ① 원본 :172 `void (async () => {...})()` = 응답을 보낸 뒤 수 분간 백그라운드로 돈다.
//    Workers 에서는 응답 후 실행이 끊긴다(floating promise = isolate 가 종료될 수 있음).
//    → waitUntil 로 붙든다. 게다가 waitUntil 에도 한도가 있으므로
//      **무거운 일(ffmpeg 합성)은 컨테이너가 하고 Worker 는 기다리기만** 한다.
//      진행상태는 원본과 같은 자리(itineraries.video_by_day)에 남긴다.
// ② R2 = 컨테이너에는 바인딩이 없다(바인딩은 Worker 런타임 전용).
//    → 읽기: Worker 가 R2 공개주소(vars.R2_PUBLIC_URL)를 만들어 컨테이너에 넘긴다.
//      쓰기: 컨테이너가 완성 mp4 를 응답으로 돌려주고 Worker 가 자기 바인딩으로 PUT.
//    = 컨테이너에 R2 열쇠를 넣지 않는다.
//
// 🔴 미배선(사장님 최종 점검 몫): 씬 **생성**(제미니·Veo 유료호출)은 여기 없다.
//    이 라우트는 "이미 R2 에 있는 씬 클립"을 이어붙여 완성한다.
//    원본 :235-329 의 씬 생성 루프는 유료 외부호출이라 이번 범위에서 제외했다.

import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
// Container = @cloudflare/containers. `extends` 로 상속해야 this.ctx/this.env 를 갖는다
// (implements 로 흉내내면 잃는다 = workers-best-practices 안티패턴).
// 근거: developers.cloudflare.com/containers/reference/container-class/
//   "export class SandboxContainer extends Container { defaultPort = 8080; sleepAfter = '5m'; }"
import { Container, getContainer } from "@cloudflare/containers";
// waitUntil = ctx 없이 직접 import 하는 형태. 선례 = worker/routes-gemini.ts:31.
// httpServerHandler(Express) 경로에는 ctx 가 없으므로 이 형태가 유일한 배선이다.
import { env, waitUntil } from "cloudflare:workers";
import * as schema from "../shared/schema";
import type { DayVideo } from "../shared/schema";
// 영상 옵션 모드 = 이미 1벌로 통일된 조회를 그대로 쓴다(§19 = 2벌 금지).
import { readOptionMode } from "./routes-video-config";

// src.ts 의 openDb() 를 그대로 받는다. 형태 = routes-video-config.ts:19-21 과 같은 1벌
// (readOptionMode 에 이 db 를 그대로 넘기므로 타입이 어긋나면 안 된다).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

const { itineraries, savedVideos, creditTransactions, users } = schema;

/**
 * 합성 전담 컨테이너.
 *
 * 근거: developers.cloudflare.com/containers/reference/container-class/
 *   - defaultPort = fetch 가 말을 걸 포트. 이 포트가 열릴 때까지 요청을 붙들어 준다.
 *     🔴 worker/container/Dockerfile 의 EXPOSE·ENV PORT 와 반드시 같은 값(8080).
 *   - sleepAfter = 놀고 있으면 재우는 시간. 재우면 과금이 멈춘다(scale to zero).
 *     합성은 몇 분짜리라 너무 짧으면 작업 중에 잘릴 여지가 있어 넉넉히 둔다.
 */
export class VideoStitchContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";

  override onError(error: unknown) {
    console.error("[video] 컨테이너 오류:", error);
  }
}

/** 원본 server/ghibli-travel-storyboard.ts:37-38 과 같은 값(그 파일은 Worker 번들에 못 들어온다). */
const MAX_SCENES = 10;
const SCENE_SECONDS = 6;

/** 원본 server/video-routes.ts:35-36 = 화면에 보여줄 예상비용 단가. */
const COST_PER_SECOND_USD = 0.101;
const B_COST_PER_SCENE_USD = 0.35;

/** 원본 server/video-routes.ts:41 */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/** 원본 server/credit-charge.ts:6 CREDIT_COSTS 의 day_video(§9 단가표 = 60). */
const DAY_VIDEO_COST = 60;
/** 원본 server/credit-charge.ts:16 CREDIT_LABELS 와 같은 문구(장부에 그대로 남는다). */
const DAY_VIDEO_LABEL = "일별 영상";

// 원본 server/auth-user.ts:8 getUserIdFromReq = 헤더 정규식만(DB 무관).
// 그 파일을 import 하면 server/db.ts 가 딸려와 번들이 안 되므로
// 다른 라우트 파일(routes-gemini.ts:55 등)과 같은 1벌을 둔다.
function getUserIdFromReq(req: Request): string | null {
  const m = (req.headers.authorization || "").match(
    /^Bearer\s+simple_auth_token_v1_(.+)$/,
  );
  return m ? m[1] : null;
}

/** 원본 server/video-routes.ts:62-66 그대로. */
function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}

/**
 * 원본 server/video-routes.ts:83-96 setDayVideo 그대로(같은 SQL·같은 병합 방식).
 * jsonb 한 칸만 갈아끼우므로 다른 날짜의 상태를 건드리지 않는다.
 */
async function setDayVideo(
  db: Db,
  itineraryId: number,
  day: number,
  v: DayVideo,
): Promise<void> {
  await db
    .update(itineraries)
    .set({
      videoByDay: sql`COALESCE(${itineraries.videoByDay}, '{}'::jsonb) || jsonb_build_object(${String(day)}::text, ${JSON.stringify(v)}::jsonb)`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(itineraries.id, itineraryId));
}

/**
 * 원본 server/credit-charge.ts:83 precheckFeature = 잔액 사전확인(차감 0).
 * 비로그인·관리자 = 면제(§9). 잔액부족 = 402.
 * ⚠️ 반드시 res 를 내보내기 **전에** 부른다(§9 금지 4번 = 헤더 나간 뒤엔 402 를 못 보낸다).
 * 형태 = routes-gemini.ts:117 precheckFeature 와 같다.
 */
async function precheckDayVideo(
  db: Db,
  res: Response,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return true;
  const [user] = await db
    .select({ role: users.role, credits: users.credits })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role === "admin") return true;
  const balance = user.credits ?? 0;
  if (balance < DAY_VIDEO_COST) {
    res.status(402).json({
      error: "insufficient_credits",
      message: `크레딧이 부족합니다. (필요: ${DAY_VIDEO_COST}, 잔액: ${balance})`,
      balance,
      required: DAY_VIDEO_COST,
    });
    return false;
  }
  return true;
}

/**
 * 원본 server/credit-charge.ts:62 chargeOnSuccess → chargeFeature → creditService.useCredits.
 * 장부 줄 + 잔액을 한 트랜잭션으로. 차감이 실패해도 완성물은 보존한다(원본과 같은 뜻).
 * 형태 = routes-gemini.ts:148 chargeOnSuccess 와 같다.
 */
async function chargeDayVideoOnSuccess(
  db: Db,
  userId: string | null,
  referenceId: string,
): Promise<void> {
  if (!userId) return;
  try {
    const [user] = await db
      .select({ role: users.role, credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || user.role === "admin") return;
    if ((user.credits ?? 0) < DAY_VIDEO_COST) {
      console.error(
        `[credits] ${DAY_VIDEO_LABEL} 완성했으나 차감 실패(잔액 소진) = 무료 처리 기록`,
      );
      return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(creditTransactions).values({
        userId,
        type: "usage",
        amount: -DAY_VIDEO_COST,
        description: `${DAY_VIDEO_LABEL} ${referenceId}`,
        referenceId,
      });
      await tx
        .update(users)
        .set({
          credits: sql`COALESCE(${users.credits}, 0) + ${-DAY_VIDEO_COST}`,
        })
        .where(eq(users.id, userId));
    });
  } catch (e) {
    console.error(
      `[credits] ${DAY_VIDEO_LABEL} 차감 실패(완성물은 보존):`,
      (e as { message?: string })?.message || e,
    );
  }
}

/**
 * 이미 R2 에 있는 그 날짜의 씬 클립 키를 순서대로 찾는다.
 *
 * 키 규칙 = 원본 server/video-routes.ts:255 가 만든 그대로:
 *   itinerary-videos/{id}/scenes/d{day}-s{sceneIndex}-p{slotId}-{a|b}-{fp}.mp4
 * 여기서는 씬을 새로 만들지 않으므로 `d{day}-s{n}-` 접두사로 훑어 sceneIndex 순으로 세운다.
 *
 * 근거: r2/api.md list({ prefix }) = 접두사로 훑기. 씬은 많아야 10개라 한 번이면 된다.
 */
async function listSceneUrls(
  bucket: R2Bucket,
  publicBase: string,
  itineraryId: number,
  day: number,
): Promise<string[]> {
  const prefix = `itinerary-videos/${itineraryId}/scenes/d${day}-s`;
  const listed = await bucket.list({ prefix, limit: 1000 });
  const byIndex: { index: number; key: string }[] = [];
  for (const o of listed.objects) {
    // d{day}-s{sceneIndex}- 에서 sceneIndex 만 뽑는다.
    const m = o.key.slice(prefix.length).match(/^(\d+)-/);
    if (!m) continue;
    byIndex.push({ index: parseInt(m[1], 10), key: o.key });
  }
  // 같은 씬이 여러 벌이면(핑거프린트가 다른 재시도본) 첫 벌만 쓴다 = 순서·개수 안정.
  const seen = new Set<number>();
  return byIndex
    .sort((a, b) => a.index - b.index)
    .filter((x) => (seen.has(x.index) ? false : (seen.add(x.index), true)))
    .map((x) => `${publicBase.replace(/\/+$/, "")}/${x.key}`);
}

export function registerVideoGenerateRoutes(
  app: Express,
  openDb: OpenDb,
): void {
  // ── 원본 server/video-routes.ts:110 POST /api/itineraries/:id/video/generate ──
  app.post(
    "/api/itineraries/:id/video/generate",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      let closed = false;
      const closeOnce = () => {
        if (!closed) {
          closed = true;
          close();
        }
      };
      try {
        // 원본 :114-122
        const id = parseInt(String(req.params.id));
        const day = parseInt(req.body?.day);
        if (isNaN(id) || isNaN(day) || day < 1)
          return res
            .status(400)
            .json({ error: "itinerary id + body.day 필요" });

        // 원본 :124-130 = 여정 + 그 날짜 슬롯이 있어야 한다.
        const [itin] = await db
          .select({
            id: itineraries.id,
            rawData: itineraries.rawData,
            videoByDay: itineraries.videoByDay,
          })
          .from(itineraries)
          .where(eq(itineraries.id, id));
        const slots: unknown[] | undefined = (
          itin?.rawData as { days?: { places?: unknown[] }[] } | null
        )?.days?.[day - 1]?.places;
        if (!itin || !slots?.length)
          return res
            .status(404)
            .json({ error: `여정 ${id} day ${day} 슬롯 없음` });

        // 원본 :132-138 = 이미 생성 중이면 409(단, 15분 넘게 멈춘 건 다시 받아준다).
        const existing = itin.videoByDay?.[String(day)];
        if (existing?.status === "processing" && !isStaleProcessing(existing))
          return res
            .status(409)
            .json({ error: "이미 생성 중", taskId: existing.taskId });

        // 원본 :140
        const taskId = `ghibli_${id}_d${day}_${Date.now()}`;

        // 원본 :143-147 = 영상 만들기는 로그인 필수.
        const requesterUserId = getUserIdFromReq(req);
        if (!requesterUserId)
          return res.status(401).json({ error: "로그인 필요" });

        // 🪙 원본 :150 = 잔액 사전확인(차감 0). 차감은 완성 시점(원본 :349).
        //    반드시 응답을 내보내기 전에 = 402 를 보낼 수 있는 마지막 지점(§9 금지 4번).
        if (!(await precheckDayVideo(db, res, requesterUserId))) return;

        // 원본 :152-160
        const sceneSlots = slots.slice(0, MAX_SCENES);
        const totalScenes = sceneSlots.length;
        await setDayVideo(db, id, day, {
          status: "processing",
          url: null,
          taskId,
          scenesDone: 0,
          totalScenes,
        });

        // 원본 :161 은 모듈 변수를 읽었다. Worker 는 isolate 가 여러 벌이라 표에서 읽는다
        // (routes-video-config.ts:readOptionMode = 이미 1벌로 통일된 조회 = §19).
        const useOptionB = (await readOptionMode(db)) === "optionB";

        // 원본 :162-170 = 응답 본문·상태코드·필드 그대로.
        res.status(202).json({
          taskId,
          day,
          totalScenes,
          estimatedCostUsd: (useOptionB
            ? totalScenes * B_COST_PER_SCENE_USD
            : totalScenes * SCENE_SECONDS * COST_PER_SECOND_USD
          ).toFixed(2),
        });

        // ⚠️ Hyperdrive gotchas "don't hold connections during external calls"
        //    = 컨테이너가 합성하는 몇 분 동안 DB 연결을 쥐고 있으면 안 된다.
        //    여기서 닫고, 뒷일에서는 새로 연다(선례 = routes-gemini.ts:513 closeOnce).
        closeOnce();

        // 원본 :172 `void (async () => {...})()` 자리.
        // Workers 는 응답 뒤 실행이 끊기므로 waitUntil 에 넘겨 붙든다.
        // 무거운 합성은 컨테이너가 하고, 여기서는 기다렸다가 결과만 기록한다.
        waitUntil(
          runStitch(openDb, id, day, taskId, totalScenes, requesterUserId),
        );
      } catch (error) {
        // 원본 :392-395
        console.error("[video] generate 오류:", error);
        if (!res.headersSent)
          res.status(500).json({ error: "영상 생성 시작 실패" });
      } finally {
        closeOnce();
      }
    },
  );
}

/**
 * 원본 server/video-routes.ts:172-391 의 뒷일 중 **합성·기록·차감·게시** 부분.
 * (씬 생성 :235-329 = 유료 외부호출이라 이번 범위 밖 = 파일머리 주석 참조.)
 */
async function runStitch(
  openDb: OpenDb,
  id: number,
  day: number,
  taskId: string,
  totalScenes: number,
  requesterUserId: string,
): Promise<void> {
  try {
    const publicBase = process.env.R2_PUBLIC_URL;
    // 원본 :175-178 과 같은 뜻 = 저장할 곳이 없으면 시작 전에 멈춘다(헛수고·비용 0).
    if (!publicBase)
      throw new Error(
        "저장 창고(R2) 공개주소 미설정 = 영상을 만들어도 저장할 수 없어 시작 전 중단(관리자: wrangler vars 확인)",
      );

    const bucket = env.RAW_BUCKET;
    const sceneUrls = await listSceneUrls(bucket, publicBase, id, day);
    // 원본 :334-335 = 이어붙일 클립이 하나도 없으면 실패.
    if (!sceneUrls.length)
      throw new Error("모든 씬 생성 실패 = 완성할 클립 없음");

    console.log(
      `[video] ${taskId} 성공 씬 ${sceneUrls.length}/${totalScenes} = 완성 진행`,
    );

    // 합성 = 컨테이너. 여정·날짜별로 인스턴스를 나눠(같은 날짜의 재시도는 같은 인스턴스로)
    // 서로 다른 작업이 한 컨테이너에 몰리지 않게 한다.
    // 근거: containers/reference/container-class/ getContainer(binding, name)
    //   "Use this when you want one container per logical entity ... identified by a stable name."
    const containerRes = await getContainer(
      env.VIDEO_STITCH_CONTAINER,
      `stitch-${id}-d${day}`,
    ).fetch(
      new Request("https://stitch.internal/stitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itineraryId: id,
          day,
          sceneUrls,
          sceneSeconds: SCENE_SECONDS,
        }),
      }),
    );

    if (!containerRes.ok) {
      // 컨테이너가 남긴 실패 사유를 그대로 올린다(뭉개기 금지 = 원본 :381 과 같은 뜻).
      const detail = await containerRes.text().catch(() => "");
      let msg = detail;
      try {
        msg = (JSON.parse(detail) as { error?: string }).error || detail;
      } catch {
        /* JSON 이 아니면 본문 그대로 쓴다 */
      }
      throw new Error(msg || `합성 실패(HTTP ${containerRes.status})`);
    }

    // 원본 video-stitcher.ts:65-70 이 하던 R2 업로드 = 여기(Worker)에서 바인딩으로 한다.
    // 키·contentType 은 원본 :66-68 과 같다.
    const key = `itinerary-videos/${id}/day${day}.mp4`;
    await bucket.put(key, await containerRes.arrayBuffer(), {
      httpMetadata: { contentType: "video/mp4" },
    });
    // 원본 r2-client.ts:43 getR2PublicUrl = `${R2_PUBLIC_URL}/${key}`.
    const url = `${publicBase.replace(/\/+$/, "")}/${key}`;

    const done = openDb();
    try {
      // 원본 :340-347
      await setDayVideo(done.db, id, day, {
        status: "succeeded",
        url,
        taskId,
        scenesDone: sceneUrls.length,
        totalScenes: sceneUrls.length,
      });

      // 🪙 원본 :348-358 = 차감 = 완성·게시 시점, 성공 씬 ≥ min(6, 요청 씬수)만 유료.
      if (sceneUrls.length >= Math.min(6, totalScenes)) {
        await chargeDayVideoOnSuccess(done.db, requesterUserId, taskId);
      } else {
        console.log(
          `[video] ${taskId} 성공 씬 ${sceneUrls.length} < ${Math.min(6, totalScenes)} = 무료 게시(차감 없음)`,
        );
      }

      // 원본 :360-375 = 신청자 프로필에 자동 게시(created_at 도 재생성 시 갱신).
      await done.db
        .insert(savedVideos)
        .values({ userId: requesterUserId, itineraryId: id, day, isNew: true })
        .onConflictDoUpdate({
          target: [
            savedVideos.userId,
            savedVideos.itineraryId,
            savedVideos.day,
          ],
          set: { isNew: true, createdAt: sql`now()` },
        })
        .catch((pubErr: unknown) =>
          console.error(
            `[video] ${taskId} 자동게시 실패:`,
            (pubErr as { message?: string })?.message,
          ),
        );
    } finally {
      done.close();
    }
    console.log(`[video] ${taskId} 완료: ${url}`);
  } catch (e) {
    // 원본 :379-390 = 실패 사유를 DB 에 그대로 기록(화면이 그대로 표시 = 뭉개기 금지 SSOT).
    console.error(`[video] ${taskId} 실패:`, e);
    const fail = openDb();
    try {
      await setDayVideo(fail.db, id, day, {
        status: "failed",
        url: null,
        taskId,
        scenesDone: 0,
        totalScenes,
        error: String((e as Error)?.message || e).slice(0, 300),
      });
    } catch (dbErr) {
      console.error(
        `[video] ${taskId} 실패기록 실패:`,
        (dbErr as { message?: string })?.message,
      );
    } finally {
      fail.close();
    }
  }
}
