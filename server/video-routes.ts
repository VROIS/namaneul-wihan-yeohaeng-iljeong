// ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 지브리 일별 여행영상 백엔드 실배선 1벌 (docs/여정 미리보기 영상 구현.md)
// = POST {day} → Gemini 스토리보드 1콜(전데이터 제공) → Omni 씬 병렬 생성(캐릭터 3장 첨부) → ffmpeg 결합 → Storage → video_by_day 갱신.
// = 키 = issueApiKey 출입증(apipass)만. 옛 목업(샘플 mp4·가짜 성공·폴백 여정) = 완전 폐기 2026-07-22 §19.

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { pool } from "./db";
import type { DayVideo } from "../shared/schema";
import { issueApiKey } from "./services/shared/issue-api-key";
import {
  buildGhibliStoryboard,
  sceneClipPrompt,
  sceneStillPrompt,
  scenePhotoMotionPrompt,
  narratorFromCast,
  MAX_SCENES,
  SCENE_SECONDS,
} from "./services/ghibli-travel-storyboard";
import {
  generateSceneClip,
  animateStillToClip,
} from "./services/shared/video-gen-client";
import { composeSceneStill } from "./services/shared/image-gen-client";
import { stitchAndUpload } from "./services/video-stitcher";

const COST_PER_SECOND_USD = 0.101; // A안 = Omni Flash 720p (5,792tok/초 × $17.5/1M)
const B_COST_PER_SCENE_USD = 0.35; // B안 = 나노바나나 스틸 $0.045 + Veo Lite 6초 $0.30

// 관리자 A/B 토글 = 사장님 SSOT 2026-07-23: **디폴트 = B(실사 포토무비, 씬당 $0.35 = 원가 절감)**, 필요시 대시보드에서 A(지브리풍) 전환
let adminVideoOptionMode: "optionA" | "optionB" = "optionB";

// 죽은 파이프라인 판정 = 202 후 백그라운드 중 서버 사망(재배포·autoscale 회수) 시 processing 영구 고착 방지 (§22 code-review 2026-07-22).
// taskId 끝 세그먼트 = 시작 Date.now → 폴링상한(10분)+여유보다 오래된 processing = 죽음 = 재생성 허용 + 조회 시 failed 로 표시.
const STALE_PROCESSING_MS = 15 * 60 * 1000;
function isStaleProcessing(v: DayVideo | undefined): boolean {
  if (v?.status !== "processing") return false;
  const ts = Number(v.taskId?.split("_").pop());
  return !ts || Date.now() - ts > STALE_PROCESSING_MS;
}

/** video_by_day 의 해당 day 만 원자적 병합 갱신 (다른 day 보존) */
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
  // 1. 관리자 옵션 토글
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

  // 2. 일별 영상 생성 (유료 = Omni Flash. 해당 day processing 중 = 409 이중지출 차단)
  app.post(
    "/api/itineraries/:id/video/generate",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        const day = parseInt(req.body?.day);
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
        const sceneSlots = slots.slice(0, MAX_SCENES);
        const totalScenes = sceneSlots.length;
        await setDayVideo(id, day, {
          status: "processing",
          url: null,
          taskId,
          scenesDone: 0,
          totalScenes,
        });
        // A(optionA) = Omni 지브리 직행 / B(optionB) = 실사 포토무비(나노바나나 스틸 → Veo Lite 사진→영상) = 관리자 토글 분기
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

        // 백그라운드 파이프라인 (응답 후 진행, 진행률 = video_by_day.scenesDone 폴링)
        void (async () => {
          try {
            const today = new Date().toISOString().slice(0, 10);
            // 메인앱 city_id(cities)는 발굴 도시 테이블과 별개 체계 = 출입증은 null(런타임) 발급 (2026-07-22 실측: id 직전달 = 가짜도시 차단)
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
            const sb = await buildGhibliStoryboard({
              itinerary: meta,
              user,
              day,
              slots: sceneSlots,
              apiKey,
            });
            // 데이터 소스 = 사장님 SSOT 2026-07-23: 대사 = editorial_summary / 카드 요약 = summary_ko / 카드 장소명 = name_local
            sb.scenes.forEach((s, i) => {
              const es = sceneSlots[i]?.editorialSummary;
              if (es) s.narrationKo = es; // 나레이션 = 우리 DB 문구 그대로(톤앤매너 통일, Gemini 창작 대사 폐기)
            });
            const scenesMeta = sb.scenes.map((s, i) => ({
              placeName:
                sceneSlots[i]?.nameLocal || sceneSlots[i]?.name || s.placeName,
              summary: sceneSlots[i]?.summaryKo || "",
            }));
            const narrator = narratorFromCast(sb.cast); // 나레이터 음색 = 출연진 연령대·성별 연동
            let done = 0;
            const clips = await Promise.all(
              sb.scenes.map(async (scene, i) => {
                let buf: Buffer;
                if (useOptionB) {
                  // B = ①실사진+캐릭터 합성 스틸 → ②Veo Lite 첫프레임 영상 (일관성 = 스틸이 보장)
                  const slotImage = sceneSlots[i]?.image;
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
                    scenePhotoMotionPrompt(scene, narrator),
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
                    sceneClipPrompt(scene, narrator),
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
                // await = 진행률 쓰기가 최종 succeeded 쓰기를 늦게 덮는 레이스 차단 (§22 code-review)
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
              }),
            );
            const url = await stitchAndUpload(clips, id, day);
            await setDayVideo(id, day, {
              status: "succeeded",
              url,
              taskId,
              scenesDone: totalScenes,
              totalScenes,
              scenes: scenesMeta,
            });
            console.log(
              `[video] ${taskId} 완료(${useOptionB ? "B실사포토무비" : "A지브리"}): ${url}`,
            );
          } catch (e) {
            console.error(`[video] ${taskId} 실패:`, e);
            await setDayVideo(id, day, {
              status: "failed",
              url: null,
              taskId,
              scenesDone: 0,
              totalScenes,
            });
          }
        })();
      } catch (error) {
        console.error("[video] generate 오류:", error);
        res.status(500).json({ error: "영상 생성 시작 실패" });
      }
    },
  );

  // 3. 일별 영상 상태 조회 (폴링 = 진행률·완료 URL)
  app.get("/api/itineraries/:id/video", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "잘못된 id" });
      const itin = await storage.getItinerary(id);
      if (!itin) return res.status(404).json({ error: "여정 없음" });
      // 죽은 processing = failed 로 표시 변환 = FE 무한 폴링 탈출 + 재시도 버튼 노출 (재생성은 generate 의 stale 허용이 담당)
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
}
