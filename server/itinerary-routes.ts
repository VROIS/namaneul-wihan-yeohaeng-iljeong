// ⚠️ 2026-07-15 = routes.ts(1,049줄) 500줄 가드 초과 슬림화 = 순수 이동(로직 변경 없음) §0
//   담긴 라우트 = 언어설정 + 여정 CRUD 5(목록·단건·생성·재저장·삭제) + AI 의견 (예산3 = 2026-07-16 §19 완전삭제, 호출자 0 + 500크래시)
import type { Express } from "express";
import { storage } from "./storage";
import { generateItineraryICS, type ItineraryForICS } from "./itinerary-ics";
import { handleAiOpinionRequest } from "./services/verify/ai-opinion-handler";
import { getUserIdFromReq, getRoleFromDb } from "./auth-user"; // Bearer → userId·역할 단일 관문(2026-07-29 §16 / 상황판 2026-08-06)
import { chargeOnSuccess, precheckFeature } from "./credit-charge"; // 크레딧 사전확인·완성시점차감 단일 관문(2026-07-29 §9 / 1벌화 2026-08-09)
// 🏆 대표 지정(B1) 전용 = 트랜잭션(옛 대표 강등+승격 원자성)에 db 직접 필요(2026-08-01 베스트갤러리)
import { db } from "./db";
import { itineraries } from "../shared/schema";
import { and, eq } from "drizzle-orm";
// 🏙️ 목적지 문자열 → 도시 id 단일 관문(2026-08-02 §16) = 저장(POST/PUT)·대표 지정(B1)이 같은 1벌을 쓴다.
// 여정 → DB 행 변환 1벌(2026-08-09 순수 이동). 저장·재저장·생성이 같은 것을 쓴다(§16).
import {
  buildItineraryData,
  computeItineraryFingerprint,
} from "./itinerary-save";
import { matchCityIdByName } from "./city-match"; // 목적지 → 도시 id 1벌(대표 지정 B1 이 씀)
// 🏙️ 2026-08-21 = 읽을 때 도시 영문명(cities.name_en) 이어붙이기 1벌(§16) = 옛 여정도 영어 표기.
import {
  attachCityNameEn,
  attachCityNameEnMany,
} from "./services/shared/itinerary-city-name";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 7개 언어 목록 1벌(§16) + 읽을 때 (place_id, language) 번역 이어붙이기(제미니 호출 0).
import { LANGS } from "./services/shared/language-instruction";
import { applyItineraryTranslations } from "./services/shared/place-translation";

export function registerItineraryRoutes(app: Express): void {
  // ⚠️ 2026-07-16 = /api/budget/preview·calculate·compare 3개 완전삭제(§19) = client/bts-app/public 전수 grep 호출자 0
  //   + budget-calculator.ts 가 transport-pricing-service 계약(perPersonPerDay 등)과 불일치해 기존부터 500 크래시였음(사용 안 되던 죽은 코드).
  //   실제 여정 가격 = pipeline-v3-day-builder/ag4-db-finalize 가 transport-pricing-service 직접 사용(별개 경로, 무손).

  // ⚠️ 2026-05-23 = /api/routes/optimize + /compare 완전 삭제 (= 사용자 SSOT = FE 호출 0 + Google Routes API 비용 폭탄 차단)
  // = route-optimizer.ts 파일 = 함께 삭제 = 메인앱 = transit-haversine.ts (= Haversine 자체 계산 = 외부 0) 사용

  // 사용자 언어 설정 업데이트 (i18n 동기화)
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

  // Itineraries
  //   ⚠️ 2026-08-06 사장님 승인 = **관리자(Bearer 토큰 role) = 전체 상황판** = 전 사용자 저장 여정(소유권 = 회사).
  //     전문가 문의함 패턴 동형. 판정 = 토큰 신원만(경로 :userId 로는 승격 불가 = 스푸핑 차단).
  app.get("/api/users/:userId/itineraries", async (req, res) => {
    try {
      const authId = getUserIdFromReq(req);
      const isAdmin = authId
        ? (await getRoleFromDb(authId)) === "admin"
        : false;
      const rows = isAdmin
        ? await storage.getAllItineraries()
        : await storage.getUserItineraries(req.params.userId);
      // 도시 영문명 이어붙이기 1벌(§16) = 저장 안 하고 읽을 때 조립 → 옛 여정도 즉시 영어 표기.
      res.json(await attachCityNameEnMany(rows as any[]));
    } catch (error) {
      console.error("Error fetching itineraries:", error);
      res.status(500).json({ error: "Failed to fetch itineraries" });
    }
  });

  // ⚠️ 2026-05-23 = itineraries.rawData JSON 사용 (= 외래키 없음 = items 별도 SELECT 불필요)
  app.get("/api/itineraries/:id", async (req, res) => {
    try {
      const itinerary = await storage.getItinerary(parseInt(req.params.id));
      if (!itinerary) {
        return res.status(404).json({ error: "Itinerary not found" });
      }
      // 도시 영문명 이어붙이기 1벌(§16) = 저장 안 하고 읽을 때 조립 → 옛 여정도 즉시 영어 표기.
      const out = await attachCityNameEn(itinerary as any);
      // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 화면 언어(?lang=)로 슬롯 해설을 place_translations 캐시에서 이어붙임.
      //   저장 안 함(읽을 때만 조립) + 제미니 호출 0. 캐시 없는 슬롯 = 한국어 원문 그대로.
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

  // 📅 여정 .ics 서빙 (2026-07-21 캘린더 재구현 = docs/2026-07-21 여정공유·캘린더저장 명세.md)
  //   iOS = Linking.openURL(이 https URL) → Safari가 text/calendar 응답을 네이티브 "일정 추가" 미리보기로 엶 = 원탭 등록.
  //   /api 하위인 이유 = SPA 폴백(server/index.ts app.get("*"))이 /api 만 통과시킴(video 라우트와 동일 패턴).
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
      // RFC 5987 attr-char = encodeURIComponent 가 남기는 !'()* 도 %인코딩(제목에 ' 포함돼도 헤더 유효)
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

  // ⚠️ 2026-07-03 = 복원한 여정 재저장(숙소변경→동선변경) = 같은 행 덮어쓰기(여정1→여정1.1). 없는 id면 404. 새 여정은 POST(새 행).
  app.put("/api/itineraries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      // 🧠 2026-07-04 = AI 의견 캐시 봉인은 buildItineraryData 단일 지점(§16). 재저장 시 FE가 verificationResult를 실으면
      //   현재 내용 fp로 재봉인(내용 안 바뀌면 같은 fp = 캐시 유지, 바뀌면 새 fp = 다음 클릭에 정상 재호출). 옛 fp 보존 분기 폐기 §19(그 분기는
      //   newFp에 :language 미부착이라 저장 fp와 절대 불일치 = 죽은 코드였음). DB 재조회 1회도 제거 = 더 가벼움 §0.
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
  //   사유 = 모든 생성물은 회사 소유 = DB 는 무조건 남긴다. X 는 화면에서만 감춘다(useHiddenCards 1벌).
  //   호출자 0 확인 후 제거. 남겨 두면 인증·소유자 확인 없이 id 만으로 남의 여정을 지우는 통로가 열려 있게 된다.

  // 🏆 B1 대표로 올리기 (2026-08-01 베스트갤러리 = docs/2026-07-30 도시버튼·베스트갤러리·BTS 통합.md B절)
  //   관리자(users.role='admin')만 = credit-charge.ts 와 같은 기준(§9 표7 = is_admin·아이디 문자열 판단 금지).
  //   도시 id 는 지정 시점에도 목적지 이름으로 다시 확인해 채운다(2026-08-02 = 저장 시점 자동 채움과 같은 1벌).
  //   크레딧 경로 일절 없음 = 차감 없는 순수 상태 변경. status='representative' = 기존 미사용 값(스키마 변경 0).
  app.post("/api/itineraries/:id/representative", async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "db_unavailable" });

      // 관리자 판정 = users.role 만 본다(§9 표7 단일 기준)
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

      // cityId 교정 = rawData.destination(문자열) → 도시 매칭 단일 관문(2026-08-02 §16 = server/city-match.ts 1벌)
      const cityId = await matchCityIdByName(
        (itinerary.rawData as any)?.destination,
      );
      if (cityId == null) {
        return res.status(400).json({ error: "도시 매칭 실패" });
      }

      // 트랜잭션 1개 = 도시당 대표 1개 보장(①옛 대표 강등 ②이 여정 승격이 함께 성공/함께 실패)
      await db.transaction(async (tx) => {
        // ① 그 도시의 옛 대표 → saved 강등
        await tx
          .update(itineraries)
          .set({ status: "saved", updatedAt: new Date() })
          .where(
            and(
              eq(itineraries.cityId, cityId),
              eq(itineraries.status, "representative"),
            ),
          );
        // ② 이 여정 → representative 승격 + 교정된 cityId 반영
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
  //   캐싱 = raw_data.verification 서브키(여정 지문 fp 동일하면 재호출 안 함 = 비용 0). 새 컬럼/테이블 금지.
  app.post("/api/itineraries/ai-opinion", async (req, res) => {
    try {
      const { itineraryId, itinerary, language } = req.body;
      if (!itinerary || !Array.isArray(itinerary.days)) {
        return res.status(400).json({ error: "itinerary(days[]) required" });
      }

      // ⚠️ 2026-07-03 사장님 SSOT = 동적 콘텐츠(AI 의견 본문) 다국어 대응. 언어가 다르면 캐시도 다시 생성해야 하므로 fp에 언어 포함.
      const fp = `${computeItineraryFingerprint(itinerary)}:${language || "ko"}`;

      // 저장된 여정이면 캐시 확인 (여정 안 바뀌었으면 Gemini 재호출 없이 반환 = $0)
      // ⚠️ 2026-07-03 = existingForCache 보관 = 캐시미스 시 저장 단계에서 재사용(DB 재조회 1회 절약)
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
        // ⚠️ 2026-07-10 = curationFocus 도 metadata 단일 관례(FE 통째 보존)에서 읽음. 옛 top-level 읽기 = 항상 undefined(셀렉 누락) = 폐기 §19.
        curationFocus: itinerary.metadata?.curationFocus,
        // ⚠️ 2026-07-03 = route-prompt.ts buildRouteInputJson()과 동일 = vibeWeights(vibe+weight+percentage) 배열 그대로 전달(이름만 뽑아 가중치 버리지 않음)
        vibeWeights: (itinerary.vibeWeights || []).map((v: any) => ({
          vibe: v.vibe,
          weight: v.weight,
          percentage: v.percentage,
        })),
        travelStyle: itinerary.travelStyle,
        mobilityStyle: itinerary.mobilityStyle,
        // ⚠️ 수정금지(승인필요) 2026-07-10 사장님 SSOT = 교통수단 = 1차 생성 매트릭스 확정값(응답 metadata, FE가 통째 보존)을 그대로 사용.
        //   서버 재계산·기본값 = 폐기 2026-07-10 §19: 값 누락 시 기본값 'Moderate'가 매트릭스를 guide로 뒤집어
        //   대중교통 여정(€527)을 전용차 기준(€1,126)으로 오판(투르 실증). 매트릭스는 1차 생성 때 1회만.
        //   guide/transit 외 값 = 버림(프롬프트 오염 방지) → 프롬프트 보수 기본(transit).
        transportCategory: (itinerary.metadata?.transportCategory === "guide" ||
        itinerary.metadata?.transportCategory === "transit"
          ? itinerary.metadata.transportCategory
          : undefined) as "guide" | "transit" | undefined,
        days: (itinerary.days || []).map((d: any) => ({
          day: d.day,
          // ⚠️ 2026-07-03 = Place 타입(client/types/trip.ts) 실제 필드만 사용. entranceFee=입장료, mealPrice=식사가격.
          //   프롬프트가 안 쓰는 address/type/lat/lng는 안 보냄(토큰 절약).
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

      // 🪙 AI 의견 5크레딧 (2026-07-29 §9)
      //   ⚠️ 수정금지(승인필요) 2026-08-09 사장님 최우선 SSOT = **차감은 완성 시점에만.**
      //     여기는 잔액 **사전확인만**(차감 0) = 부족하면 402(§9 금지 4번 = 헤더 전에 판정).
      //     실제 차감 = 의견이 **실제로 만들어진 뒤**. 옛 "호출 직전 차감" 폐기 = 2026-08-09 §19 —
      //     Gemini 가 실패하면 502 를 받으면서 5크레딧은 이미 사라져 있었다(= 환불 분쟁 소지).
      //   이 줄에 도달했다는 것 = 캐시 미스 = 실제 유료 호출. 캐시 히트(다시 보기)는 위에서 이미 return 되어 여기 안 온다 = 재차감 없음(무료 재열람).
      //   여정 저장(무료)도 이 라우트를 타지 않는다.
      const opinionPayerId = getUserIdFromReq(req);
      if (!(await precheckFeature(res, opinionPayerId, "ai_opinion"))) return;

      const result = await handleAiOpinionRequest(opinionInput);
      if (!result.ok || !result.response) {
        return res.status(502).json({
          error: "AI opinion generation failed",
          details: result.parseError,
        });
      }

      // 🪙 차감 = 여기(의견이 실제로 나온 뒤). 위 사전확인이 잔액을 이미 봤으므로 402 는 안 난다.
      await chargeOnSuccess(opinionPayerId, "ai_opinion", {
        referenceId: itineraryId ? String(itineraryId) : undefined,
        tag: "AI 의견",
      });

      // 저장된 여정이면 raw_data.verification에 결과 병합(캐시 저장). 미저장 신규 여정은 즉석 반환만.
      //   ⚠️ existingForCache 재사용(캐시확인 시 이미 조회함) = DB 재조회 1회 절약.
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
