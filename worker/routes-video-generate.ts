// ⚠️ 수정금지(승인필요) 2026-09-12 사장님 결정 = 일별 영상 = Worker 접수 + 컨테이너 생성(container/generate.ts) (정본 §)

import type { Express, Request, Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { Container, getContainer } from "@cloudflare/containers";
import { env, waitUntil } from "cloudflare:workers";
import type { DurableObject } from "cloudflare:workers";
import * as schema from "../shared/schema";
import { getUserIdFromReq } from "./auth-user";
import { precheckFeature } from "../shared/credits";
import type { DayVideo } from "../shared/schema";
import { isStaleProcessing } from "./video-stale";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };

const { itineraries } = schema;

type ContainerSecrets = {
  CONTAINER_DATABASE_URL?: string;
  CONTAINER_R2_ACCOUNT_ID?: string;
  CONTAINER_R2_ACCESS_KEY_ID?: string;
  CONTAINER_R2_SECRET_ACCESS_KEY?: string;
  CONTAINER_R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
};

export class VideoStitchContainer extends Container<Env> {
  defaultPort = 8080;
  // ⚠️ 수정금지(승인필요) 2026-09-12 판단3종 지적 = 접수 뒤 요청이 없어도 작업 최대시간(씬 폴링 10분 × 3바퀴 + 합성)까지 깨어 있어야 함 = 35m
  sleepAfter = "35m";

  constructor(ctx: DurableObject["ctx"], env0: Env) {
    super(ctx, env0);
    const e = env0 as Env & ContainerSecrets;
    this.envVars = {
      DATABASE_URL: e.CONTAINER_DATABASE_URL ?? "",
      R2_ACCOUNT_ID: e.CONTAINER_R2_ACCOUNT_ID ?? "",
      R2_ACCESS_KEY_ID: e.CONTAINER_R2_ACCESS_KEY_ID ?? "",
      R2_SECRET_ACCESS_KEY: e.CONTAINER_R2_SECRET_ACCESS_KEY ?? "",
      R2_BUCKET_NAME: e.CONTAINER_R2_BUCKET_NAME ?? "",
      R2_PUBLIC_URL: e.R2_PUBLIC_URL ?? "",
    };
  }

  override onError(error: unknown) {
    console.error("[video] 컨테이너 오류:", error);
  }
}

const MAX_SCENES = 10;

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

export function registerVideoGenerateRoutes(
  app: Express,
  openDb: OpenDb,
): void {
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
        const id = parseInt(String(req.params.id));
        const day = parseInt(req.body?.day);
        const lang = String(req.body?.language ?? "");
        if (isNaN(id) || isNaN(day) || day < 1)
          return res
            .status(400)
            .json({ error: "itinerary id + body.day 필요" });

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

        const existing = itin.videoByDay?.[String(day)];
        if (existing?.status === "processing" && !isStaleProcessing(existing))
          return res
            .status(409)
            .json({ error: "이미 생성 중", taskId: existing.taskId });

        const taskId = `ghibli_${id}_d${day}_${Date.now()}`;

        const requesterUserId = getUserIdFromReq(req);
        if (!requesterUserId)
          return res.status(401).json({ error: "로그인 필요" });

        if (!(await precheckFeature(db, res, requesterUserId, "day_video")))
          return;

        const sceneSlots = slots.slice(0, MAX_SCENES);
        const totalScenes = sceneSlots.length;
        await setDayVideo(db, id, day, {
          status: "processing",
          url: null,
          taskId,
          scenesDone: 0,
          totalScenes,
        });

        res.status(202).json({ taskId, day, totalScenes });

        closeOnce();

        waitUntil(
          startGenerate(openDb, {
            id,
            day,
            taskId,
            lang,
            requesterUserId,
            totalScenes,
          }),
        );
      } catch (error) {
        console.error("[video] generate 오류:", error);
        if (!res.headersSent)
          res.status(500).json({ error: "영상 생성 시작 실패" });
      } finally {
        closeOnce();
      }
    },
  );
}

async function startGenerate(
  openDb: OpenDb,
  job: {
    id: number;
    day: number;
    taskId: string;
    lang: string;
    requesterUserId: string;
    totalScenes: number;
  },
): Promise<void> {
  const { id, day, taskId, totalScenes } = job;
  try {
    const containerRes = await getContainer(
      env.VIDEO_STITCH_CONTAINER,
      `video-${id}-d${day}`,
    ).fetch(
      new Request("https://generate.internal/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          day,
          taskId,
          lang: job.lang,
          requesterUserId: job.requesterUserId,
        }),
      }),
    );
    if (containerRes.status !== 202) {
      const detail = await containerRes.text().catch(() => "");
      let msg = detail;
      try {
        msg = (JSON.parse(detail) as { error?: string }).error || detail;
      } catch {
        // JSON 이 아니면 본문 그대로 쓴다
      }
      throw new Error(msg || `컨테이너 접수 실패(HTTP ${containerRes.status})`);
    }
    console.log(`[video] ${taskId} 컨테이너 접수 완료`);
  } catch (e) {
    console.error(`[video] ${taskId} 접수 실패:`, e);
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
