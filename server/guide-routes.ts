// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT (§12 4단계) = 가이드 미니앱 서버 배선.
// = 레거시 카메라 모듈(client/screens/guide, 내부 0수정)이 부르는 엔드포인트 = 여기서 배선.
// = 모듈 backendApi.js·PromptService.js 가 기대하는 인터페이스에 맞춤(모듈 불가침 = 서버가 맞춤).
//   ① POST /api/analyze            = 사진 해설 (geminiVision, §16 단일진입점 재사용). JSON 응답.
//   ② GET  /api/prompts/:lang/:type = 언어별 페르소나 (DB prompts, is_active+version DESC = §12 함정 필터).
//   ③ GET  /api/voice-configs       = 웹TTS 음성 우선순위 (DB voice_configs).
//   ④ /api/guides (batch·목록·삭제)  = 보관함 (DB guides). 당분간 사장님만 = auth.ts 재사용.
// ═══════════════════════════════════════════════════════════════════════════════

import type { Express, Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db as _db } from "./db";
import { guides, prompts, voiceConfigs } from "../shared/schema";
import { geminiVision } from "./services/shared/geminiClient";

// ⚠️ db 는 DB 미연결 시 null 가능(server/db.ts) = 라우트 진입 시 확정(bts-routes 패턴). null 이면 throw → 각 라우트 catch 가 503.
function getDb() {
  if (!_db) throw new Error("DB unavailable");
  return _db;
}

// ⚠️ 인증 = auth.ts 토큰형식("simple_auth_token_v1_"+id) 파싱(전문가탭 패턴 재사용, §16). Bearer 없으면 null.
function userIdFromReq(req: Request): string | null {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+simple_auth_token_v1_(.+)$/);
  return m ? m[1] : null;
}

export function registerGuideRoutes(app: Express): void {
  // === 헬스 체크 ===
  app.get("/api/guide/health", (_req, res) => {
    res.json({ status: "ok", service: "guide", version: "2.0.0" });
  });

  // ① 사진 해설 = geminiVision (JSON 응답 = 모듈 analyzeImageViaServer 가 response.json() 기대).
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image, prompt, language } = req.body || {};
      if (!image)
        return res.status(400).json({ error: "image(base64) required" });
      // 페르소나 = 요청 prompt 우선, 없으면 언어 기본. (모듈 useAI 가 DB 페르소나를 prompt 로 넘김)
      const out = await geminiVision(
        String(image),
        prompt || "이 이미지를 여행자에게 친근하게 해설해줘.",
        {
          systemPrompt: prompt || undefined,
          contextId: "runtime",
          rawTag: "guide-analyze",
        },
      );
      // 모듈은 result.description || result.text 를 읽음 → 둘 다 담아 하위호환.
      res.json({
        description: out.text,
        text: out.text,
        language: language || "ko",
      });
    } catch (e: any) {
      console.error("[guide/analyze]", e?.message || e);
      res.status(500).json({ error: "해설 생성 실패" });
    }
  });

  // ② 언어별 페르소나 = DB prompts. ⚠️ §12 함정 = 중복·구버전 존재 → is_active + version DESC 1건.
  app.get("/api/prompts/:language/:type", async (req, res) => {
    try {
      const { language, type } = req.params;
      const rows = await getDb()
        .select()
        .from(prompts)
        .where(
          and(
            eq(prompts.language, language),
            eq(prompts.type, type),
            eq(prompts.isActive, true),
          ),
        )
        .orderBy(desc(prompts.version))
        .limit(1);
      if (!rows.length)
        return res.status(404).json({ error: "prompt not found" });
      res.json({
        content: rows[0].content,
        language,
        type,
        version: rows[0].version,
      });
    } catch (e: any) {
      console.error("[guide/prompts]", e?.message || e);
      res.status(500).json({ error: "프롬프트 조회 실패" });
    }
  });

  // ③ 웹TTS 음성 우선순위 = DB voice_configs (모듈 웹앱 로직이 langCode·platform 별로 캐시).
  app.get("/api/voice-configs", async (_req, res) => {
    try {
      const rows = await getDb()
        .select()
        .from(voiceConfigs)
        .where(eq(voiceConfigs.isActive, true));
      res.json(
        rows.map((r) => ({
          langCode: r.langCode,
          platform: r.platform,
          voicePriorities: r.voicePriorities,
          excludeVoices: r.excludeVoices || [],
        })),
      );
    } catch (e: any) {
      console.error("[guide/voice-configs]", e?.message || e);
      res.status(500).json({ error: "음성설정 조회 실패" });
    }
  });

  // ④ 보관함 저장 = 모듈 ArchiveService.saveToServer 가 { userId, language, guides:[...] } 로 POST.
  app.post("/api/guides/batch", async (req, res) => {
    try {
      const reqUserId = userIdFromReq(req);
      const { userId, language, guides: items } = req.body || {};
      const owner = reqUserId || userId; // 인증 우선, 없으면 바디 userId(당분간 사장님만)
      if (!owner) return res.status(401).json({ error: "userId required" });
      if (!Array.isArray(items) || !items.length)
        return res.status(400).json({ error: "guides required" });
      const inserted = await getDb()
        .insert(guides)
        .values(
          items.map((g: any) => ({
            userId: owner,
            localId: g.localId || null,
            title: g.title || "여행 기록",
            description: g.description || null,
            imageUrl: g.imageDataUrl || g.imageUrl || null, // 모듈은 data:image base64 인라인 전달
            aiGeneratedContent: g.aiGeneratedContent || null,
            latitude: g.latitude ?? null,
            longitude: g.longitude ?? null,
            locationName: g.locationName || null,
            language: g.language || language || "ko",
            voiceLang: g.voiceLang || null,
            voiceName: g.voiceName || null,
          })),
        )
        .returning({ id: guides.id });
      res.json({ guideIds: inserted.map((r) => r.id) });
    } catch (e: any) {
      console.error("[guide/guides/batch]", e?.message || e);
      res.status(500).json({ error: "보관함 저장 실패" });
    }
  });

  // ④ 보관함 목록 = GET /api/guides?userId=
  app.get("/api/guides", async (req, res) => {
    try {
      const owner = userIdFromReq(req) || (req.query.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      const rows = await getDb()
        .select()
        .from(guides)
        .where(eq(guides.userId, owner))
        .orderBy(desc(guides.createdAt));
      res.json(rows);
    } catch (e: any) {
      console.error("[guide/guides]", e?.message || e);
      res.status(500).json({ error: "보관함 조회 실패" });
    }
  });

  // ④ 보관함 삭제 = DELETE /api/guides/:id (본인 것만).
  app.delete("/api/guides/:id", async (req, res) => {
    try {
      const owner = userIdFromReq(req) || (req.body?.userId as string);
      if (!owner) return res.status(401).json({ error: "userId required" });
      await getDb()
        .delete(guides)
        .where(and(eq(guides.id, req.params.id), eq(guides.userId, owner)));
      res.json({ success: true });
    } catch (e: any) {
      console.error("[guide/guides delete]", e?.message || e);
      res.status(500).json({ error: "보관함 삭제 실패" });
    }
  });
}
