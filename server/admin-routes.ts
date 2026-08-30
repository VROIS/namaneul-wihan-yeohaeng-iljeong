/** ⚠️ 수정금지(승인필요) 2026-05-23 = 사용자 SSOT = 완전 재작성 (= 4,800 줄 → ~700 줄) */
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
