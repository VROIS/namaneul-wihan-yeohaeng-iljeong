import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { cities } from "../shared/schema";
import { count } from "drizzle-orm";
import { seedDefaultCities } from "./config/default-cities-seed"; // 기본 도시 시드 데이터 = server/config/default-cities-seed.ts 분리(2026-07-15 §0 슬림화)
import { registerAdminRoutes } from "./admin-routes";
import { registerAuthRoutes } from "./auth";
import { registerBtsRoutes } from "./bts-routes";
import { registerGuideRoutes } from "./guide-routes";
import { registerExpertRoutes } from "./expert-routes"; // 전문가 문의 API (2026-07-13, docs/2026-07-13 전문가탭 구현계획.md)
import { registerCityPlaceRoutes } from "./city-place-routes";
import { registerItineraryGenerateRoute } from "./itinerary-generate-route";
import { registerItineraryRoutes } from "./itinerary-routes";
import { registerVideoRoutes } from "./video-routes";
import { registerMiscRoutes } from "./misc-routes";
import { registerPaymentRoutes } from "./payment-routes"; // 결제·크레딧 API (2026-07-29, docs/2026-07-29 결제·크레딧 구현.md)

export async function registerRoutes(app: Express): Promise<Server> {
  registerAdminRoutes(app);
  registerAuthRoutes(app);
  registerBtsRoutes(app);
  registerGuideRoutes(app); // 내손안에 가이드 API (Phase 4 구현)
  registerExpertRoutes(app); // 전문가 문의 API (2026-07-13)
  registerCityPlaceRoutes(app); // 도시3 + 장소3 + 진단 + Day 재최적화
  registerItineraryGenerateRoute(app); // POST /api/routes/generate (유료 = 크레딧·DB 저장)
  registerItineraryRoutes(app); // 언어설정 + 여정 CRUD5 + AI 의견 (예산3 = 2026-07-16 §19 완전삭제, 호출자 0 + 500크래시)
  registerVideoRoutes(app); // 영상 상태조회 2종(DB read-only) = klingai/seedance 삭제(2026-07-16 §19), 5단계 Omni Flash 재배선 대상
  registerMiscRoutes(app); // 지도HTML + 헬스체크
  registerPaymentRoutes(app); // 잔액·내역·단가표 + Stripe 결제창 + 직접통보(충전 유일 경로) (2026-07-29 §9)

  const httpServer = createServer(app);

  autoSeedDefaultData();

  return httpServer;
}

async function autoSeedDefaultData() {
  try {
    const [cityCount] = await db.select({ count: count() }).from(cities);
    if (cityCount.count === 0) {
      console.log(
        "[AutoSeed] 도시 테이블이 비어있습니다. 기본 데이터를 입력합니다...",
      );
      await seedDefaultCities();
      console.log("[AutoSeed] 도시 시드 완료");
    }
  } catch (error) {
    console.error("[AutoSeed] 자동 시드 오류:", error);
  }
}
