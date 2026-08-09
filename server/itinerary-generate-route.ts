// ⚠️ 수정금지(승인필요) 2026-08-09 = 여정 생성 라우트 1벌 (city-place-routes.ts 700줄 가드 초과로 분리).
//   담긴 것 = POST /api/routes/generate 하나. 도시·장소 조회와 성격이 달라(유료 파이프라인 + 크레딧 + DB 저장) 파일을 나눈다.
import type { Express } from "express";
import { storage } from "./storage";
import { itineraryGenerator } from "./services/itinerary-generator";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)
import { getUserIdFromReq } from "./auth-user"; // 토큰 → userId 1벌(§16)
// 여정 → DB 행 변환 1벌(§16) = 저장 버튼(POST·PUT)과 **같은 것**을 쓴다.
import { buildItineraryData } from "./itinerary-save";

export function registerItineraryGenerateRoute(app: Express): void {
  // Itinerary generation
  app.post("/api/routes/generate", async (req, res) => {
    try {
      const formData = req.body;

      if (!formData.destination || !formData.startDate || !formData.endDate) {
        return res.status(400).json({
          error: "destination, startDate, endDate are required",
        });
      }

      // 🎯 사용자 정보 DB에서 조회 (birthDate 필수 - 로그인시 입력됨)
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
            // DB에서 가져온 사용자 정보 병합 (language: 일정 생성 출력 언어)
            enrichedFormData = {
              ...formData,
              birthDate: user.birthDate, // 🎯 핵심: 가족 연령 추정용
              userDisplayName: user.displayName,
              language: formData.language || user.preferredLanguage || "ko",
              // preferredVibes는 프론트에서 선택한 vibes 우선
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

      // 🪙 여정 생성 5크레딧 (2026-07-29 §9)
      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만.**
      //     여기(시작)는 잔액 **사전확인만**(차감 0) = 부족하면 402 = §9 "헤더 후 402 불가" 취지를 시작에서 충족.
      //     실제 차감 = 아래 여정이 다 만들어진 뒤. 옛 "시작 시 차감" 폐기 = 2026-08-09 §19.
      //     사유 = **우리가 손해를 보더라도 환불 분쟁 소지를 없앤다**(사장님) — 만들다 실패했는데 5크레딧이
      //     사라지면 사용자는 돈만 잃는다. 영상(video-routes.ts:164·359)이 런던 121 사고로 먼저 세운 원칙과 같은 벌.
      //   ⚠️ 수정금지(승인필요) 2026-07-30 §0 = 차감 기준 신원은 **로그인 토큰에서만** 읽는다.
      //     요청 본문의 userId 로 차감하면 그 칸을 비우는 것만으로 유료 생성이 공짜가 된다(§22 검증 지적).
      //   ⚠️ 2026-07-31 사장님 승인(BTS D단계 결정7) = 크레딧 = **외부호출 발생 시만**.
      //     고른 장소(pinnedPlaceIds) 있음 = BTS "같이 떠나요" = db-only 직행 = 외부호출 0 = 무료(차감 안 함).
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
      //   사장님 SSOT = 만들어진 여정은 저장 버튼과 무관하게 DB에 남는다
      //   (프로필에 뜨고, 지도 바로가기·해설·영상 같은 추가 기능의 원재료가 된다).
      //   'generating' 인 동안은 화면 목록에서 감춘다(storage.HIDDEN_STATUSES) = 빈 카드가 안 뜬다.
      //   ⚠️ 비로그인은 행을 만들지 않는다 = user_id 가 빈 칸이 될 수 없고, 어차피 차감도 안 한다(개발단계 게스트 개방).
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
          // 자리 만들기 실패 = 생성은 그대로 진행(사용자 경험 우선).
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
        // 실패해도 **행은 남긴다**(사장님 SSOT = DB 는 무조건 남긴다). 화면 목록에는 안 보인다(status 로 걸러짐).
        if (draftId)
          await storage
            .updateItinerary(draftId, {
              status: "failed",
              rawData: { error: String((genErr as Error)?.message || genErr) },
            } as any)
            .catch(() => {});
        throw genErr;
      }

      // 🔍 디버그: places 비어있는 문제 추적
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

      // places가 전부 비어있으면 경고
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
      //   변환은 저장 버튼이 쓰는 것과 **같은 1벌**(itinerary-save.ts) = 새로 짜지 않는다(§16).
      //   status 를 'generating' 에서 내리는 것이 핵심 = 이 순간부터 진행중 집계에서 빠지고 목록에 보인다.
      //   ⚠️ 화면에는 이 행 번호(itineraryId)를 함께 준다 = 사용자가 [저장]을 누르면 **같은 행을 덮어쓴다**(PUT).
      //     안 주면 저장 때 새 행이 또 생겨 같은 여정이 두 벌이 된다.
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

      // 🪙 차감 = **여기**(여정이 다 만들어진 시점). 위 사전확인이 이미 잔액을 봤으므로 402 는 안 난다.
      if (!isPinnedDbOnly && totalPlacesInDays > 0)
        await chargeOnSuccess(payerId, "route_generate", {
          referenceId: draftId ? String(draftId) : undefined,
          tag: "여정 생성",
        });

      res.json(draftId ? { ...itinerary, itineraryId: draftId } : itinerary);
    } catch (error: any) {
      console.error("Error generating itinerary:", error?.message || error);

      // API 키 누락 에러 구분
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
