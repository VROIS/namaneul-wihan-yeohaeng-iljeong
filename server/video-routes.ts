// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 지브리 일별 여행영상 백엔드 실배선 1벌 (docs/여정 미리보기 영상 구현.md)
// = 2026-07-23 사장님 SSOT: 씬 하나 실패해도 전체 폐기 금지 = 성공한 씬만 모아 완성(사용자 무한대기 방지). 카드 요약 = 슬롯 summaryKo 없으면 PSR.summary_ko 직조회(name_local 과 동일).

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import crypto from "crypto";
import { pool } from "./db";
import type { DayVideo } from "../shared/schema";
import { issueApiKey } from "./services/shared/issue-api-key";
import {
  buildGhibliStoryboard,
  sceneClipPrompt,
  sceneStillPrompt,
  scenePhotoMotionPrompt,
  narratorFromCast,
  normalizeVideoLang,
  MAX_SCENES,
  SCENE_SECONDS,
} from "./services/ghibli-travel-storyboard";
import {
  generateSceneClip,
  animateStillToClip,
} from "./services/shared/video-gen-client";
import { composeSceneStill } from "./services/shared/image-gen-client";
import { stitchAndUpload } from "./services/video-stitcher";
// ⚠️ 2026-08-07 사장님 승인 = 씬 낱개 즉시 R2 보존 + 재시도 재활용 + 열쇠 사전검사(런던 121 €1.58 유출 재발 방지)
import {
  uploadToR2,
  getFromR2,
  isR2Configured,
} from "./services/shared/r2-client";
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 상황판 2026-08-06)
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)

const COST_PER_SECOND_USD = 0.101; // A안 = Omni Flash 720p (5,792tok/초 × $17.5/1M)
const B_COST_PER_SCENE_USD = 0.35; // B안 = 나노바나나 스틸 $0.045 + Veo Lite 6초 $0.30

// 관리자 A/B 토글 = 사장님 SSOT 2026-07-23: **디폴트 = B(실사 포토무비, 씬당 $0.35 = 원가 절감)**, 필요시 대시보드에서 A(지브리풍) 전환
let adminVideoOptionMode: "optionA" | "optionB" = "optionB";

const STALE_PROCESSING_MS = 15 * 60 * 1000;
//   2026-08-23 Tier 2 승격(사장님 콘솔 실측) = Veo RPM 4·RPD 50 = 분당 한도는 그대로라 동시 4 유지, 하루 한도만 10→50 편으로 풀림(9씬 ≈ 하루 5편).
const SCENE_CONCURRENCY = 4;

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
function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}

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

export function registerVideoRoutes(app: Express): void {
  app.get("/api/admin/video-config", (_req: Request, res: Response) => {
    res.json({ success: true, currentOptionMode: adminVideoOptionMode });
  });
  app.post("/api/admin/video-config", (req: Request, res: Response) => {
    const { optionMode } = req.body;
    if (optionMode !== "optionA" && optionMode !== "optionB")
      return res.status(400).json({ error: "optionMode = optionA | optionB" });
    adminVideoOptionMode = optionMode;
    res.json({ success: true, updatedOptionMode: adminVideoOptionMode });
  });

  app.post(
    "/api/itineraries/:id/video/generate",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(String(req.params.id));
        const day = parseInt(req.body?.day);
        // 2026-08-22 사장님 승인 = 영상 다국어 = FE가 보낸 앱 언어(미전달·미지원 = ko = 동작 무변경)
        const lang = normalizeVideoLang(req.body?.language);
        if (isNaN(id) || isNaN(day) || day < 1)
          return res
            .status(400)
            .json({ error: "itinerary id + body.day 필요" });
        if (!pool) return res.status(500).json({ error: "DB 미연결" });

        const itin = await storage.getItinerary(id);
        const slots: any[] | undefined = (itin?.rawData as any)?.days?.[day - 1]
          ?.places;
        if (!itin || !slots?.length)
          return res
            .status(404)
            .json({ error: `여정 ${id} day ${day} 슬롯 없음` });

        const existing = (itin as any).videoByDay?.[String(day)] as
          | DayVideo
          | undefined;
        if (existing?.status === "processing" && !isStaleProcessing(existing))
          return res
            .status(409)
            .json({ error: "이미 생성 중", taskId: existing.taskId });

        const taskId = `ghibli_${id}_d${day}_${Date.now()}`;

        // 📥 신청자 = 완료 자동게시 대상 (2026-08-03 사장님 확정 = 완성되면 신청자 프로필에 자동 게시 + 탭 뱃지).
        const requesterUserId = getUserIdFromReq(req);

        // 🔒 수정금지(승인필요) 2026-08-05 사장님 SSOT = 영상 만들기 = **로그인 필수**.
        if (!requesterUserId)
          return res.status(401).json({ error: "로그인 필요" });

        // 🪙 2026-08-06 사장님 승인 = **성공 시점 차감**으로 이동(런던 121 사고 = 실패했는데 60 증발 근본해결).
        if (!(await precheckFeature(res, requesterUserId, "day_video"))) return;

        const sceneSlots = slots.slice(0, MAX_SCENES);
        const totalScenes = sceneSlots.length;
        await setDayVideo(id, day, {
          status: "processing",
          url: null,
          taskId,
          scenesDone: 0,
          totalScenes,
        });
        const useOptionB = adminVideoOptionMode === "optionB";
        res.status(202).json({
          taskId,
          day,
          totalScenes,
          estimatedCostUsd: (useOptionB
            ? totalScenes * B_COST_PER_SCENE_USD
            : totalScenes * SCENE_SECONDS * COST_PER_SECOND_USD
          ).toFixed(2),
        });

        void (async () => {
          try {
            // ⚠️ 2026-08-07 사장님 승인 = 저장 열쇠 없으면 씬 생성(유료) 전에 즉시 실패 = 비용 유출 0
            if (!isR2Configured())
              throw new Error(
                "저장 창고(R2) 열쇠 미등록 = 영상을 만들어도 저장할 수 없어 시작 전 중단(관리자: Replit Secrets 확인)",
              );
            const today = new Date().toISOString().slice(0, 10);
            const apiKey = await issueApiKey(
              pool,
              "GEMINI_API_KEY",
              null,
              today,
              true,
            );
            const user = itin.userId
              ? await storage.getUser(itin.userId)
              : null;
            const { rawData: _omit, ...meta } = itin as any;
            // ⚠️ 2026-08-22 사장님 승인(A+B+C) = 캐스팅 재료(누구랑·인원·나이) = rawData(생성 산출물=진실) 우선(읽을 때 조립).
            for (const k of [
              "companionType",
              "companionCount",
              "companionAges",
            ])
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
            const scenesMeta = sb.scenes.map((s, i) => {
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
            });
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
                      sceneStillPrompt(
                        scene,
                        sb.cast.totalTravelerCount,
                        !!slotImage,
                      ),
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
                  console.error(
                    `[video] ${taskId} 씬${scene.sceneIndex} 실패(제외):`,
                    (sceneErr as Error)?.message,
                  );
                  return null;
                }
              },
            );
            const clips = rawClips.filter((b): b is Buffer => b != null);
            const okScenesMeta = scenesMeta.filter(
              (_, i) => rawClips[i] != null,
            );
            if (!clips.length)
              throw new Error("모든 씬 생성 실패 = 완성할 클립 없음");
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
              error: String((e as Error)?.message || e).slice(0, 300),
            });
          }
        })();
      } catch (error) {
        console.error("[video] generate 오류:", error);
        res.status(500).json({ error: "영상 생성 시작 실패" });
      }
    },
  );

  app.get("/api/itineraries/:id/video", async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "잘못된 id" });
      const itin = await storage.getItinerary(id);
      if (!itin) return res.status(404).json({ error: "여정 없음" });
      const videoByDay: Record<string, DayVideo> = {
        ...((itin as any).videoByDay || {}),
      };
      for (const [d, v] of Object.entries(videoByDay)) {
        if (isStaleProcessing(v)) videoByDay[d] = { ...v, status: "failed" };
      }
      res.json({ videoByDay, optionMode: adminVideoOptionMode });
    } catch (error) {
      console.error("[video] 상태조회 오류:", error);
      res.status(500).json({ error: "상태 조회 실패" });
    }
  });

  // ── 4. 저장한 영상 = 프로필 담기 (2026-08-03 사장님 확정) ──────────────────────

  //   ⚠️ 2026-08-06 사장님 승인 = **관리자 = 전체 상황판** = 모든 사용자의 담긴 영상(콘텐츠 소유권 = 회사).
  app.get("/api/videos/saved", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      if (!pool) return res.status(500).json({ error: "DB 미연결" });
      const isAdmin = (await getRoleFromDb(userId)) === "admin";
      const r = await pool.query(
        // ⚠️ 수정금지(승인필요) 2026-08-21 사장님 승인 = city_name_en = 읽을 때 이어붙이는 도시 영문명(§16).
        `SELECT sv.itinerary_id, sv.day, sv.is_new, sv.created_at,
                i.title, i.start_date, c.name_en AS city_name_en
           FROM saved_videos sv
           JOIN itineraries i ON i.id = sv.itinerary_id
           LEFT JOIN cities c ON c.id = i.city_id
          WHERE ($2 OR sv.user_id = $1)
            AND i.video_by_day -> (sv.day::text) ->> 'status' = 'succeeded'
          ORDER BY sv.is_new DESC, sv.created_at DESC, sv.day`,
        [userId, isAdmin],
      );
      res.json(
        r.rows.map((row) => ({
          itineraryId: row.itinerary_id,
          day: row.day,
          isNew: row.is_new,
          title: row.title,
          cityNameEn: row.city_name_en, // 화면이 제목의 도시명을 이 값으로 갈아끼운다(§16)
          startDate: row.start_date,
          savedAt: row.created_at,
        })),
      );
    } catch (error) {
      console.error("[video] 저장목록 오류:", error);
      res.status(500).json({ error: "저장 목록 조회 실패" });
    }
  });

  app.post("/api/videos/save", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      if (!pool) return res.status(500).json({ error: "DB 미연결" });
      const itineraryId = parseInt(req.body?.itineraryId);
      const day = parseInt(req.body?.day);
      if (isNaN(itineraryId) || isNaN(day) || day < 1)
        return res.status(400).json({ error: "itineraryId + day 필요" });
      const chk = await pool.query(
        `SELECT 1 FROM itineraries
          WHERE id = $1 AND video_by_day -> ($2::text) ->> 'status' = 'succeeded'`,
        [itineraryId, String(day)],
      );
      if (!chk.rowCount)
        return res.status(404).json({ error: "완성된 영상이 없는 날짜" });
      await pool.query(
        `INSERT INTO saved_videos (user_id, itinerary_id, day, is_new)
         VALUES ($1, $2, $3, false)
         ON CONFLICT ON CONSTRAINT saved_videos_user_itin_day_uniq DO NOTHING`,
        [userId, itineraryId, day],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[video] 담기 오류:", error);
      res.status(500).json({ error: "저장 실패" });
    }
  });

  app.get("/api/videos/badge", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId || !pool) return res.json({ count: 0 });
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM saved_videos WHERE user_id = $1 AND is_new`,
        [userId],
      );
      res.json({ count: r.rows[0]?.n || 0 });
    } catch (error) {
      console.error("[video] 뱃지 오류:", error);
      res.json({ count: 0 }); // 뱃지는 장식 = 실패가 앱을 막으면 안 됨
    }
  });

  app.post("/api/videos/seen", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "로그인 필요" });
      if (!pool) return res.status(500).json({ error: "DB 미연결" });
      const itineraryId = parseInt(req.body?.itineraryId);
      const day = parseInt(req.body?.day);
      if (isNaN(itineraryId) || isNaN(day))
        return res.status(400).json({ error: "itineraryId + day 필요" });
      await pool.query(
        `UPDATE saved_videos SET is_new = false
          WHERE user_id = $1 AND itinerary_id = $2 AND day = $3`,
        [userId, itineraryId, day],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[video] 열람해제 오류:", error);
      res.status(500).json({ error: "열람 처리 실패" });
    }
  });
}
