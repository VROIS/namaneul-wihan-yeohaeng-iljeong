// ⚠️ 수정금지(승인필요) 2026-08-09 = 여정 생성 라우트 1벌 (city-place-routes.ts 700줄 가드 초과로 분리).
import type { Express } from "express";
import { storage } from "./storage";
import { itineraryGenerator } from "./services/itinerary-generator";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)
import { getUserIdFromReq } from "./auth-user"; // 토큰 → userId 1벌(§16)
import { buildItineraryData } from "./itinerary-save";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 응답 직전 슬롯 해설을 (place_id, 요청언어) 번역 캐시에서 이어붙임(제미니 호출 0, 저장 안 함).
import { applyItineraryTranslations } from "./services/shared/place-translation";

export function registerItineraryGenerateRoute(app: Express): void {
  app.post("/api/routes/generate", async (req, res) => {
    try {
      const formData = req.body;

      if (!formData.destination || !formData.startDate || !formData.endDate) {
        return res.status(400).json({
          error: "destination, startDate, endDate are required",
        });
      }

      let enrichedFormData: Record<string, any> = {
        ...formData,
        language: formData.language || "ko", // 일정 생성 출력 언어 (기본 한국어)
      };

      if (formData.userId) {
        try {
          const [user] = await db
            .select({
              birthDate: users.birthDate,
              displayName: users.displayName,
              preferredVibes: users.preferredVibes,
              preferredLanguage: users.preferredLanguage,
            })
            .from(users)
            .where(eq(users.id, formData.userId));

          if (user) {
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate, // 🎯 핵심: 가족 연령 추정용
              userDisplayName: user.displayName,
              language: formData.language || user.preferredLanguage || "ko",
            };

            console.log(
              `[Routes] 🎯 사용자 정보 조회 완료: userId=${formData.userId}, birthDate=${user.birthDate}`,
            );
          }
        } catch (userError) {
          console.warn(
            "[Routes] 사용자 정보 조회 실패 (계속 진행):",
            userError,
          );
        }
      }

      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만.**
      //   ⚠️ 수정금지(승인필요) 2026-07-30 §0 = 차감 기준 신원은 **로그인 토큰에서만** 읽는다.
      const isPinnedDbOnly = !!(
        Array.isArray(formData.pinnedPlaceIds) && formData.pinnedPlaceIds.length
      );
      const payerId = getUserIdFromReq(req);
      if (
        !isPinnedDbOnly &&
        !(await precheckFeature(res, payerId, "route_generate"))
      )
        return;

      // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **만드는 순간 DB에 '만드는 중' 한 줄을 남긴다.**
      let draftId: number | null = null;
      if (payerId) {
        try {
          const row = await storage.createItinerary({
            userId: payerId,
            title: String(formData.destination || "여정"),
            startDate: new Date(formData.startDate),
            endDate: new Date(formData.endDate),
            status: "generating",
          } as any);
          draftId = row?.id ?? null;
        } catch (e) {
          console.error(
            "[Routes] '만드는 중' 자리 생성 실패(생성은 계속):",
            (e as Error)?.message,
          );
        }
      }

      let itinerary: any;
      try {
        itinerary = await itineraryGenerator.generate(enrichedFormData);
      } catch (genErr) {
        if (draftId)
          await storage
            .updateItinerary(draftId, {
              status: "failed",
              rawData: { error: String((genErr as Error)?.message || genErr) },
            } as any)
            .catch(() => {});
        throw genErr;
      }

      const debugInfo = {
        daysCount: itinerary?.days?.length || 0,
        placesPerDay:
          itinerary?.days?.map((d: any) => ({
            day: d.day,
            placesCount: d.places?.length || 0,
            placeNames: d.places?.slice(0, 3).map((p: any) => p.name) || [],
          })) || [],
        totalPlaces: itinerary?.metadata?.totalPlaces || 0,
        pipelineVersion: itinerary?.metadata?._pipelineVersion || "unknown",
        totalMs: itinerary?.metadata?._totalMs || 0,
      };
      console.log(`[Routes] 📊 일정 생성 완료:`, JSON.stringify(debugInfo));

      const totalPlacesInDays = debugInfo.placesPerDay.reduce(
        (sum: number, d: any) => sum + d.placesCount,
        0,
      );
      if (totalPlacesInDays === 0) {
        console.error(
          `[Routes] ❌ 경고: 모든 day의 places가 비어있습니다! schedule이 비었을 수 있음`,
        );
      }

      // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = 다 만든 여정을 **그 자리(위에서 만든 행)에 채운다.**
      if (draftId) {
        try {
          const data = await buildItineraryData({
            userId: payerId,
            title: itinerary?.title || String(formData.destination || "여정"),
            startDate: formData.startDate,
            endDate: formData.endDate,
            travelStyle: formData.travelStyle,
            rawData: itinerary,
          });
          await storage.updateItinerary(draftId, {
            ...data,
            status: "draft", // 아직 사용자가 [저장]을 누르지 않은 상태(누르면 'saved')
          } as any);
        } catch (e) {
          console.error(
            "[Routes] 만든 여정 저장 실패(여정은 그대로 응답):",
            (e as Error)?.message,
          );
        }
      }

      if (!isPinnedDbOnly && totalPlacesInDays > 0)
        await chargeOnSuccess(payerId, "route_generate", {
          referenceId: draftId ? String(draftId) : undefined,
          tag: "여정 생성",
        });

      res.json(
        await applyItineraryTranslations(
          draftId ? { ...itinerary, itineraryId: draftId } : itinerary,
          enrichedFormData.language,
        ),
      );
    } catch (error: any) {
      console.error("Error generating itinerary:", error?.message || error);

      if (error?.message?.includes("API") || error?.message?.includes("키")) {
        res.status(503).json({
          error: "AI 서비스 연결 오류",
          detail: error.message,
          suggestion: "관리자 대시보드에서 API 키를 확인해주세요.",
        });
      } else {
        res.status(500).json({
          error: "일정 생성 실패",
          detail: error?.message || "Unknown error",
          stack: (error?.stack || "").substring(0, 300),
        });
      }
    }
  });
}
