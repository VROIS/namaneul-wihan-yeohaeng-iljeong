/**
 * ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 완전 재작성 (= 4,800 줄 → ~700 줄)
 * = 옛 ~130 endpoint 완전 삭제 = 크롤러/MCP/시드/sentiment/위기수집 모두 폐기
 * = 유지 = dashboard / control-tower / api-keys / guide-prices / trip-alerts(GET) (exchange-rates·transport(france)·budget = 호출자 0 = 2026-07-16 §19 삭제)
 * = dashboard + control-tower = PSR + cities + apiServices 만 사용 (= places/dataSyncLog/geminiWebSearchCache 의존 제거)
 * = 진입 파일 슬림화(2026-07-16 §0) = 핸들러/헬퍼는 server/admin/*.ts 로 순수 이동, 여기는 등록 호출만
 */
import type { Express } from "express";
import { registerDashboardRoutes } from "./admin/dashboard-routes";
import { registerGuidePricesRoutes } from "./admin/guide-prices-routes";
import { registerApiKeysRoutes } from "./admin/api-keys-routes";
import { registerMiscAdminRoutes } from "./admin/misc-routes";

export function registerAdminRoutes(app: Express) {
  registerDashboardRoutes(app);
  registerGuidePricesRoutes(app);
  registerApiKeysRoutes(app);
  registerMiscAdminRoutes(app);
}
