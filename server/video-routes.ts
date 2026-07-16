// ⚠️ 2026-07-16 = Kling/Seedance(BytePlus) 영상생성 방향 폐기 확정 = klingai.ts·seedance-video-generator.ts·test-video-ui.ts 완전삭제(§19)
//   테스트 UI + 503 봉쇄 스텁 4개(prompts/test-prompt/generate/generate-direct) 삭제.
//   남은 2 라우트는 외부 API 의존 끊고 DB(videoTaskId/videoStatus/videoUrl)만 read-only 조회 = 5단계 Gemini Omni Flash 재배선 대상으로 컬럼·라우트 골격 보존.
//   ⚠️ 동작변경: pending 상태 시 외부 API 재조회 후 DB 갱신하던 분기 삭제(외부 API 자체 삭제로 무의미, 2026-07-16 §19) = 이제 videoStatus 는 DB 값 그대로 응답. pending 잔존 행은 5단계 재배선 시 정리.
import type { Express } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { itineraries } from "../shared/schema";
import { eq } from "drizzle-orm";

export function registerVideoRoutes(app: Express): void {
  // 🎬 영상 작업 상태 조회 (taskId → DB videoTaskId 역조회, DB read-only)
  app.get("/api/video/task/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).json({ error: "taskId is required" });
      }

      const [itinerary] = await db
        .select()
        .from(itineraries)
        .where(eq(itineraries.videoTaskId, taskId))
        .limit(1);

      if (!itinerary) {
        return res.status(404).json({ error: "Task not found" });
      }

      res.json({
        success: true,
        status: itinerary.videoStatus,
        videoUrl: itinerary.videoUrl,
        taskId: itinerary.videoTaskId,
      });
    } catch (error) {
      console.error("[Video Task] Error:", error);
      res
        .status(500)
        .json({ error: "Failed to get task status", details: String(error) });
    }
  });

  app.get("/api/itineraries/:id/video", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const itinerary = await storage.getItinerary(id);

      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      // 영상 생성을 요청한 적이 없는 경우
      if (!itinerary.videoTaskId && !itinerary.videoStatus) {
        return res.json({ status: "not_started", videoUrl: null });
      }

      // processing 상태 (다중 장면 백그라운드 생성 중)
      if (itinerary.videoStatus === "processing") {
        return res.json({
          status: "processing",
          videoUrl: null,
          message: "영상 생성 중... (여러 장면을 순차 생성합니다)",
        });
      }

      // succeeded / partial / failed / pending 등 나머지 = DB 값 그대로 응답
      res.json({
        status: itinerary.videoStatus || "pending",
        videoUrl: itinerary.videoUrl,
        taskId: itinerary.videoTaskId,
      });
    } catch (error) {
      console.error("Error fetching video status:", error);
      res.status(500).json({ error: "Failed to fetch video status" });
    }
  });
}
