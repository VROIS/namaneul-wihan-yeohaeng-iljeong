// ═══════════════════════════════════════════════════════════════════════════════
// 내손안에 가이드 API 라우트 (P0-4 통합 스텁, Phase 4에서 구현)
// ═══════════════════════════════════════════════════════════════════════════════
//
// 원본: 내손안에 가이드/server/routes.ts (~95 엔드포인트)
// 참고 파일:
//   - server/gemini.ts — Gemini AI (사진→해설)
//   - server/creditService.ts — 크레딧 로직
//   - server/profileRoutes.ts — 결제/크레딧 API
//   - server/stripeClient.ts — Stripe 연동
//   - server/notificationService.ts — 알림
//   - server/webhookHandlers.ts — Stripe 웹훅
//   - server/standard-template.ts — 공유페이지 HTML
//   - server/googleAuth.ts — Google OAuth
//   - server/kakaoAuth.ts — Kakao OAuth
//   - server/appleAuth.ts — Apple OAuth
//
// Phase 4 구현 시 아래 카테고리별로 엔드포인트 추가:
//   1. 가이드 CRUD (6개)
//   2. 공유/공유페이지 (9개)
//   3. 크레딧/결제 (5개)
//   4. 알림/푸시 (9개)
//   5. 관리자 (27개)
//   6. AI/Gemini (1개)
//   7. 음성/TTS (3개)
//   8. 인증 (4개)

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
