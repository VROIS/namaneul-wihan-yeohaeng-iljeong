// ═══════════════════════════════════════════════════════════════════════════════
// 내손안에 가이드 API 라우트 (P0-4 통합 스텁, Phase 4에서 구현)
// ═══════════════════════════════════════════════════════════════════════════════
//
// 원본: 내손안에 가이드/server/routes.ts (~95 엔드포인트)
// 레거시 참고 파일 = 원본은 레거시 레포(내손안에 가이드)에 보존, 이 레포 사본은 미사용으로 삭제 = 2026-07-15 §19
// (크레딧 로직 = server/creditService.ts 는 재사용 예정으로 유지)
//
// 인증 = 이미 server/auth.ts 1벌로 구현·운영 중(재구현 금지 §16)
//
// Phase 4 구현 시 아래 카테고리별로 엔드포인트 추가:
//   1. 가이드 CRUD (6개)
//   2. 공유/공유페이지 (9개) (참조 구현 = 레거시 레포에 보존, 이 레포 사본은 삭제됨 §19)
//   3. 크레딧/결제 (5개) (참조 구현 = 레거시 레포에 보존, 이 레포 사본은 삭제됨 §19)
//   4. 알림/푸시 (9개)
//   5. 관리자 (27개)
//   6. AI/Gemini (1개)
//   7. 음성/TTS (3개)

import type { Express } from "express";

export function registerGuideRoutes(app: Express): void {
  // === 헬스 체크 ===
  app.get("/api/guide/health", (_req, res) => {
    res.json({ status: "ok", service: "guide", version: "2.0.0" });
  });

  // === Phase 4에서 추가될 라우트 ===
  // TODO: 가이드 CRUD — GET/POST/DELETE /api/guides
  // TODO: 공유페이지 — GET /s/:id, POST /api/share
  // TODO: 크레딧 — POST /api/credits/purchase
  // TODO: 알림 — GET/POST /api/notifications
  // TODO: 푸시 — POST /api/push/subscribe
  // TODO: 음성설정 — GET /api/voice-configs
  // TODO: AI해설 — POST /api/gemini
}
