import type { Express } from "express";
import { storage } from "./storage";
import { generateItineraryICS, type ItineraryForICS } from "./itinerary-ics";
import { handleAiOpinionRequest } from "./services/verify/ai-opinion-handler";
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 상황판 2026-08-06)
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)
import { db } from "./db";
import { itineraries } from "../shared/schema";
import { and, eq } from "drizzle-orm";
import {
  buildItineraryData,
  computeItineraryFingerprint,
} from "./itinerary-save";
import { matchCityIdByName } from "./city-match"; // 목적지 → 도시 id 1벌(대표 지정 B1 이 씀)
import {
  attachCityNameEn,
  attachCityNameEnMany,
} from "./services/shared/itinerary-city-name";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 7개 언어 목록 1벌(§16) + 읽을 때 (place_id, language) 번역 이어붙이기(제미니 호출 0).
import { LANGS } from "./services/shared/language-instruction";
import { applyItineraryTranslations } from "./services/shared/place-translation";

export function registerItineraryRoutes(app: Express): void {
  app.patch("/api/users/:userId/preferred-language", async (req, res) => {
    try {
      const { userId } = req.params;
      const { preferredLanguage } = req.body;
      if (
        !userId ||
        !preferredLanguage ||
        typeof preferredLanguage !== "string"
      ) {
        return res
          .status(400)
          .json({ error: "userId and preferredLanguage required" });
      }
      if (!(LANGS as readonly string[]).includes(preferredLanguage)) {
        return res.status(400).json({ error: "Invalid preferredLanguage" });
      }
      const updated = await storage.updateUserLogin(userId, {
        preferredLanguage,
      });
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ success: true, preferredLanguage: updated.preferredLanguage });
    } catch (error: any) {
      console.error("Error updating preferred language:", error);
      res.status(500).json({ error: "Failed to update language" });
    }
  });

  //   ⚠️ 2026-08-06 사장님 승인 = **관리자(Bearer 토큰 role) = 전체 상황판** = 전 사용자 저장 여정(소유권 = 회사).
  app.get("/api/users/:userId/itineraries", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const isAdmin = authId
        ? (await getRoleFromDb(authId)) === "admin"
        : false;
      const rows = isAdmin
        ? await storage.getAllItineraries()
        : await storage.getUserItineraries(req.params.userId);
      res.json(await attachCityNameEnMany(rows as any[]));
    } catch (error) {
      console.error("Error fetching itineraries:", error);
      res.status(500).json({ error: "Failed to fetch itineraries" });
    }
  });

  app.get("/api/itineraries/:id", async (req, res) => {
    try {
      const itinerary = await storage.getItinerary(parseInt(req.params.id));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      const out = await attachCityNameEn(itinerary as any);
      // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 화면 언어(?lang=)로 슬롯 해설을 place_translations 캐시에서 이어붙임.
      const lang = String(req.query.lang || "ko");
      const rawData = (out as any)?.rawData;
      if (rawData?.days) {
        (out as any).rawData = await applyItineraryTranslations(rawData, lang);
      }
      res.json(out);
    } catch (error) {
      console.error("Error fetching itinerary:", error);
      res.status(500).json({ error: "Failed to fetch itinerary" });
    }
  });

  app.get("/api/itineraries/:id/calendar.ics", async (req, res) => {
    try {
      const idNum = parseInt(req.params.id);
      if (Number.isNaN(idNum)) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      const itinerary = await storage.getItinerary(idNum);
      const raw = itinerary?.rawData as ItineraryForICS | undefined;
      if (!raw?.days?.length || !raw.startDate) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      const ics = generateItineraryICS(raw);
      const filename = encodeURIComponent(
        `${raw.title || raw.destination || "trip"}.ics`,
      ).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      );
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="trip.ics"; filename*=UTF-8''${filename}`,
      );
      res.send(ics);
    } catch (error) {
      console.error("Error generating itinerary ics:", error);
      res.status(500).json({ error: "Failed to generate calendar" });
    }
  });

  // ⚠️ 사장님 SSOT 2026-07-14 = 옛 ensureAdminUser 폐기 §19. id='admin'을 못 찾아 매번 새 유저를 찍어 유령유저 69개 양산하던 버그의 근원. 여정은 본인ID로 저장 = admin 행 불필요(itineraries.user_id FK 없음).

  app.post("/api/itineraries", async (req, res) => {
    try {
      const itineraryData = await buildItineraryData(req.body);
      console.log(
        `[Itinerary] Creating itinerary for user=${itineraryData.userId}...`,
      );
      const itinerary = await storage.createItinerary(itineraryData);
      console.log(`[Itinerary] Created successfully: id=${itinerary.id}`);
      res.status(201).json(itinerary);
    } catch (error: any) {
      console.error("Error creating itinerary:", error?.message || error);
      console.error("Stack:", error?.stack);
      res
        .status(500)
        .json({ error: "Failed to create itinerary", details: error?.message });
    }
  });

  app.put("/api/itineraries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const itineraryData = await buildItineraryData(req.body);

      console.log(`[Itinerary] Updating id=${id} (재저장 덮어쓰기)...`);
      const updated = await storage.updateItinerary(id, itineraryData);
      if (!updated) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      console.log(`[Itinerary] Updated successfully: id=${updated.id}`);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating itinerary:", error?.message || error);
      res
        .status(500)
        .json({ error: "Failed to update itinerary", details: error?.message });
    }
  });

  // ⚠️ 2026-08-08 사장님 SSOT = 여정 삭제 라우트 **완전삭제** §19 (옛 2026-07-03 "X버튼 = 여정 삭제" 폐기).

  app.post("/api/itineraries/:id/representative", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });

      const userId = getUserIdFromReq(req);
      const user = userId ? await storage.getUser(userId) : undefined;
      if (user?.role !== "admin") {
        return res.status(403).json({ error: "관리자만 대표 지정 가능" });
      }

      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      const itinerary = await storage.getItinerary(id);
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }

      const cityId = await matchCityIdByName(
        (itinerary.rawData as any)?.destination,
      );
      if (cityId == null) {
        return res.status(400).json({ error: "도시 매칭 실패" });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(itineraries)
          .set({ status: "saved", updatedAt: new Date() })
          .where(
            and(
              eq(itineraries.cityId, cityId),
              eq(itineraries.status, "representative"),
            ),
          );
        await tx
          .update(itineraries)
          .set({
            status: "representative",
            cityId,
            updatedAt: new Date(),
          })
          .where(eq(itineraries.id, id));
      });

      console.log(`[Representative] 대표 지정: itinerary=${id} city=${cityId}`);
      res.json({ itineraryId: id, cityId });
    } catch (error: any) {
      console.error(
        "[Representative] 대표 지정 실패:",
        error?.message || error,
      );
      res.status(500).json({ error: "Failed to set representative" });
    }
  });

  // ⚠️ 2026-07-03 사장님 SSOT = "AI 의견" 기능. 여정을 Gemini에 통째로 보내 비평적 재평가.
  app.post("/api/itineraries/ai-opinion", async (req, res) => {
    try {
      const { itineraryId, itinerary, language } = req.body;
      if (!itinerary || !Array.isArray(itinerary.days)) {
        return res.status(400).json({ error: "itinerary(days[]) required" });
      }

      // ⚠️ 2026-07-03 사장님 SSOT = 동적 콘텐츠(AI 의견 본문) 다국어 대응. 언어가 다르면 캐시도 다시 생성해야 하므로 fp에 언어 포함.
      const fp = `${computeItineraryFingerprint(itinerary)}:${language || "ko"}`;

      let existingForCache:
        | Awaited<ReturnType<typeof storage.getItinerary>>
        | undefined;
      if (itineraryId) {
        existingForCache = await storage.getItinerary(parseInt(itineraryId));
        const cached = (existingForCache?.rawData as any)?.verification;
        if (cached && cached.fp === fp) {
          console.log(
            `[AiOpinion] 캐시 반환: itineraryId=${itineraryId} (Gemini 호출 없음)`,
          );
          return res.json({ ...cached.result, cached: true });
        }
      }

      const opinionInput = {
        destination: itinerary.destination,
        startDate: itinerary.startDate,
        endDate: itinerary.endDate,
        companionType: itinerary.companionType,
        companionCount: itinerary.companionCount,
        curationFocus: itinerary.metadata?.curationFocus,
        vibeWeights: (itinerary.vibeWeights || []).map((v: any) => ({
          vibe: v.vibe,
          weight: v.weight,
          percentage: v.percentage,
        })),
        travelStyle: itinerary.travelStyle,
        mobilityStyle: itinerary.mobilityStyle,
        // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 교통수단 = 1차 생성 매트릭스 확정값(응답 metadata, FE가 통째 보존)을 그대로 사용.
        transportCategory: (itinerary.metadata?.transportCategory === "guide" ||
        itinerary.metadata?.transportCategory === "transit"
          ? itinerary.metadata.transportCategory
          : undefined) as "guide" | "transit" | undefined,
        days: (itinerary.days || []).map((d: any) => ({
          day: d.day,
          places: (d.places || []).map((p: any) => ({
            name: p.name,
            startTime: p.startTime,
            endTime: p.endTime,
            priceEur: p.entranceFee ?? p.mealPrice,
          })),
        })),
        // ⚠️ 2026-07-03 사장님 SSOT = pipeline-v3.ts langMap 패턴 재사용 = 앱 현재 언어로 Gemini가 직접 작문(번역기 아님).
        language: language || "ko",
      };

      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만.**
      const opinionPayerId = getUserIdFromReq(req);
      if (!(await precheckFeature(res, opinionPayerId, "ai_opinion"))) return;

      const result = await handleAiOpinionRequest(opinionInput);
      if (!result.ok || !result.response) {
        return res.status(502).json({
          error: "AI opinion generation failed",
          details: result.parseError,
        });
      }

      await chargeOnSuccess(opinionPayerId, "ai_opinion", {
        referenceId: itineraryId ? String(itineraryId) : undefined,
        tag: "AI 의견",
      });

      if (itineraryId) {
        const target =
          existingForCache ||
          (await storage.getItinerary(parseInt(itineraryId)));
        if (target) {
          const rawData = {
            ...(target.rawData as any),
            verification: {
              fp,
              result: result.response,
              generatedAt: new Date().toISOString(),
            },
          };
          await storage.updateItinerary(parseInt(itineraryId), {
            rawData,
          } as any);
        }
      }

      res.json({ ...result.response, cached: false });
    } catch (error: any) {
      console.error("Error generating AI opinion:", error?.message || error);
      res.status(500).json({
        error: "Failed to generate AI opinion",
        details: error?.message,
      });
    }
  });
}
